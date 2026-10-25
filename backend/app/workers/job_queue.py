"""Single-heavy-job queue with persisted state and SSE broadcasting."""

from __future__ import annotations

import asyncio
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings
from app.db import (
    create_job,
    get_job,
    get_pending_jobs,
    update_job,
    update_job_progress,
)
from app.services.engine import EngineError, EngineProgress, engine

logger = logging.getLogger("job_queue")


def _is_memory_pressure(exc: Exception) -> bool:
    text = str(exc)
    return "System memory pressure" in text or "MemoryError" in text


class JobQueue:
    def __init__(self) -> None:
        self._queue: Optional[asyncio.Queue[str]] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listeners: Dict[str, List[asyncio.Queue]] = {}
        self._worker_task: Optional[asyncio.Task] = None
        self._active_task: Optional[asyncio.Task] = None
        self._active_job_id: Optional[str] = None

    def queue(self) -> asyncio.Queue[str]:
        loop = asyncio.get_running_loop()
        if self._queue is None or self._loop is not loop:
            self._queue = asyncio.Queue()
            self._loop = loop
        return self._queue

    async def start_worker(self) -> None:
        self.queue()
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._process_queue())
        for job in await get_pending_jobs():
            await self.queue().put(job["id"])
        logger.info("Job queue worker started")

    async def stop_worker(self) -> None:
        if self._active_task and not self._active_task.done():
            self._active_task.cancel()
            try:
                await self._active_task
            except asyncio.CancelledError:
                pass
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def add_listener(self, job_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.setdefault(job_id, []).append(queue)
        return queue

    def remove_listener(self, job_id: str, queue: asyncio.Queue) -> None:
        listeners = self._listeners.get(job_id, [])
        if queue in listeners:
            listeners.remove(queue)
        if not listeners:
            self._listeners.pop(job_id, None)

    async def broadcast(self, job_id: str, payload: Dict[str, Any]) -> None:
        for queue in list(self._listeners.get(job_id, [])):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                logger.warning("SSE listener queue full for %s", job_id)

    async def submit_job(self, job_data: Dict[str, Any]) -> str:
        job_id = job_data.get("id") or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        job = {
            **job_data,
            "id": job_id,
            "status": "queued",
            "progress": 0,
            "stage_name": "Queued",
            "created_at": now,
            "updated_at": now,
        }
        await create_job(job)
        await self.queue().put(job_id)
        await self.broadcast(job_id, self._event(job_id, "queued", 0, "Queued"))
        return job_id

    async def cancel_job(self, job_id: str) -> bool:
        job = await get_job(job_id)
        if not job:
            return False
        if job["status"] in {"completed", "failed", "cancelled"}:
            return False
        await update_job(
            job_id,
            status="cancelled",
            stage_name="Cancelled by user",
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        await self.broadcast(job_id, self._event(job_id, "cancelled", 0, "Cancelled by user"))
        if self._active_job_id == job_id and self._active_task and not self._active_task.done():
            await engine.cancel(job_id)
            self._active_task.cancel()
        return True

    def _event(self, job_id: str, status: str, progress: int, stage: str, **extra: Any) -> Dict[str, Any]:
        return {
            "job_id": job_id,
            "status": status,
            "progress": progress,
            "stage_name": stage,
            **extra,
        }

    async def _process_queue(self) -> None:
        while True:
            job_id = await self.queue().get()
            try:
                job = await get_job(job_id)
                if not job or job["status"] != "queued":
                    continue
                self._active_job_id = job_id
                self._active_task = asyncio.create_task(self._run_job(job))
                try:
                    await self._active_task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    logger.exception("Job %s failed", job_id)
            finally:
                self._active_job_id = None
                self._active_task = None
                self.queue().task_done()

    async def _run_job(self, job: Dict[str, Any]) -> None:
        job_id = job["id"]
        await update_job(
            job_id,
            status="preparing",
            progress=2,
            stage_name="Preparing engine",
            started_at=datetime.now(timezone.utc).isoformat(),
            error_message=None,
        )
        await self.broadcast(job_id, self._event(job_id, "preparing", 2, "Preparing engine"))

        caffeinate = None
        try:
            # Keep macOS awake while a render is active. This is released in finally,
            # including cancel and failure paths.
            try:
                caffeinate = await asyncio.create_subprocess_exec(
                    "caffeinate", "-dimsu",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                logger.info("Started caffeinate for job %s", job_id)
            except (FileNotFoundError, OSError) as exc:
                logger.info("caffeinate unavailable: %s", exc)

            await self._unload_ollama()
            source_audio = None
            params = job.get("params") or {}
            if job["type"] == "cover":
                source = params.get("source_audio_path")
                if not source or not Path(source).exists():
                    raise EngineError("Cover source audio is missing")
                source_audio = Path(source)

            async def on_progress(event: EngineProgress) -> None:
                await update_job_progress(job_id, event.stage, event.progress, event.message)
                await self.broadcast(
                    job_id,
                    self._event(job_id, event.stage, event.progress, event.message),
                )

            attempts = max(1, settings.mlx_memory_retry_count + 1)
            result = None
            for attempt in range(attempts):
                try:
                    result = await engine.run(job, on_progress, source_audio=source_audio)
                    break
                except EngineError as exc:
                    if not _is_memory_pressure(exc):
                        raise
                    if attempt + 1 >= attempts:
                        raise EngineError(
                            f"{exc}\n\nThe Mac ran out of memory headroom. "
                            "Close unused Safari tabs or other memory-heavy apps, then retry."
                        ) from exc
                    message = (
                        "Memory pressure is high. Close unused Safari tabs/apps; "
                        f"retrying in {settings.mlx_memory_retry_delay_seconds}s "
                        f"({attempt + 1}/{attempts - 1})."
                    )
                    logger.warning("Job %s memory pressure; retry %s/%s", job_id, attempt + 1, attempts - 1)
                    await update_job_progress(job_id, "preparing", 2, message)
                    await self.broadcast(job_id, self._event(job_id, "preparing", 2, message))
                    await asyncio.sleep(settings.mlx_memory_retry_delay_seconds)

            await update_job(
                job_id,
                status="completed",
                progress=100,
                stage_name="Complete",
                audio_path=str(result.audio_path),
                duration_seconds=round(result.duration_seconds, 2),
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            await self.broadcast(
                job_id,
                self._event(
                    job_id,
                    "completed",
                    100,
                    "Complete",
                    audio_url=f"/api/outputs/{job_id}/audio.flac",
                    duration_seconds=round(result.duration_seconds, 2),
                ),
            )
            logger.info("Job %s completed in %.1fs of audio", job_id, result.duration_seconds)
        except asyncio.CancelledError:
            await update_job_progress(job_id, "cancelled", 0, "Cancelled by user")
            await self.broadcast(job_id, self._event(job_id, "cancelled", 0, "Cancelled by user"))
            raise
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            await update_job(
                job_id,
                status="failed",
                stage_name="Failed",
                error_message=str(exc)[:2000],
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            await self.broadcast(
                job_id,
                self._event(job_id, "failed", 0, "Failed", error=str(exc)[:500]),
            )
        finally:
            if caffeinate is not None and caffeinate.returncode is None:
                caffeinate.terminate()
                try:
                    await asyncio.wait_for(caffeinate.wait(), timeout=5)
                except (asyncio.TimeoutError, TimeoutError):
                    caffeinate.kill()
                    await caffeinate.wait()
                logger.info("Stopped caffeinate for job %s", job_id)

    async def _unload_ollama(self) -> None:
        model = settings.default_ollama_model
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                await client.post(
                    f"{settings.ollama_url}/api/generate",
                    json={"model": model, "prompt": "", "keep_alive": 0},
                )
        except Exception as exc:
            logger.info("Ollama unload skipped: %s", exc)

    async def delete_outputs(self, job_id: str) -> None:
        target = settings.outputs_path / job_id
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)


job_queue = JobQueue()
