"""
Router for ComfyUI YuE2 capability detection and node verification.
"""

from fastapi import APIRouter
from app.schemas.models import CapabilitiesResponse
from app.services.comfy_client import comfy_client
from app.services.ollama_client import ollama_client
from app.services.memory_guard import memory_guard

router = APIRouter(prefix="/api/capabilities", tags=["Capabilities"])


@router.get("", response_model=CapabilitiesResponse)
async def get_capabilities():
    """Retrieve capabilities discovered from ComfyUI /object_info and local system."""
    caps = await comfy_client.probe_capabilities()
    ollama_ok = await ollama_client.check_health()
    caps["ollama_reachable"] = ollama_ok
    mem_info = memory_guard.check_memory_headroom()
    caps["unified_memory_total_gb"] = mem_info["total_gb"]
    return caps


@router.post("/refresh", response_model=CapabilitiesResponse)
async def refresh_capabilities():
    """Force re-scan of ComfyUI /object_info and update config/capabilities.json."""
    caps = await comfy_client.probe_capabilities()
    ollama_ok = await ollama_client.check_health()
    caps["ollama_reachable"] = ollama_ok
    mem_info = memory_guard.check_memory_headroom()
    caps["unified_memory_total_gb"] = mem_info["total_gb"]
    return caps
