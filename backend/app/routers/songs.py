"""
Router for song generation, covers, and real-time Server-Sent Events (SSE) progress streaming.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import AsyncGenerator
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings
from app.db import get_job
from app.schemas.songs import GenerateSongRequest, CoverSongRequest, JobResponse
from app.workers.job_queue import job_queue

logger = logging.getLogger("songs_router")

router = APIRouter(prefix="/api", tags=["Songs & Generation"])


@router.post("/songs/generate", response_model=JobResponse)
async def generate_song(request: GenerateSongRequest):
    """Queue a text-to-song generation job using YuE2 in ComfyUI."""
    if not request.lyrics.strip():
        raise HTTPException(status_code=400, detail="Lyrics cannot be empty.")
    if not request.style_tags.strip():
        raise HTTPException(status_code=400, detail="Style tags cannot be empty.")

    job_data = {
        "title": request.title,
        "type": "text_to_song",
        "idea": request.idea,
        "lyrics": request.lyrics,
        "style_tags": request.style_tags,
        "model_name": request.model_name or "yue2-1b-preview.safetensors",
        "seed": request.seed,
        "steps": request.steps,
        "cfg": request.cfg,
        "duration_seconds": request.duration_seconds,
        "precision": request.precision,
        "voice_profile_id": request.voice_profile_id
    }

    job_id = await job_queue.submit_job(job_data)
    created = await get_job(job_id)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to initialize job.")
    return created


@router.post("/songs/cover", response_model=JobResponse)
async def generate_cover(request: CoverSongRequest):
    """Queue an audio-conditioned cover generation job."""
    if not request.source_audio_filename:
        raise HTTPException(status_code=400, detail="Source audio track filename required.")

    job_data = {
        "title": request.title,
        "type": "cover",
        "lyrics": request.lyrics,
        "style_tags": request.style_tags,
        "source_audio_filename": request.source_audio_filename,
        "seed": request.seed,
        "steps": request.steps,
        "duration_seconds": request.duration_seconds
    }

    job_id = await job_queue.submit_job(job_data)
    created = await get_job(job_id)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to initialize cover job.")
    return created


@router.get("/songs/{job_id}/events")
async def stream_job_events(job_id: str):
    """
    Server-Sent Events (SSE) endpoint providing live stage updates,
    percentages, and audio download links for a specific job.
    """
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator() -> AsyncGenerator[str, None]:
        event_queue: asyncio.Queue[dict] = asyncio.Queue()

        def on_event(data: dict):
            event_queue.put_nowait(data)

        job_queue.add_listener(job_id, on_event)

        # Send initial state snapshot immediately
        initial_data = {
            "job_id": job["id"],
            "status": job["status"],
            "progress": job.get("progress", 0),
            "stage_name": job.get("stage_name", "Initializing"),
            "audio_url": f"/api/outputs/{job_id}/audio.wav" if job.get("status") == "completed" else None,
            "error": job.get("error_message")
        }
        yield f"data: {json.dumps(initial_data)}\n\n"

        try:
            while True:
                try:
                    # Timeout after 30 seconds of inactivity to send keep-alive ping
                    data = await asyncio.wait_for(event_queue.get(), timeout=25.0)
                    yield f"data: {json.dumps(data)}\n\n"

                    if data.get("status") in ["completed", "failed", "cancelled"]:
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            job_queue.remove_listener(job_id, on_event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/outputs/{job_id}/audio.wav")
async def get_audio_output(job_id: str):
    """Serve synthesized audio WAV file."""
    audio_path = Path(settings.outputs_dir) / job_id / "audio.wav"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Synthesized audio file not found.")
    return FileResponse(
        str(audio_path),
        media_type="audio/wav",
        filename=f"song_{job_id[:8]}.wav"
    )
