"""FastAPI entry point for the local YuE2 Song Studio."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db, mark_orphans_failed
from app.routers import (
    audio,
    capabilities,
    library,
    models,
    prompt,
    settings as settings_router,
    songs,
    status,
)
from app.services.engine import engine
from app.workers.job_queue import job_queue

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("studio")


@asynccontextmanager
async def lifespan(app: FastAPI):
    for directory in (
        settings.outputs_path,
        settings.uploads_path,
        settings.data_path,
        settings.config_path,
        Path(settings.logs_dir),
    ):
        Path(directory).mkdir(parents=True, exist_ok=True)
    await init_db()
    orphans = await mark_orphans_failed()
    if orphans:
        logger.warning("Marked %s interrupted jobs as failed", orphans)
    await job_queue.start_worker()
    available, detail = engine.availability()
    logger.info("MLX engine: %s (%s)", available, detail)
    yield
    await job_queue.stop_worker()


app = FastAPI(title="YuE2 Song Studio", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(capabilities.router)
app.include_router(models.router)
app.include_router(prompt.router)
app.include_router(songs.router)
app.include_router(audio.router)
app.include_router(library.router)
app.include_router(status.router)
app.include_router(settings_router.router)


@app.get("/api/health")
async def health():
    available, detail = engine.availability()
    return {
        "status": "ok",
        "app": "YuE2 Song Studio",
        "engine": "mlx",
        "engine_ready": available,
        "detail": detail,
    }


_dist = Path(settings.frontend_dist)
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="ui")
else:
    logger.warning("Frontend build not found at %s; API only", _dist)
