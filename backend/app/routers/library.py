"""Library and job management."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.db import delete_job, get_job, list_jobs
from app.serializers import job_public
from app.services import stems
from app.workers.job_queue import job_queue

router = APIRouter(prefix="/api/jobs", tags=["Library"])


@router.get("")
async def get_all_jobs(limit: int = 50, offset: int = 0):
    rows = await list_jobs(limit=max(1, min(200, limit)), offset=max(0, offset))
    return {"jobs": [job_public(row) for row in rows], "total": len(rows)}


@router.get("/{job_id}")
async def get_single_job(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_public(job)


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    return {"cancelled": await job_queue.cancel_job(job_id), "job_id": job_id}


@router.delete("/{job_id}")
async def delete_job_entry(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await job_queue.delete_outputs(job_id)
    await delete_job(job_id)
    return {"deleted": True, "job_id": job_id}


@router.post("/{job_id}/stems")
async def split_job_stems(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Only completed songs can be split")
    return await stems.start(job_id)


@router.get("/{job_id}/stems")
async def get_job_stems(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return stems.status(job_id)


@router.get("/{job_id}/stems/{stem_id}")
async def get_stem_file(job_id: str, stem_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if stem_id not in {item[0] for item in stems.STEM_DEFS}:
        raise HTTPException(status_code=404, detail="Unknown stem")
    path = settings.outputs_path / job_id / "stems" / f"{stem_id}.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stem is not ready")
    return FileResponse(str(path), media_type="audio/wav", filename=f"{job_id[:8]}-{stem_id}.wav")
