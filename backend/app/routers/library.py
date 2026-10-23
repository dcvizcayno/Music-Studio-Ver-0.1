"""
Router for song library management: browsing past jobs, re-running, duplicating, and deleting.
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException
from app.config import settings
from app.db import delete_job, get_job, list_jobs
from app.schemas.songs import JobListResponse, JobResponse
from app.workers.job_queue import job_queue

router = APIRouter(prefix="/api/jobs", tags=["Library & Jobs"])


@router.get("", response_model=JobListResponse)
async def get_all_jobs(limit: int = 50, offset: int = 0):
    """List past generation jobs with playback and settings."""
    rows = await list_jobs(limit=limit, offset=offset)
    job_responses = []
    for r in rows:
        job_responses.append(JobResponse(
            id=r["id"],
            title=r["title"],
            type=r["type"],
            status=r["status"],
            idea=r.get("idea"),
            lyrics=r.get("lyrics"),
            style_tags=r.get("style_tags"),
            model_name=r.get("model_name"),
            qwen_model=r.get("qwen_model"),
            seed=r.get("seed"),
            steps=r.get("steps"),
            cfg=r.get("cfg"),
            duration_seconds=r.get("duration_seconds"),
            progress=r.get("progress", 0),
            stage_name=r.get("stage_name", ""),
            audio_url=f"/api/outputs/{r['id']}/audio.wav" if r.get("status") == "completed" else None,
            error_message=r.get("error_message"),
            workflow_snapshot=r.get("workflow_snapshot"),
            created_at=r["created_at"],
            updated_at=r["updated_at"]
        ))
    return JobListResponse(jobs=job_responses, total=len(job_responses))


@router.get("/{job_id}", response_model=JobResponse)
async def get_single_job(job_id: str):
    """Retrieve details for a specific song job."""
    r = await get_job(job_id)
    if not r:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobResponse(
        id=r["id"],
        title=r["title"],
        type=r["type"],
        status=r["status"],
        idea=r.get("idea"),
        lyrics=r.get("lyrics"),
        style_tags=r.get("style_tags"),
        model_name=r.get("model_name"),
        qwen_model=r.get("qwen_model"),
        seed=r.get("seed"),
        steps=r.get("steps"),
        cfg=r.get("cfg"),
        duration_seconds=r.get("duration_seconds"),
        progress=r.get("progress", 0),
        stage_name=r.get("stage_name", ""),
        audio_url=f"/api/outputs/{r['id']}/audio.wav" if r.get("status") == "completed" else None,
        error_message=r.get("error_message"),
        workflow_snapshot=r.get("workflow_snapshot"),
        created_at=r["created_at"],
        updated_at=r["updated_at"]
    )


@router.post("/{job_id}/cancel")
async def cancel_active_job(job_id: str):
    """Cancel a currently running job."""
    cancelled = await job_queue.cancel_job(job_id)
    return {"cancelled": cancelled, "job_id": job_id}


@router.delete("/{job_id}")
async def delete_job_entry(job_id: str):
    """Delete a job and remove its generated audio outputs from disk."""
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    output_dir = Path(settings.outputs_dir) / job_id
    if output_dir.exists():
        import shutil
        shutil.rmtree(output_dir, ignore_errors=True)

    await delete_job(job_id)
    return {"deleted": True, "job_id": job_id}
