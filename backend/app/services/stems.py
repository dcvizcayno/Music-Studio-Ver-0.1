"""Six-stem separation with demucs-onnx (no PyTorch at inference)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import settings
from app.db import get_job

logger = logging.getLogger("stems")

STEM_DEFS = [
    ("vocals", "Lead Vocal"),
    ("drums", "Drums (full kit)"),
    ("bass", "Bass"),
    ("guitar", "Guitar (acoustic + electric)"),
    ("piano", "Piano / Keyboard"),
    ("other", "Synth / Other"),
]

NOTES = [
    "Lead Vocal is the model's vocal stem; backing vocals may be present if the mix has them.",
    "Drums is the full kit. Kick/snare/hi-hat component splitting needs a dedicated drum model.",
    "Guitar combines acoustic and electric guitar. Synth/Other contains synths, strings and effects.",
]

_state: Dict[str, Dict[str, Any]] = {}
_tasks: Dict[str, asyncio.Task] = {}


def _paths(job_id: str) -> tuple[Path, Path, Path]:
    root = settings.outputs_path / job_id
    return root, root / "stems", root / "stems.tmp"


def read_stems(job_id: str) -> Optional[Dict[str, Any]]:
    _, final, _ = _paths(job_id)
    meta = final / "stems.json"
    if meta.exists():
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            data["status"] = "completed"
            return data
        except Exception:
            return None
    return None


def status(job_id: str) -> Dict[str, Any]:
    if job_id in _state:
        return _state[job_id]
    data = read_stems(job_id)
    if data:
        return data
    return {"status": "idle", "job_id": job_id, "stems": [], "notes": NOTES}


async def _run(job_id: str) -> None:
    root, final, tmp = _paths(job_id)
    source = root / "audio.flac"
    job = await get_job(job_id)
    if not job or not source.exists():
        _state[job_id] = {"status": "failed", "job_id": job_id, "error": "Master audio not found", "stems": [], "notes": NOTES}
        return

    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True, exist_ok=True)
    _state[job_id] = {"status": "running", "job_id": job_id, "stage": "Separating 6 stems (CPU)", "stems": [], "notes": NOTES}

    try:
        env = os.environ.copy()
        env["HF_HOME"] = settings.hf_home
        env["HF_HUB_CACHE"] = str(Path(settings.hf_home) / "hub")
        if settings.mlx_offline:
            env.update({
                "HF_HUB_OFFLINE": "1",
                "TRANSFORMERS_OFFLINE": "1",
                "HF_DATASETS_OFFLINE": "1",
                "HF_HUB_DISABLE_TELEMETRY": "1",
                "DO_NOT_TRACK": "1",
            })
        proc = await asyncio.create_subprocess_exec(
            str(settings.demucs_bin), "separate", str(source), str(tmp),
            "--model", "htdemucs_6s", "--providers", "cpu", "--small", "-q",
            env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode(errors="replace")[-800:] or f"demucs exited {proc.returncode}")

        shutil.rmtree(final, ignore_errors=True)
        final.mkdir(parents=True, exist_ok=True)
        stems = []
        for stem_id, label in STEM_DEFS:
            raw = tmp / f"{stem_id}.wav"
            if not raw.exists():
                continue
            out = final / f"{stem_id}.wav"
            ff = await asyncio.create_subprocess_exec(
                settings.ffmpeg_bin, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(raw), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(out),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            _, ferr = await ff.communicate()
            if ff.returncode != 0 or not out.exists():
                raise RuntimeError(f"ffmpeg stem conversion failed: {ferr.decode(errors='replace')[-300:]}")
            stems.append({"id": stem_id, "label": label, "file": f"/api/jobs/{job_id}/stems/{stem_id}", "bytes": out.stat().st_size})

        payload = {
            "status": "completed",
            "job_id": job_id,
            "model": "htdemucs_6s",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "stems": stems,
            "notes": NOTES,
        }
        (final / "stems.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        _state[job_id] = payload
        logger.info("Stems ready for %s (%s)", job_id, len(stems))
    except Exception as exc:
        logger.exception("Stem separation failed for %s", job_id)
        _state[job_id] = {"status": "failed", "job_id": job_id, "error": str(exc)[:1000], "stems": [], "notes": NOTES}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        _tasks.pop(job_id, None)


async def start(job_id: str) -> Dict[str, Any]:
    current = status(job_id)
    if current.get("status") in {"running", "completed"}:
        return current
    task = _tasks.get(job_id)
    if task and not task.done():
        return current
    _tasks[job_id] = asyncio.create_task(_run(job_id))
    return {"status": "running", "job_id": job_id, "stage": "Starting stem separation", "stems": [], "notes": NOTES}
