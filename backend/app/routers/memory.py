"""Qdrant-backed Mnemosyne memory endpoints."""

from fastapi import APIRouter, HTTPException

from app.db import get_job
from app.schemas.memory import (
    MemoryFeedbackRequest,
    MemoryRememberRequest,
    SongSummaryRequest,
    SongSummaryResponse,
)
from app.services import memory
from app.services.ollama_client import OllamaError, ollama_client

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


@router.post("/song-summary", response_model=SongSummaryResponse)
async def summarize_song(request: SongSummaryRequest):
    """Read lyrics with Qwen, save an emotional/story summary into Mnemosyne."""
    if not (request.lyrics.strip() or request.idea.strip()):
        raise HTTPException(status_code=400, detail="Provide lyrics or a song premise first")
    try:
        summary = await ollama_client.summarize_lyrics(
            lyrics=request.lyrics,
            title=request.title,
            style_tags=request.style_tags,
            idea=request.idea,
            model=request.qwen_model,
        )
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    saved = False
    memory_error = None
    try:
        await memory.remember(
            f"Song summary for '{request.title or 'untitled'}': {summary} "
            f"Style: {request.style_tags[:300] or 'unknown'}.",
            {"type": "song_summary", "title": request.title},
        )
        saved = True
    except Exception as exc:
        memory_error = str(exc)
    return SongSummaryResponse(summary=summary, saved=saved, memory_error=memory_error)
