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


_GENDER_RE = re.compile(
    r"\b(?:male|female)\b(?:\s+(?:vocal|vocals|voice|voices|singer|singers|lead|leads|vocalist))?",
    re.IGNORECASE,
)


def apply_vocal_gender(style: str, gender: Optional[str]) -> str:
    """Override any vocal-gender wording and append the selected YuE2 style token."""
    if gender not in {"male", "female"}:
        return style
    cleaned = _GENDER_RE.sub("", style or "")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s*,\s*", ", ", cleaned)
    cleaned = re.sub(r"(?:,\s*){2,}", ", ", cleaned).strip(" ,")
    return f"{cleaned}, {gender} vocal" if cleaned else f"{gender} vocal"



_SECTION_RE = re.compile(r"\[([^\]]+)\]")
_SECTION_LABELS = (
    ("final chorus", "Final Chorus"), ("pre-chorus", "Pre-Chorus"),
    ("post-chorus", "Post-Chorus"), ("instrumental", "Instrumental"),
    ("chorus", "Chorus"), ("verse", "Verse"), ("bridge", "Bridge"),
    ("intro", "Intro"), ("outro", "Outro"), ("hook", "Hook"),
    ("refrain", "Refrain"),
)


def style_influence_cfg(value: int) -> float:
    """Neutral 50% = YuE2's default cfg_scale 1.0."""
    pct = max(0, min(100, int(value)))
    if pct <= 50:
        return round(0.5 + pct / 100.0, 2)
    return round(1.0 + (pct - 50) / 50.0 * 0.6, 2)


def prepare_cover_lyrics(lyrics: str) -> str:
    """Normalize production-only bracket tags into YuE2 section tags.

    YuE2 understands section tags such as [Verse] and [Chorus]; arbitrary
    production notes like [Piano Intro | soft] can be read as lyric text.
    """
    if not lyrics:
        return ""
    text = lyrics.replace("\r\n", "\n").replace("\r", "\n")
    output = []
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            output.append("")
            continue
        tags = _SECTION_RE.findall(line)
        if tags:
            labels = []
            for tag in tags:
                lowered = tag.lower()
                for needle, label in _SECTION_LABELS:
                    if needle in lowered:
                        if label not in labels:
                            labels.append(label)
                        break
            if labels:
                output.append(" ".join(f"[{label}]" for label in labels))
            # Drop production-only bracket lines entirely.
            continue
        output.append(line)
    cleaned = "\n".join(output)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def with_vocal_consistency(style: str) -> str:
    suffix = "consistent lead vocal, same singer throughout, stable vocal timbre, sing the supplied lyrics exactly, no improvised lyrics"
    if suffix in style.lower():
        return style
    return f"{style.rstrip(' ,')}, {suffix}" if style.strip() else suffix


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

    def cleanup_stale_processes(self) -> int:
        """Kill orphaned mlx-yue processes left by a backend crash/restart.

        The Lyra engine uses a per-user flock for GPU ownership. If the parent
        backend dies without reaping the child, that child keeps the lock and
        every new cover fails with "Another Lyra process owns the GPU".
        """
        import psutil

        killed = 0
        outputs = str(settings.outputs_path)
        for proc in psutil.process_iter(["pid", "cmdline"]):
            try:
                cmd = " ".join(proc.info.get("cmdline") or [])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            if "mlx-yue" not in cmd or outputs not in cmd:
                continue
            try:
                logger.warning("Terminating stale mlx-yue process %s", proc.pid)
                proc.terminate()
                proc.wait(timeout=6)
            except (psutil.NoSuchProcess, psutil.TimeoutExpired):
                try:
                    proc.kill()
                except psutil.NoSuchProcess:
                    pass
            killed += 1
        return killed

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

    def _command(
        self,
        request_path: Path,
        engine_dir: Path,
        cover_audio: Optional[Path],
        cover_task: str = "melody-full",
    ) -> list[str]:
        base = [
            str(self.binary),
            "cover" if cover_audio else "generate",
            str(request_path),
            "--model", str(self.model_dir),
            "--vae", str(self.vae_dir),
            "--precision", settings.mlx_precision,
            "--output", str(engine_dir),
            "--memory-budget-gib", str(settings.mlx_memory_budget_gb),
            "--vae-core-frames", str(settings.mlx_vae_core_frames),
        ]
        if cover_audio:
            base.extend([
                "--audio", str(cover_audio),
                "--task", cover_task,
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
        audio_influence = int(params.get("audio_influence", 50))
        style_influence = int(params.get("style_influence", 50))
        max_mode = bool(params.get("max_mode", False))

        if cover:
            if audio_influence >= 80:
                cot = "full"
            elif audio_influence >= 20:
                cot = "melody"
            else:
                cot = "off"
        else:
            cot = str(params.get("cot") or "full")
        if cot not in {"full", "melody", "off"}:
            cot = "full"

        style = job.get("style_tags") or params.get("style_tags") or ""
        style = apply_vocal_gender(style, params.get("vocal_gender"))
        if max_mode:
            style = with_vocal_consistency(style)
            steps = max(32, steps)

        lyrics = job.get("lyrics") or ""
        if cover and lyrics.strip():
            lyrics = prepare_cover_lyrics(lyrics)

        request: dict[str, Any] = {
            "id": job["id"],
            "style": style,
            "lyrics": lyrics,
            "cot": cot,
            "seed": int(job.get("seed") or params.get("seed") or 0),
            "cfg_scale": style_influence_cfg(style_influence),
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
        params = job.get("params") or {}
        audio_influence = int(params.get("audio_influence", 50))
        if source_audio is not None and audio_influence < 20:
            source_audio = None
        cover_task = "full" if audio_influence >= 80 else "melody-full"
        job_dir = settings.outputs_path / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        engine_dir = job_dir / "engine"
        if engine_dir.exists():
            shutil.rmtree(engine_dir)
        # A memory-pressure retry starts a fresh engine process. The engine's
        # resource monitor refuses to overwrite evidence from the prior attempt.
        for evidence in ("engine.resources.jsonl", "engine.resources.json"):
            (job_dir / evidence).unlink(missing_ok=True)
        request_path = job_dir / "request.json"
        request = self.build_request(job, cover=job.get("type") == "cover")
        request_path.write_text(json.dumps(request, indent=2), encoding="utf-8")

        command = self._command(request_path, engine_dir, source_audio, cover_task)
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
        await master_audio(final_audio)
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


async def _peak_dbfs(path: Path) -> float:
    proc = await asyncio.create_subprocess_exec(
        settings.ffmpeg_bin, "-hide_banner", "-nostats", "-i", str(path),
        "-af", "astats=metadata=1:reset=0", "-f", "null", "-",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    peaks = re.findall(r"Peak level dB:\s*(-?[\d.]+|-inf)", stderr.decode("utf-8", errors="replace"))
    values = [float(p) for p in peaks if p != "-inf"]
    return max(values, default=-99.0)


async def master_audio(path: Path) -> bool:
    """Apply a true-peak limiter only when the render would clip.

    The MLX model can exceed 0 dBFS on dense covers. A lookahead limiter keeps
    the musical dynamics while avoiding hard clipping and inter-sample peaks.
    """
    peak = await _peak_dbfs(path)
    if peak < -0.1:
        return False
    target = path.with_name(f"{path.stem}.mastered{path.suffix}")
    proc = await asyncio.create_subprocess_exec(
        settings.ffmpeg_bin, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(path),
        "-af", "alimiter=limit=0.88:attack=5:release=50:level=false",
        "-c:a", "flac", str(target),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0 or not target.exists():
        target.unlink(missing_ok=True)
        logger.warning("Master limiter failed: %s", stderr.decode(errors="replace")[:300])
        return False
    target.replace(path)
    logger.info("Applied master limiter to %s (peak %.2f dBFS)", path.name, peak)
    return True


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
