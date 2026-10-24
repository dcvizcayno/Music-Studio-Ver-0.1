"""Audio format conversion and downloads."""

import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import settings
from app.db import get_job
from app.services.audio_encoder import FORMAT_CONFIGS, encode_audio_file

router = APIRouter(prefix="/api/audio", tags=["Audio"])
JOB_ID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


@router.get("/formats")
async def list_supported_formats():
    return {
        "formats": [
            {
                "id": key,
                "name": value["name"],
                "extension": value["ext"],
                "mime_type": value["mime"],
                "is_lossless": value["lossless"],
            }
            for key, value in FORMAT_CONFIGS.items()
        ],
        "sample_rates": [44100, 48000, 96000],
        "bit_depths": [16, 24, 32],
        "bitrates_kbps": [128, 192, 256, 320],
    }


@router.get("/download/{job_id}")
async def download_encoded_song(
    job_id: str,
    format: str = Query("mp3"),
    filename: Optional[str] = Query(None),
    sample_rate: int = Query(48000),
    bit_depth: int = Query(24),
    bitrate_kbps: int = Query(320),
    channels: int = Query(2),
):
    if not JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    source = settings.outputs_path / job_id / "audio.flac"
    if not source.exists():
        raise HTTPException(status_code=404, detail="Audio is not ready")

    target_format = format.lower().strip()
    if target_format not in FORMAT_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")

    base = filename or job.get("title") or "song"
    clean = "".join(c for c in base if c.isalnum() or c in "-_ ").strip().replace(" ", "_")[:80] or "song"
    output_dir = settings.outputs_path / job_id / "converted"
    try:
        output, mime, ext = await encode_audio_file(
            input_path=source,
            output_dir=output_dir,
            target_format=target_format,
            base_name=clean,
            sample_rate=sample_rate,
            bit_depth=bit_depth,
            bitrate_kbps=bitrate_kbps,
            channels=channels,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcode failed: {exc}") from exc

    return FileResponse(
        str(output),
        media_type=mime,
        filename=f"{clean}{ext}",
        headers={"Content-Disposition": f'attachment; filename="{clean}{ext}"'},
    )
