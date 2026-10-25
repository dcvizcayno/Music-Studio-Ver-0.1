"""Qdrant-backed Mnemosyne memory endpoints."""

from fastapi import APIRouter, HTTPException

from app.db import get_job
from app.schemas.memory import MemoryFeedbackRequest, MemoryRememberRequest
from app.services import memory

router = APIRouter(prefix="/api/memory", tags=["Memory"])


@router.get("/health")
async def memory_health():
    return await memory.health()


@router.get("/context")
async def memory_context(query: str = "", agent: str = "qwen", limit: int = 5):
    return {"query": query, "agent": agent, "context": await memory.context(query, agent, limit)}


@router.get("")
async def list_memories(limit: int = 50):
    return {"memories": await memory.all_memories(limit)}


@router.post("/remember")
async def remember(request: MemoryRememberRequest):
    try:
        return await memory.remember(request.text, request.metadata)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Memory unavailable: {exc}") from exc


@router.post("/feedback")
async def save_feedback(request: MemoryFeedbackRequest):
    job = await get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        result = await memory.feedback(
            job_id=request.job_id,
            rating=request.rating,
            notes=request.notes,
            tags=request.tags,
            title=job.get("title") or "",
            style_tags=job.get("style_tags") or "",
        )
        return {"ok": True, "job_id": request.job_id, "memory": result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Memory unavailable: {exc}") from exc
