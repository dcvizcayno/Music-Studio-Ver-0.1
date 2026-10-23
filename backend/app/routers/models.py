"""
Router for live Ollama and ComfyUI model enumeration and selection.
"""

from fastapi import APIRouter
from app.config import settings
from app.schemas.models import OllamaTagsResponse, ComfyUIModelsResponse, ComfyUIModelItem
from app.services.ollama_client import ollama_client
from app.services.comfy_client import comfy_client

router = APIRouter(prefix="/api/models", tags=["Models"])


@router.get("/ollama", response_model=OllamaTagsResponse)
async def get_ollama_models():
    """Fetch live tags from Ollama /api/tags, with model sizes and >14B parameter warnings."""
    reachable = await ollama_client.check_health()
    if not reachable:
        # Graceful default candidates so UI displays recommended options
        return {
            "reachable": False,
            "models": [
                {
                    "name": "qwen2.5:7b-instruct",
                    "size_bytes": 4700000000,
                    "size_formatted": "4.7 GB",
                    "parameter_size_b": 7.0,
                    "is_qwen": True,
                    "is_recommended": True,
                    "exceeds_recommended_size": False
                },
                {
                    "name": "qwen2.5:14b-instruct",
                    "size_bytes": 9000000000,
                    "size_formatted": "9.0 GB",
                    "parameter_size_b": 14.0,
                    "is_qwen": True,
                    "is_recommended": True,
                    "exceeds_recommended_size": False
                },
                {
                    "name": "qwen2.5:32b-instruct",
                    "size_bytes": 19000000000,
                    "size_formatted": "19.0 GB",
                    "parameter_size_b": 32.0,
                    "is_qwen": True,
                    "is_recommended": False,
                    "exceeds_recommended_size": True
                }
            ],
            "default_model": settings.default_ollama_model,
            "error": "Ollama is not running. Showing recommended candidates."
        }

    models = await ollama_client.list_models()
    return {
        "reachable": True,
        "models": models,
        "default_model": settings.default_ollama_model,
        "error": None
    }


@router.get("/yue", response_model=ComfyUIModelsResponse)
async def get_yue_models():
    """Fetch registered YuE2 models from ComfyUI /object_info and capabilities."""
    reachable = await comfy_client.check_health()
    caps = await comfy_client.probe_capabilities()
    detected = caps.get("detected_models", [])

    items = []
    if detected:
        for m in detected:
            items.append(ComfyUIModelItem(
                filename=m,
                is_yue2=True,
                variant="Standard"
            ))
    else:
        # Default options supported by standard YuE2 nodes
        items = [
            ComfyUIModelItem(filename="yue2-1b-preview.safetensors", is_yue2=True, variant="1B Preview (Recommended)"),
            ComfyUIModelItem(filename="yue2-full-bf16.safetensors", is_yue2=True, variant="Full BF16"),
            ComfyUIModelItem(filename="yue2-int8-quant.safetensors", is_yue2=True, variant="INT8 Quantized (Memory Optimized)")
        ]

    return {
        "reachable": reachable,
        "models": items,
        "default_model": items[0].filename if items else "yue2-1b-preview.safetensors",
        "error": None if reachable else "ComfyUI is offline. Showing standard supported checkpoints."
    }
