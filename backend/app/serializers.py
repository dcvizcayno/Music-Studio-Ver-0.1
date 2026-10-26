"""API serialization helpers."""

import re
from typing import Any, Dict

from app.config import settings


def _score_meta(score_path) -> Dict[str, Any] | None:
    try:
        text = score_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None
    title = re.search(r"^T:[ \t]*(.+)$", text, re.MULTILINE)
    key = re.search(r"^K:[ \t]*(.+)$", text, re.MULTILINE)
    bpm = re.search(r"^Q:[ \t]*(?:\d+/\d+[ \t]*=[ \t]*)?(\d+)", text, re.MULTILINE)
    return {
        "title": title.group(1).strip() if title and title.group(1).strip() else None,
        "key": key.group(1).strip() if key else None,
        "bpm": bpm.group(1) if bpm else None,
    }


def job_public(job: Dict[str, Any]) -> Dict[str, Any]:
    audio_url = None
    abc_url = None
    if job.get("status") == "completed":
        audio_url = f"/api/outputs/{job['id']}/audio.flac"
        if (settings.outputs_path / job["id"] / "score.abc").exists():
            abc_url = f"/api/songs/{job['id']}/abc"
    params = job.get("params_json") if isinstance(job.get("params_json"), dict) else {}
    return {
        "id": job["id"],
        "title": job.get("title") or "Untitled",
        "type": job.get("type") or "text_to_song",
        "status": job.get("status") or "queued",
        "idea": job.get("idea"),
        "lyrics": job.get("lyrics"),
        "style_tags": job.get("style_tags"),
        "model_name": job.get("model_name"),
        "qwen_model": job.get("qwen_model"),
        "seed": job.get("seed"),
        "steps": job.get("steps"),
        "cfg": job.get("cfg"),
        "duration_seconds": job.get("duration_seconds"),
        "progress": job.get("progress") or 0,
        "stage_name": job.get("stage_name") or "Queued",
        "audio_url": audio_url,
        "abc_url": abc_url,
        "score_meta": _score_meta(settings.outputs_path / job["id"] / "score.abc")
        if job.get("status") == "completed" and (settings.outputs_path / job["id"] / "score.abc").exists()
        else None,
        "error_message": job.get("error_message"),
        "params": params,
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
    }
