"""Real YuE2 generation through the mlx-Yue CLI.

The engine is deliberately a subprocess: MLX keeps multi-GB weights resident,
and a subprocess gives clean cancellation and memory release between jobs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import signal
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

from app.config import settings

logger = logging.getLogger("mlx_engine")


class EngineError(RuntimeError):
    pass


class EngineUnavailable(EngineError):
    pass


@dataclass
class EngineProgress:
    stage: str
    progress: int
    message: str
    eta_seconds: Optional[int] = None


@dataclass
class EngineResult:
    audio_path: Path
    duration_seconds: float
    sample_rate: int
    channels: int
    abc: Optional[str] = None
    engine_dir: Optional[Path] = None
    meta: dict = field(default_factory=dict)


ProgressCallback = Callable[[EngineProgress], Awaitable[None]]


_STAGE_RULES = (
    ("Verifying model files", "preparing", 3),
    ("Resolving model files", "preparing", 3),
    ("Loading model", "preparing", 6),
    ("Loading BF16 acoustic conditioning", "preparing", 8),
    ("Loading acoustic model", "preparing", 8),
    ("Loading MLX audio decoder", "rendering", 94),
    ("Planning score", "planning", 15),
    ("Generating song", "generating", 38),
    ("Synthesizing audio", "rendering", 80),
    ("Decoding audio", "rendering", 95),
)

_PROGRESS_RE = re.compile(
    r"\[(?:YuE2|SheetSage2)\]\s+(Starting|Running|Completed|Failed|Cancelled|"
    r"Limit reached)\s+(?P<label>.+?):\s*(?P<detail>.*)$"
)
_FRACTION_RE = re.compile(r"(\d+)\s*/\s*(\d+)")


def _stage_for(label: str) -> tuple[str, int]:
    for prefix, stage, base in _STAGE_RULES:
        if label.startswith(prefix):
            return stage, base
    return "preparing", 2


def parse_progress_line(line: str) -> Optional[EngineProgress]:
    match = _PROGRESS_RE.search(line.strip())
    if not match:
        return None
    label = match.group("label").strip()
    detail = match.group("detail").strip()
    state = match.group(1)
    stage, base = _stage_for(label)

    progress = base
    fraction = _FRACTION_RE.search(detail)
    if fraction:
        done, total = int(fraction.group(1)), int(fraction.group(2))
        ratio = min(1.0, max(0.0, done / total)) if total else 0.0
        if stage == "planning":
            progress = 15 + int(20 * ratio)
        elif stage == "generating":
            progress = 38 + int(40 * ratio)
        elif stage == "rendering" and label.startswith("Synthesizing"):
            progress = 80 + int(14 * ratio)
        elif stage == "rendering" and label.startswith("Decoding"):
            progress = 95 + int(4 * ratio)

    if state == "Failed":
        progress = min(progress, 2)

    return EngineProgress(
        stage=stage,
        progress=max(0, min(99, progress)),
        message=f"{label}: {detail}".strip(": "),
    )


class MlxEngine:
    def __init__(self) -> None:
        self._procs: dict[str, asyncio.subprocess.Process] = {}

    @property
    def binary(self) -> Path:
        return Path(settings.mlx_yue_bin)

    @property
    def model_dir(self) -> Path:
        return Path(settings.mlx_model_dir)

    @property
    def vae_dir(self) -> Path:
        return Path(settings.mlx_vae_dir)

    def availability(self) -> tuple[bool, str]:
        checks = {
            "mlx-yue binary": self.binary,
            "AR weights": self.model_dir / "ar-8bit.safetensors",
            "conversion metadata": self.model_dir / "conversion.json",
            "VAE weights": self.vae_dir / "model.safetensors",
            "ffmpeg": Path(settings.ffmpeg_bin),
            "ffprobe": Path(settings.ffprobe_bin),
        }
        missing = [name for name, path in checks.items() if not path.exists()]
        if missing:
            return False, "Missing " + ", ".join(missing)
        return True, "mlx-Yue 8-bit ready"

    def _command(self, request_path: Path, engine_dir: Path, cover_audio: Optional[Path]) -> list[str]:
        base = [
            str(self.binary),
            "cover" if cover_audio else "generate",
            str(request_path),
            "--model", str(self.model_dir),
            "--vae", str(self.vae_dir),
            "--precision", settings.mlx_precision,
            "--output", str(engine_dir),
            "--memory-budget-gib", str(settings.mlx_memory_budget_gb),
        ]
        if cover_audio:
            base.extend([
                "--audio", str(cover_audio),
                "--task", "melody-full",
                "--cache-dir", settings.hf_home,
            ])
        elif settings.mlx_offline:
            base.append("--offline")
        return base

    def build_request(self, job: dict[str, Any], cover: bool = False) -> dict[str, Any]:
        params = job.get("params") or {}
        duration = int(job.get("duration_seconds") or params.get("duration_seconds") or 60)
        duration = max(15, min(int(settings.mlx_max_duration), duration))
        steps = int(job.get("steps") or params.get("nar_steps") or settings.mlx_default_steps)
        steps = max(1, min(64, steps))
        cot = "melody" if cover else str(params.get("cot") or "full")
        if cot not in {"full", "melody", "off"}:
            cot = "full"

        request: dict[str, Any] = {
            "id": job["id"],
            "style": job.get("style_tags") or params.get("style_tags") or "",
            "lyrics": job.get("lyrics") or "",
            "cot": cot,
            "seed": int(job.get("seed") or params.get("seed") or 0),
            "generation_config": {"ode_steps": steps},
            "semantic_sampling": {"max_tokens": max(200, min(9000, duration * 25))},
        }
        if cot == "full":
            request["abc_sampling"] = {"max_tokens": 4096}
        if params.get("abc"):
            request["abc"] = str(params["abc"])
            request["cot"] = "melody"
        return request

    async def run(
        self,
        job: dict[str, Any],
        on_progress: ProgressCallback,
        source_audio: Optional[Path] = None,
    ) -> EngineResult:
        ok, detail = self.availability()
        if not ok:
            raise EngineUnavailable(detail)

        job_id = job["id"]
        job_dir = settings.outputs_path / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        engine_dir = job_dir / "engine"
        if engine_dir.exists():
            shutil.rmtree(engine_dir)
        request_path = job_dir / "request.json"
        request = self.build_request(job, cover=source_audio is not None)
        request_path.write_text(json.dumps(request, indent=2), encoding="utf-8")

        command = self._command(request_path, engine_dir, source_audio)
        env = os.environ.copy()
        env.update({
            "PYTHONUNBUFFERED": "1",
            "MLX_ENABLE_TF32": "0",
            "HF_HOME": settings.hf_home,
            "PATH": f"{Path(settings.ffmpeg_bin).parent}:{env.get('PATH', '')}",
        })
        cwd = str(self.binary.resolve().parents[2])

        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cwd,
            env=env,
            start_new_session=True,
        )
        self._procs[job_id] = proc
        tail: list[str] = []
        last_progress: Optional[EngineProgress] = None

        async def consume() -> int:
            nonlocal last_progress
            assert proc.stdout is not None
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                tail.append(line)
                del tail[:-40]
                parsed = parse_progress_line(line)
                if parsed and (last_progress is None or parsed.progress >= last_progress.progress):
                    last_progress = parsed
                    await on_progress(parsed)
            return await proc.wait()

        try:
            async with asyncio.timeout(settings.mlx_job_timeout_seconds):
                returncode = await consume()
        except TimeoutError as exc:
            await self._terminate(job_id, proc)
            raise EngineError(
                f"Generation exceeded {settings.mlx_job_timeout_seconds}s. "
                "Reduce duration or NAR steps."
            ) from exc
        finally:
            if proc.returncode is None:
                await self._terminate(job_id, proc)
            self._procs.pop(job_id, None)

        audio_files = sorted(engine_dir.rglob("audio.flac"))
        if not audio_files:
            audio_files = sorted(engine_dir.rglob("audio.wav"))
        if not audio_files:
            detail = "\n".join(tail[-12:]) or f"mlx-yue exited with code {returncode}"
            raise EngineError(f"mlx-yue failed: {detail}")

        # mlx-yue exits 1 when a render is truncated (the generation limit was hit)
        # but still writes a playable artifact. Keep the audio and record the flag.
        if returncode != 0:
            logger.warning("mlx-yue exited %s but produced audio; preserving truncated render", returncode)
        audio = audio_files[0]
        duration, rate, channels = await probe_audio(audio)
        abc = None
        for candidate in engine_dir.rglob("score.abc"):
            abc = candidate.read_text(encoding="utf-8", errors="replace")
            break
        meta: dict[str, Any] = {"command": command, "request": request, "exit_code": returncode}
        result_json = next(engine_dir.rglob("result.json"), None)
        if result_json and result_json.exists():
            try:
                meta["result"] = json.loads(result_json.read_text(encoding="utf-8"))
            except Exception:
                pass

        final_dir = settings.outputs_path / job_id
        final_dir.mkdir(parents=True, exist_ok=True)
        final_audio = final_dir / "audio.flac"
        if audio.resolve() != final_audio.resolve():
            shutil.copy2(audio, final_audio)
        if abc:
            (final_dir / "score.abc").write_text(abc, encoding="utf-8")

        return EngineResult(
            audio_path=final_audio,
            duration_seconds=duration,
            sample_rate=rate,
            channels=channels,
            abc=abc,
            engine_dir=engine_dir,
            meta=meta,
        )

    async def _terminate(self, job_id: str, proc: Optional[asyncio.subprocess.Process] = None) -> None:
        proc = proc or self._procs.get(job_id)
        if proc is None or proc.returncode is not None:
            return
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(proc.wait(), timeout=6)
        except (asyncio.TimeoutError, TimeoutError):
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            await proc.wait()

    async def cancel(self, job_id: str) -> None:
        await self._terminate(job_id)


async def probe_audio(path: Path) -> tuple[float, int, int]:
    proc = await asyncio.create_subprocess_exec(
        settings.ffprobe_bin,
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise EngineError(f"ffprobe failed: {stderr.decode(errors='replace')[:400]}")
    data = json.loads(stdout.decode("utf-8", errors="replace"))
    duration = float(data.get("format", {}).get("duration") or 0.0)
    stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    return duration, int(stream.get("sample_rate") or 0), int(stream.get("channels") or 0)


engine = MlxEngine()
