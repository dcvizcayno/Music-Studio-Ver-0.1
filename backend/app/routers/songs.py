"""Song generation, covers, SSE progress, and audio delivery."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional

import aiofiles
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings
from app.db import get_job
from app.schemas.songs import GenerateSongRequest
from app.serializers import job_public
from app.workers.job_queue import job_queue

logger = logging.getLogger("songs_router")
router = APIRouter(prefix="/api", tags=["Songs"])

JOB_ID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
ALLOWED_AUDIO = {".wav", ".mp3", ".m4a", ".flac", ".aiff", ".aif", ".ogg", ".opus"}
TERMINAL = {"completed", "failed", "cancelled"}


def _require_job_id(job_id: str) -> None:
    if not JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")


async def _save_upload(upload: UploadFile, target: Path) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    total = 0
    async with aiofiles.open(target, "wb") as handle:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                await handle.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Audio exceeds {settings.max_upload_mb} MB")
            await handle.write(chunk)
    return total


@router.post("/songs/generate")
async def generate_song(request: GenerateSongRequest):
    if not request.lyrics.strip():
        raise HTTPException(status_code=400, detail="Lyrics cannot be empty")
    if not request.style_tags.strip():
        raise HTTPException(status_code=400, detail="Style tags cannot be empty")

    duration = max(15, min(settings.mlx_max_duration, request.duration_seconds))
    steps = request.steps if request.steps in {8, 16, 32} else settings.mlx_default_steps
    job_data = {
        "title": request.title.strip() or "Untitled Song",
        "type": "text_to_song",
        "idea": request.idea,
        "lyrics": request.lyrics,
        "style_tags": request.style_tags,
        "model_name": "YuE2-3B MLX 8-bit",
        "qwen_model": request.qwen_model,
        "seed": request.seed,
        "steps": steps,
        "cfg": 1.0,
        "duration_seconds": duration,
        "params": {
            "cot": request.cot,
            "nar_steps": steps,
            "duration_seconds": duration,
            "precision": settings.mlx_precision,
        },
    }
    job_id = await job_queue.submit_job(job_data)
    job = await get_job(job_id)
    return job_public(job)


@router.post("/songs/cover")
async def generate_cover(
    title: str = Form("Cover"),
    style_tags: str = Form(...),
    lyrics: str = Form(""),
    seed: Optional[int] = Form(None),
    steps: int = Form(8),
    duration_seconds: int = Form(120),
    rights_acknowledged: bool = Form(False),
    audio_file: UploadFile = File(...),
):
    if not rights_acknowledged:
        raise HTTPException(
            status_code=400,
            detail="Confirm you own or have permission to use the reference recording",
        )
    if not style_tags.strip():
        raise HTTPException(status_code=400, detail="Target style cannot be empty")

    suffix = Path(audio_file.filename or "source.wav").suffix.lower()
    if suffix not in ALLOWED_AUDIO:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {suffix}")

    upload_id = str(uuid.uuid4())
    target = settings.uploads_path / upload_id / f"source{suffix}"
    await _save_upload(audio_file, target)

    duration = max(15, min(300, duration_seconds))
    steps = steps if steps in {8, 16, 32} else settings.mlx_default_steps
    job_data = {
        "title": title.strip() or "Cover",
        "type": "cover",
        "lyrics": lyrics,
        "style_tags": style_tags,
        "model_name": "YuE2-3B MLX 8-bit",
        "seed": seed,
        "steps": steps,
        "cfg": 1.0,
        "duration_seconds": duration,
        "params": {
            "source_audio_path": str(target),
            "cot": "melody",
            "nar_steps": steps,
            "duration_seconds": duration,
            "precision": settings.mlx_precision,
        },
    }
    job_id = await job_queue.submit_job(job_data)
    job = await get_job(job_id)
    return job_public(job)


@router.get("/songs/{job_id}")
async def get_song(job_id: str):
    _require_job_id(job_id)
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_public(job)


@router.post("/songs/{job_id}/cancel")
async def cancel_song(job_id: str):
    _require_job_id(job_id)
    cancelled = await job_queue.cancel_job(job_id)
    return {"cancelled": cancelled, "job_id": job_id}


@router.get("/songs/{job_id}/events")
async def stream_job_events(job_id: str, request: Request):
    _require_job_id(job_id)
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        snapshot = job_public(job)
        yield f"data: {json.dumps(snapshot)}\n\n"
        if snapshot["status"] in TERMINAL:
            return

        listener = job_queue.add_listener(job_id)
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(listener.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("status") in TERMINAL:
                    break
        finally:
            job_queue.remove_listener(job_id, listener)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/outputs/{job_id}/audio.{extension}")
async def get_audio(job_id: str, extension: str):
    _require_job_id(job_id)
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    source = settings.outputs_path / job_id / "audio.flac"
    if not source.exists():
        raise HTTPException(status_code=404, detail="Audio is not ready")

    if extension == "flac":
        return FileResponse(str(source), media_type="audio/flac", filename=f"{_safe_name(job)}.flac")
    if extension == "wav":
        target = source.with_suffix(".wav")
        if not target.exists():
            await _to_wav(source, target)
        return FileResponse(str(target), media_type="audio/wav", filename=f"{_safe_name(job)}.wav")
    raise HTTPException(status_code=404, detail="Use .flac or .wav")


def _safe_name(job: dict) -> str:
    base = "".join(c for c in (job.get("title") or "song") if c.isalnum() or c in " -_").strip()
    return (base or "song")[:80]


async def _to_wav(source: Path, target: Path) -> None:
    proc = await asyncio.create_subprocess_exec(
        settings.ffmpeg_bin, "-y", "-i", str(source),
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(target),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0 or not target.exists():
        raise HTTPException(status_code=500, detail=f"WAV conversion failed: {stderr.decode()[:300]}")
