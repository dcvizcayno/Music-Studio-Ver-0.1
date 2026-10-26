"""Library and job management."""

from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.db import delete_job, get_job, list_jobs
from app.serializers import job_public
from app.services import memory as memory_service
from app.services import midi, stems
from app.workers.job_queue import job_queue

router = APIRouter(prefix="/api/jobs", tags=["Library"])


class BulkDeleteRequest(BaseModel):
    job_ids: List[str]


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
    memory_removed = await memory_service.delete_for_job(job_id, job.get("title") or "")
    await job_queue.delete_outputs(job_id)
    await delete_job(job_id)
    return {"deleted": True, "job_id": job_id, "memory_removed": memory_removed}


@router.post("/bulk-delete")
async def bulk_delete_jobs(request: BulkDeleteRequest):
    deleted: List[str] = []
    missing: List[str] = []
    errors: List[dict] = []
    memory_removed = 0
    for job_id in list(dict.fromkeys(request.job_ids)):
        job = await get_job(job_id)
        if not job:
            missing.append(job_id)
            continue
        try:
            memory_removed += await memory_service.delete_for_job(job_id, job.get("title") or "")
            await job_queue.delete_outputs(job_id)
            await delete_job(job_id)
            deleted.append(job_id)
        except Exception as exc:
            errors.append({"job_id": job_id, "error": str(exc)})
    return {
        "deleted": deleted,
        "missing": missing,
        "errors": errors,
        "memory_removed": memory_removed,
    }


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


@router.post("/{job_id}/midi")
async def create_job_midi(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Only completed songs can be transcribed")
    try:
        return await midi.start(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{job_id}/midi")
async def get_job_midi(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return midi.status(job_id)


@router.get("/{job_id}/midi/{stem_id}.mid")
async def get_midi_file(job_id: str, stem_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if stem_id not in {item[0] for item in midi.MIDI_DEFS}:
        raise HTTPException(status_code=404, detail="Unknown stem")
    path = settings.outputs_path / job_id / "midi" / f"{stem_id}.mid"
    if not path.exists():
        raise HTTPException(status_code=404, detail="MIDI is not ready")
    return FileResponse(str(path), media_type="audio/midi", filename=f"{job_id[:8]}-{stem_id}.mid")
