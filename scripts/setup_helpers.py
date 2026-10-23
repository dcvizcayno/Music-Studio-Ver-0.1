#!/usr/bin/env python3
"""
YuE2 Song Studio - Setup Helper Utilities.
Discovers local ComfyUI installations, tests free ports, and initializes SQLite.
"""

import json
import os
import socket
import sys
from pathlib import Path
import urllib.request
import urllib.error

COMMON_COMFY_PATHS = [
    Path.home() / "ComfyUI",
    Path.home() / "Documents" / "ComfyUI",
    Path.home() / "Desktop" / "ComfyUI",
    Path("/Applications/ComfyUI"),
    Path("/Users/shared/ComfyUI"),
]


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def find_available_port(start_port: int, max_attempts: int = 20) -> int:
    port = start_port
    while is_port_in_use(port) and port < start_port + max_attempts:
        port += 1
    return port


def locate_comfyui(custom_path: str = "") -> list:
    candidates = []
    if custom_path:
        p = Path(custom_path).expanduser().resolve()
        if p.exists() and (p / "main.py").exists():
            candidates.append(p)

    for p in COMMON_COMFY_PATHS:
        expanded = p.expanduser().resolve()
        if expanded.exists() and (expanded / "main.py").exists():
            if expanded not in candidates:
                candidates.append(expanded)

    return [str(c) for c in candidates]


def check_comfyui_object_info(url: str = "http://127.0.0.1:8188") -> dict:
    try:
        req = urllib.request.Request(f"{url.rstrip('/')}/object_info", headers={"User-Agent": "YuE2Setup"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                nodes = list(data.keys())
                yue_nodes = [n for n in nodes if any(k in n.lower() for k in ["yue", "song", "audio", "vocoder"])]
                return {
                    "reachable": True,
                    "total_nodes": len(nodes),
                    "yue_nodes": yue_nodes
                }
    except Exception as e:
        return {"reachable": False, "error": str(e), "yue_nodes": []}
    return {"reachable": False, "yue_nodes": []}


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else ""

    if action == "find_comfy":
        custom = sys.argv[2] if len(sys.argv) > 2 else ""
        found = locate_comfyui(custom)
        print(json.dumps(found))

    elif action == "find_port":
        start = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
        free_port = find_available_port(start)
        print(free_port)

    elif action == "probe_comfy":
        url = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8188"
        res = check_comfyui_object_info(url)
        print(json.dumps(res))

    else:
        print("Usage: setup_helpers.py [find_comfy|find_port|probe_comfy]")
