"""
Router for high-fidelity audio encoding, format conversion, and custom file downloads.
Supported codecs: WAV, AIFF, FLAC, ALAC (M4A), MP3, AAC, Ogg Vorbis, Opus.
"""

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import settings
from app.db import get_job
from app.services.audio_encoder import FORMAT_CONFIGS, encode_audio_file

router = APIRouter(prefix="/api/audio", tags=["Audio Transcoder & Formats"])


@router.get("/formats")
async def list_supported_formats():
    """List all supported audio formats with specifications."""
    return {
        "formats": [
            {
                "id": k,
                "name": v["name"],
                "extension": v["ext"],
                "mime_type": v["mime"],
                "is_lossless": v["lossless"]
            }
            for k, v in FORMAT_CONFIGS.items()
        ],
        "sample_rates": [44100, 48000, 96000],
        "bit_depths": [16, 24, 32],
        "bitrates_kbps": [128, 192, 256, 320]
    }


@router.get("/download/{job_id}")
async def download_encoded_song(
    job_id: str,
    format: str = Query("wav", description="Target audio format (wav, aiff, flac, alac, mp3, aac, ogg, opus)"),
    filename: Optional[str] = Query(None, description="Custom base file name for download"),
    sample_rate: int = Query(44100, description="Sample rate in Hz (44100, 48000, 96000)"),
    bit_depth: int = Query(16, description="Bit depth for lossless formats (16, 24, 32)"),
    bitrate_kbps: int = Query(320, description="Bitrate in kbps for lossy formats (128, 192, 256, 320)"),
    channels: int = Query(2, description="Channels: 1 (mono) or 2 (stereo)")
):
    """
    Encode and download the master audio artifact in the requested format with custom file name.
    """
    # 1. Verify job exists
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Song job not found.")

    source_path = Path(settings.outputs_dir) / job_id / "audio.wav"
    if not source_path.exists():
        # Fallback check if job has audio_path
        if job.get("audio_path") and Path(job["audio_path"]).exists():
            source_path = Path(job["audio_path"])
        else:
            raise HTTPException(status_code=404, detail="Master audio file not found on disk.")

    fmt = format.lower().strip()
    if fmt not in FORMAT_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{format}'.")

    # 2. Determine download filename
    title_sanitized = (job.get("title") or "song").lower().replace(" ", "_")
    base_name = filename.strip() if filename and filename.strip() else title_sanitized
    clean_base = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "master"

    # 3. Transcode using AudioEncoder
    output_dir = Path(settings.outputs_dir) / job_id / "converted"
    try:
        output_file, mime_type, ext = await encode_audio_file(
            input_path=source_path,
            output_dir=output_dir,
            target_format=fmt,
            base_name=clean_base,
            sample_rate=sample_rate,
            bit_depth=bit_depth,
            bitrate_kbps=bitrate_kbps,
            channels=channels
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio transcoding failed: {str(e)}")

    download_display_name = f"{clean_base}{ext}"
    return FileResponse(
        path=str(output_file),
        media_type=mime_type,
        filename=download_display_name,
        headers={
            "Content-Disposition": f'attachment; filename="{download_display_name}"'
        }
    )
