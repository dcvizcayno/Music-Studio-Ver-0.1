"""Live Ollama and MLX model enumeration."""

from fastapi import APIRouter

from app.config import settings
from app.services.engine import engine
from app.services.ollama_client import ollama_client

router = APIRouter(prefix="/api/models", tags=["Models"])


@router.get("/ollama")
async def get_ollama_models():
    reachable = await ollama_client.check_health()
    models = await ollama_client.list_models() if reachable else []
    return {
        "reachable": reachable,
        "models": models,
        "default_model": settings.default_ollama_model,
        "error": None if reachable else "Ollama is not running",
    }


@router.get("/yue")
async def get_yue_models():
    available, detail = engine.availability()
    models = []
    if available:
        models.append({
            "filename": "YuE2-3B MLX 8-bit",
            "is_yue2": True,
            "variant": "8-bit AR · MLX · 24 GB tuned",
        })
    return {
        "reachable": available,
        "models": models,
        "default_model": models[0]["filename"] if models else None,
        "error": None if available else detail,
    }
