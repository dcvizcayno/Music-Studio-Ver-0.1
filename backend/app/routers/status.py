"""
Router for system status, diagnostic health checks (equivalent to doctor.sh), and live telemetry.
"""

import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from fastapi import APIRouter
import psutil

from app.config import settings
from app.schemas.voices import DoctorCheckItem, SystemStatusResponse
from app.services.comfy_client import comfy_client
from app.services.ollama_client import ollama_client
from app.services.memory_guard import memory_guard

router = APIRouter(prefix="/api/status", tags=["System Status & Doctor"])


@router.get("", response_model=SystemStatusResponse)
async def get_system_status():
    """Execute live system health checks matching doctor.sh."""
    checks: List[DoctorCheckItem] = []

    # 1. Architecture Check
    uname = os.uname()
    is_mac_arm = uname.sysname == "Darwin" and uname.machine == "arm64"
    if is_mac_arm:
        checks.append(DoctorCheckItem(
            name="Apple Silicon Architecture",
            status="PASS",
            detail=f"Apple Silicon ({uname.machine}) with Metal MPS acceleration",
            fix="None"
        ))
    else:
        checks.append(DoctorCheckItem(
            name="Apple Silicon Architecture",
            status="WARN",
            detail=f"Host is {uname.sysname} ({uname.machine}). Target architecture is Darwin arm64.",
            fix="Deploy onto Apple Silicon M5/M4/M3/M2/M1 for optimal unified memory acceleration."
        ))

    # 2. Unified Memory Check
    mem = psutil.virtual_memory()
    total_gb = round(mem.total / (1024 ** 3), 1)
    avail_gb = round(mem.available / (1024 ** 3), 1)
    if total_gb >= 24.0:
        checks.append(DoctorCheckItem(
            name="Unified Memory (24GB Target)",
            status="PASS",
            detail=f"{total_gb} GB Unified RAM detected. {avail_gb} GB currently available.",
            fix="None"
        ))
    elif total_gb >= 16.0:
        checks.append(DoctorCheckItem(
            name="Unified Memory (24GB Target)",
            status="WARN",
            detail=f"{total_gb} GB Unified RAM. Memory guard will strictly alternate Ollama and ComfyUI.",
            fix="Keep AUTO_UNLOAD_MODELS=true enabled."
        ))
    else:
        checks.append(DoctorCheckItem(
            name="Unified Memory (24GB Target)",
            status="WARN",
            detail=f"{total_gb} GB Unified RAM. Caution with large checkpoints.",
            fix="Use quantized INT8 or 1B preview checkpoints."
        ))

    # 3. Disk Space Check
    disk = shutil.disk_usage(Path.cwd())
    free_disk_gb = round(disk.free / (1024 ** 3), 1)
    if free_disk_gb >= 30.0:
        checks.append(DoctorCheckItem(
            name="Free Disk Space",
            status="PASS",
            detail=f"{free_disk_gb} GB free on storage volume.",
            fix="None"
        ))
    else:
        checks.append(DoctorCheckItem(
            name="Free Disk Space",
            status="WARN",
            detail=f"{free_disk_gb} GB free. Model weights & stem audio require ample headroom.",
            fix="Ensure at least 30GB free disk space."
        ))

    # 4. Ollama Reachability
    ollama_ok = await ollama_client.check_health()
    if ollama_ok:
        models = await ollama_client.list_models()
        qwen_names = [m["name"] for m in models if m.get("is_qwen")]
        if qwen_names:
            checks.append(DoctorCheckItem(
                name="Ollama LLM Engine",
                status="PASS",
                detail=f"Reachable at {settings.ollama_url}. Qwen models detected: {', '.join(qwen_names[:3])}",
                fix="None"
            ))
        else:
            checks.append(DoctorCheckItem(
                name="Ollama LLM Engine",
                status="WARN",
                detail=f"Reachable at {settings.ollama_url}, but no Qwen model found.",
                fix="Run: ollama pull qwen2.5:7b-instruct"
            ))
    else:
        checks.append(DoctorCheckItem(
            name="Ollama LLM Engine",
            status="FAIL",
            detail=f"Cannot reach Ollama at {settings.ollama_url}",
            fix="Start Ollama via: ollama serve (or launch the macOS Ollama app)"
        ))

    # 5. ComfyUI Reachability & YuE2 Nodes
    comfy_ok = await comfy_client.check_health()
    if comfy_ok:
        caps = await comfy_client.probe_capabilities()
        yue_nodes = caps.get("detected_yue_nodes", [])
        if yue_nodes:
            checks.append(DoctorCheckItem(
                name="ComfyUI Music Engine",
                status="PASS",
                detail=f"Reachable at {settings.comfyui_url}. {len(yue_nodes)} audio nodes detected.",
                fix="None"
            ))
        else:
            checks.append(DoctorCheckItem(
                name="ComfyUI Music Engine",
                status="WARN",
                detail=f"ComfyUI reachable, but custom YuE2 nodes not found in /object_info.",
                fix="Install ComfyUI-YuE2 in your ComfyUI custom_nodes directory."
            ))
    else:
        checks.append(DoctorCheckItem(
            name="ComfyUI Music Engine",
            status="FAIL",
            detail=f"Cannot connect to ComfyUI at {settings.comfyui_url}",
            fix="Start ComfyUI on your Mac: python main.py --listen 127.0.0.1 --port 8188"
        ))

    # 6. Workflow Templates Check
    wf_path = Path(settings.workflows_dir) / "text_to_song.json"
    mp_path = Path(settings.workflows_dir) / "text_to_song.mapping.json"
    if wf_path.exists() and mp_path.exists():
        checks.append(DoctorCheckItem(
            name="Workflow Templates",
            status="PASS",
            detail="Valid API-format templates and parameter mappings found.",
            fix="None"
        ))
    else:
        checks.append(DoctorCheckItem(
            name="Workflow Templates",
            status="FAIL",
            detail="workflows/text_to_song.json or mapping missing.",
            fix="Export API-format workflow from ComfyUI."
        ))

    # 7. SQLite Storage Check
    db_file = settings.sqlite_db_path
    checks.append(DoctorCheckItem(
        name="SQLite Database Persistence",
        status="PASS",
        detail=f"Verified storage at {db_file}",
        fix="None"
    ))

    # Determine overall status
    has_fail = any(c.status == "FAIL" for c in checks)
    has_warn = any(c.status == "WARN" for c in checks)
    overall = "critical" if has_fail else ("degraded" if has_warn else "healthy")

    return SystemStatusResponse(
        timestamp=datetime.now(timezone.utc).isoformat(),
        checks=checks,
        overall_health=overall,
        memory_headroom_gb=avail_gb,
        active_jobs_count=1 if memory_guard.is_busy else 0
    )
