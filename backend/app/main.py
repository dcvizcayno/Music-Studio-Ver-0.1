"""
YuE2 Song Studio - FastAPI Application Entry Point.
Runs locally on macOS Apple Silicon, orchestrating Qwen (Ollama) and YuE2 (ComfyUI).
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers import (
    audio,
    capabilities,
    library,
    models,
    prompt,
    settings as settings_router,
    songs,
    status,
    voices,
)
from app.services.comfy_client import comfy_client
from app.workers.job_queue import job_queue

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("studio_app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup & shutdown events."""
    logger.info("Initializing YuE2 Song Studio backend...")

    # 1. Initialize SQLite Database & Migrations
    await init_db()
    logger.info(f"SQLite database initialized at {settings.database_url}")

    # 2. Step 0 Capability Check: Probe ComfyUI /object_info
    caps = await comfy_client.probe_capabilities()
    logger.info(f"ComfyUI Capability Probe: {caps.get('status_summary')}")

    # 3. Start Single-Heavy-Task Background Worker
    job_queue.start_worker()

    yield

    logger.info("Shutting down YuE2 Song Studio backend.")


app = FastAPI(
    title="YuE2 Song Studio API",
    description="Local sovereign AI song production powered by Qwen and YuE2 for Apple Silicon Macs.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(capabilities.router)
app.include_router(models.router)
app.include_router(prompt.router)
app.include_router(songs.router)
app.include_router(audio.router)
app.include_router(voices.router)
app.include_router(library.router)
app.include_router(status.router)
app.include_router(settings_router.router)


@app.get("/health")
async def health_check():
    """Liveness probe."""
    return {"status": "ok", "app": "YuE2 Song Studio", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
