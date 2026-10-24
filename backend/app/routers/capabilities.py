"""Live capability probe for the MLX engine and Ollama."""

from datetime import datetime, timezone

import psutil
from fastapi import APIRouter

from app.config import settings
from app.services.engine import engine
from app.services.ollama_client import ollama_client

router = APIRouter(prefix="/api/capabilities", tags=["Capabilities"])


async def _probe() -> dict:
    available, detail = engine.availability()
    ollama_ok = await ollama_client.check_health()
    models = await ollama_client.list_models() if ollama_ok else []
    memory = psutil.virtual_memory()
    return {
        "engine": "mlx",
        "mlx_available": available,
        "mlx_detail": detail,
        "comfyui_reachable": False,
        "ollama_reachable": ollama_ok,
        "comfyui_version": "mlx-Yue 0.1.0 (ComfyUI not used)",
        "text_to_song_supported": available,
        "reference_audio_supported": False,
        "cover_conditioning_supported": available,
        "precision_options": ["8bit", "bf16"],
        "detected_yue_nodes": ["mlx-Yue"],
        "missing_nodes": [],
        "detected_models": ["YuE2-3B MLX 8-bit"] if available else [],
        "ollama_models": models,
        "unified_memory_total_gb": round(memory.total / 1024 ** 3, 1),
        "unified_memory_available_gb": round(memory.available / 1024 ** 3, 1),
        "last_probed_at": datetime.now(timezone.utc).isoformat(),
        "status_summary": detail,
        "default_ollama_model": settings.default_ollama_model,
    }


@router.get("")
async def get_capabilities():
    return await _probe()


@router.post("/refresh")
async def refresh_capabilities():
    return await _probe()
