"""
Memory Guard for Apple Silicon Unified Memory (24GB target).
Enforces single-heavy-task exclusivity and alternates memory between Ollama and ComfyUI.
"""

import asyncio
import logging
from typing import Dict, Any
import httpx
import psutil

from app.config import settings

logger = logging.getLogger("memory_guard")


class MemoryGuard:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._current_heavy_task: str | None = None

    async def acquire_heavy_job_slot(self, task_name: str) -> None:
        """Acquire the single heavy job slot, blocking until available."""
        await self._lock.acquire()
        self._current_heavy_task = task_name
        logger.info(f"Acquired exclusive heavy job slot for: {task_name}")

    def release_heavy_job_slot(self) -> None:
        """Release the heavy job slot."""
        if self._lock.locked():
            self._current_heavy_task = None
            self._lock.release()
            logger.info("Released heavy job slot")

    @property
    def is_busy(self) -> bool:
        return self._lock.locked()

    @property
    def current_task(self) -> str | None:
        return self._current_heavy_task

    def check_memory_headroom(self) -> Dict[str, Any]:
        """Inspect unified memory headroom via psutil."""
        mem = psutil.virtual_memory()
        free_gb = round(mem.available / (1024 ** 3), 2)
        total_gb = round(mem.total / (1024 ** 3), 2)
        used_gb = round(mem.used / (1024 ** 3), 2)
        low_memory_warning = free_gb < settings.min_free_memory_gb

        return {
            "total_gb": total_gb,
            "available_gb": free_gb,
            "used_gb": used_gb,
            "percent_used": mem.percent,
            "low_memory_warning": low_memory_warning,
            "min_required_gb": settings.min_free_memory_gb
        }

    async def prepare_for_ollama(self) -> None:
        """Before running Qwen, evict GPU weights from ComfyUI to avoid memory pressure."""
        if not settings.auto_unload_models:
            return

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{settings.comfyui_url}/free",
                    json={"unload_models": True, "free_memory": True}
                )
                if resp.status_code == 200:
                    logger.info("Successfully called ComfyUI POST /free (models and VRAM evicted)")
        except Exception as e:
            logger.warning(f"Could not signal ComfyUI /free (ComfyUI may be offline): {e}")

    async def prepare_for_comfyui(self, active_model: str | None = None) -> None:
        """Before running YuE2 music generation, unload Qwen from Ollama memory."""
        if not settings.auto_unload_models:
            return

        model = active_model or settings.default_ollama_model
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # In Ollama, sending keep_alive: 0 instantly unloads the model from RAM/VRAM
                resp = await client.post(
                    f"{settings.ollama_url}/api/generate",
                    json={"model": model, "prompt": "", "keep_alive": 0}
                )
                if resp.status_code == 200:
                    logger.info(f"Successfully evicted model '{model}' from Ollama memory (keep_alive=0)")
        except Exception as e:
            logger.warning(f"Could not signal Ollama unload: {e}")


memory_guard = MemoryGuard()
