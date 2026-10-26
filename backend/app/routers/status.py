"""System doctor for the MLX-backed studio."""

import asyncio
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import psutil
from fastapi import APIRouter

from app.config import settings
from app.db import get_db_path
from app.services.engine import engine
from app.services.ollama_client import ollama_client

router = APIRouter(prefix="/api/status", tags=["System Status"])


def _gpu_percent() -> int | None:
    """Read Apple GPU utilization without powermetrics/sudo."""
    try:
        out = subprocess.run(
            ["/usr/sbin/ioreg", "-r", "-c", "AGXAccelerator", "-d", "1"],
            capture_output=True, text=True, timeout=2,
        ).stdout
        match = re.search(r'"Device Utilization %"=(\d+)', out)
        return int(match.group(1)) if match else None
    except Exception:
        return None


def _cpu_percent() -> float:
    import psutil
    return round(psutil.cpu_percent(interval=0.12), 1)


@router.get("/live")
async def get_live_status():
    """Small polling endpoint for CPU/GPU and local service readiness."""
    cpu, gpu = await asyncio.gather(
        asyncio.to_thread(_cpu_percent),
        asyncio.to_thread(_gpu_percent),
    )
    ollama_ready = await ollama_client.check_health()
    mlx_ready, detail = engine.availability()
    return {
        "cpu_percent": cpu,
        "gpu_percent": gpu,
        "ollama_ready": ollama_ready,
        "mlx_ready": mlx_ready,
        "detail": detail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _check(name: str, status: str, detail: str, fix: str = "None") -> dict:
    return {"name": name, "status": status, "detail": detail, "fix": fix}


@router.get("")
async def get_system_status():
    checks = []
    uname = os.uname()
    checks.append(_check(
        "Apple Silicon",
        "PASS" if uname.sysname == "Darwin" and uname.machine == "arm64" else "FAIL",
        f"{uname.sysname} {uname.machine}",
        "Run on an Apple Silicon Mac",
    ))

    memory = psutil.virtual_memory()
    total_gb = memory.total / 1024 ** 3
    available_gb = memory.available / 1024 ** 3
    checks.append(_check(
        "Unified Memory",
        "PASS" if total_gb >= 23 else "WARN",
        f"{total_gb:.1f} GB total, {available_gb:.1f} GB available",
        "Close other heavy apps; YuE2 runs alone",
    ))

    disk = shutil.disk_usage(settings.outputs_path)
    checks.append(_check(
        "Free Disk",
        "PASS" if disk.free / 1024 ** 3 >= 30 else "WARN",
        f"{disk.free / 1024 ** 3:.0f} GB free",
        "Free at least 30 GB",
    ))

    available, detail = engine.availability()
    checks.append(_check(
        "MLX Engine",
        "PASS" if available else "FAIL",
        detail,
        "Install mlx-Yue and the MLX weights",
    ))

    tools_ok = Path(settings.ffmpeg_bin).exists() and Path(settings.ffprobe_bin).exists()
    checks.append(_check(
        "Audio Tools",
        "PASS" if tools_ok else "FAIL",
        "ffmpeg + ffprobe available" if tools_ok else "ffmpeg/ffprobe missing",
        "Install the static ffmpeg build",
    ))

    ollama_ok = await ollama_client.check_health()
    if ollama_ok:
        models = await ollama_client.list_models()
        qwen = [m["name"] for m in models if m.get("is_qwen")]
        checks.append(_check(
            "Ollama",
            "PASS" if qwen else "WARN",
            f"Reachable; Qwen models: {', '.join(qwen[:3])}" if qwen else "Reachable; no Qwen model",
            "ollama pull qwen3:4b-instruct",
        ))
    else:
        checks.append(_check(
            "Ollama",
            "WARN",
            "Not reachable; lyric drafting disabled",
            "Start Ollama",
        ))

    db_ok = get_db_path().parent.exists()
    checks.append(_check(
        "SQLite",
        "PASS" if db_ok else "FAIL",
        str(get_db_path()),
        "Check workspace write permissions",
    ))

    has_fail = any(c["status"] == "FAIL" for c in checks)
    has_warn = any(c["status"] == "WARN" for c in checks)
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "overall_health": "critical" if has_fail else ("degraded" if has_warn else "healthy"),
        "memory_headroom_gb": round(available_gb, 1),
        "active_jobs_count": 0,
        "checks": checks,
    }
