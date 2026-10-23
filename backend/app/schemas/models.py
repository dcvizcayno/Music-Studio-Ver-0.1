"""
Pydantic v2 schemas for models and capability inspection.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class OllamaModelItem(BaseModel):
    name: str
    size_bytes: int = 0
    size_formatted: str = "Unknown"
    parameter_size_b: Optional[float] = None
    is_qwen: bool = False
    is_recommended: bool = False
    exceeds_recommended_size: bool = False


class OllamaTagsResponse(BaseModel):
    reachable: bool
    models: List[OllamaModelItem] = []
    default_model: str
    error: Optional[str] = None


class ComfyUIModelItem(BaseModel):
    filename: str
    size_bytes: Optional[int] = None
    is_yue2: bool = True
    variant: Optional[str] = None


class ComfyUIModelsResponse(BaseModel):
    reachable: bool
    models: List[ComfyUIModelItem] = []
    default_model: str
    error: Optional[str] = None


class CapabilitiesResponse(BaseModel):
    comfyui_reachable: bool
    ollama_reachable: bool
    comfyui_version: str = "Unknown"
    text_to_song_supported: bool = True
    reference_audio_supported: bool = False
    cover_conditioning_supported: bool = False
    precision_options: List[str] = Field(default_factory=lambda: ["bf16", "fp16", "fp32"])
    detected_yue_nodes: List[str] = []
    missing_nodes: List[str] = []
    detected_models: List[str] = []
    unified_memory_total_gb: float = 24.0
    last_probed_at: Optional[str] = None
    status_summary: str = "System ready."
