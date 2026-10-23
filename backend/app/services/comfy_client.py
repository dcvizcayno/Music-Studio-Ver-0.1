"""
ComfyUI HTTP and WebSocket Client.
Handles capability inspection (/object_info), model discovery, prompt submission,
cancellation (/interrupt), and memory freeing (/free).
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
import websockets

from app.config import settings

logger = logging.getLogger("comfy_client")


class ComfyUIClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.comfyui_url).rstrip("/")
        self.client_id = str(uuid.uuid4())

    async def check_health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/object_info")
                return resp.status_code == 200
        except Exception:
            return False

    async def probe_capabilities(self) -> Dict[str, Any]:
        """
        Step 0 Capability Check:
        Query GET /object_info and discover registered custom nodes and features.
        Saves snapshot to config/capabilities.json.
        """
        config_file = Path(settings.config_dir) / "capabilities.json"
        config_file.parent.mkdir(parents=True, exist_ok=True)

        capabilities: Dict[str, Any] = {
            "comfyui_reachable": False,
            "ollama_reachable": False,
            "comfyui_version": "Unknown",
            "text_to_song_supported": False,
            "reference_audio_supported": False,
            "cover_conditioning_supported": False,
            "precision_options": ["bf16", "fp16", "fp32"],
            "detected_yue_nodes": [],
            "missing_nodes": [],
            "detected_models": [],
            "unified_memory_total_gb": 24.0,
            "last_probed_at": datetime.now(timezone.utc).isoformat(),
            "status_summary": "Offline or ComfyUI unreachable"
        }

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(f"{self.base_url}/object_info")
                if resp.status_code == 200:
                    capabilities["comfyui_reachable"] = True
                    object_info = resp.json()

                    # Scan for YuE / YuE2 and Audio nodes
                    registered_nodes = set(object_info.keys())
                    yue_nodes = [
                        node for node in registered_nodes
                        if any(k in node.lower() for k in ["yue", "song", "audio", "vocoder"])
                    ]
                    capabilities["detected_yue_nodes"] = sorted(yue_nodes)

                    # Check required nodes for text-to-song
                    # Support both standard YuE2 nodes and generic fallback audio nodes
                    has_sampler = any("sampler" in n.lower() or "yue" in n.lower() for n in registered_nodes)
                    has_loader = any("loader" in n.lower() or "checkpoint" in n.lower() for n in registered_nodes)
                    has_save_audio = "SaveAudio" in registered_nodes or any("save" in n.lower() and "audio" in n.lower() for n in registered_nodes)
                    capabilities["text_to_song_supported"] = bool(has_sampler or "YuE2Sampler" in registered_nodes)

                    # Reference audio / vocal cloning nodes
                    has_audio_loader = "LoadAudio" in registered_nodes or "YuEVoiceCondition" in registered_nodes or "YuE2VoiceConditioning" in registered_nodes
                    capabilities["reference_audio_supported"] = bool(has_audio_loader)

                    # Cover song conditioning nodes
                    has_cover_conditioning = any("cover" in n.lower() for n in registered_nodes) or bool(has_audio_loader)
                    capabilities["cover_conditioning_supported"] = bool(has_cover_conditioning)

                    # Scan models directory if available via loader options
                    detected_checkpoints = []
                    for node_name in ["YuE2CheckpointLoader", "CheckpointLoaderSimple", "YuECheckpointLoader"]:
                        if node_name in object_info:
                            inputs = object_info[node_name].get("input", {}).get("required", {})
                            for param in ["model_name", "ckpt_name"]:
                                if param in inputs and isinstance(inputs[param][0], list):
                                    detected_checkpoints.extend(inputs[param][0])

                    capabilities["detected_models"] = list(set(detected_checkpoints))
                    capabilities["status_summary"] = (
                        f"Connected to ComfyUI. {len(yue_nodes)} audio nodes detected. "
                        f"Text-to-song: {'Available' if capabilities['text_to_song_supported'] else 'Missing nodes'}."
                    )
                else:
                    capabilities["status_summary"] = f"ComfyUI returned HTTP {resp.status_code}"

        except Exception as e:
            logger.info(f"ComfyUI /object_info probe notice: {e}")
            capabilities["status_summary"] = "ComfyUI is not reachable at configured URL. Using fallback capability map."
            # Provide sensible defaults so user can explore UI while ComfyUI is starting
            capabilities["text_to_song_supported"] = True
            capabilities["detected_models"] = ["yue2-1b-preview.safetensors", "yue2-full-bf16.safetensors"]

        # Persist to disk
        try:
            with open(config_file, "w", encoding="utf-8") as f:
                json.dump(capabilities, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not write capabilities.json: {e}")

        return capabilities

    async def free_memory(self) -> bool:
        """Call ComfyUI POST /free to evacuate GPU models and purge cache."""
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    f"{self.base_url}/free",
                    json={"unload_models": True, "free_memory": True}
                )
                return resp.status_code == 200
        except Exception as e:
            logger.warning(f"Failed to call ComfyUI /free: {e}")
            return False

    async def interrupt(self) -> bool:
        """Call ComfyUI POST /interrupt to cleanly abort active synthesis."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(f"{self.base_url}/interrupt")
                return resp.status_code == 200
        except Exception as e:
            logger.warning(f"Failed to interrupt ComfyUI: {e}")
            return False

    async def queue_prompt(self, workflow_graph: Dict[str, Any]) -> str:
        """Submit an execution graph to ComfyUI POST /prompt and return the prompt_id."""
        payload = {
            "prompt": workflow_graph,
            "client_id": self.client_id
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(f"{self.base_url}/prompt", json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"ComfyUI POST /prompt failed (HTTP {resp.status_code}): {resp.text}")
            data = resp.json()
            prompt_id = data.get("prompt_id")
            if not prompt_id:
                raise RuntimeError(f"No prompt_id returned from ComfyUI: {data}")
            return prompt_id

    async def fetch_history(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Fetch execution history for completed prompt_id."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.base_url}/history/{prompt_id}")
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get(prompt_id)
        except Exception as e:
            logger.warning(f"Error fetching ComfyUI history for {prompt_id}: {e}")
        return None

    async def download_audio_file(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """Download synthesized audio file from ComfyUI GET /view endpoint."""
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(f"{self.base_url}/view", params=params)
            if resp.status_code != 200:
                raise RuntimeError(f"Failed to download audio from ComfyUI /view: HTTP {resp.status_code}")
            return resp.content


comfy_client = ComfyUIClient()
