"""
Pydantic v2 schemas for song generation, covers, and queue jobs.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class GenerateSongRequest(BaseModel):
    title: str = Field(..., description="Song title")
    idea: Optional[str] = Field(None, description="Original idea / premise")
    lyrics: str = Field(..., description="Lyrics with [verse], [chorus] section tags")
    style_tags: str = Field(..., description="Genre, instruments, mood, tempo tags")
    model_name: Optional[str] = Field(None, description="YuE2 model checkpoint")
    seed: Optional[int] = Field(None, description="Random seed (auto-generated if omitted)")
    steps: int = Field(8, ge=1, le=64, description="NAR ODE steps: 8 draft, 16, 32 final")
    cfg: float = Field(1.0, ge=0.0, le=10.0, description="Kept for UI compatibility; MLX uses cfg_scale=1.0")
    duration_seconds: int = Field(60, ge=15, le=360, description="Maximum duration in seconds (up to 6 minutes)")
    precision: str = Field("8bit", description="8bit or bf16")
    qwen_model: Optional[str] = Field(None, description="Ollama model used for lyrics")
    cot: str = Field("full", pattern="^(full|melody|off)$", description="YuE2 planning mode")
    voice_profile_id: Optional[str] = Field(None, description="Vocal reference profile ID")


class CoverSongRequest(BaseModel):
    title: str = Field(..., description="Cover song title")
    source_audio_filename: str = Field(..., description="Uploaded audio file for source melody")
    new_genre: str = Field("synthwave", description="Target new genre")
    new_vocal_style: Optional[str] = Field(None, description="New vocal delivery")
    rewrite_lyrics: bool = Field(False, description="Whether Qwen rewrote lyrics")
    style_tags: str = Field(..., description="Full style tags for ComfyUI conditioning")
    lyrics: str = Field(..., description="Lyrics (original or rewritten)")
    seed: Optional[int] = Field(None)
    steps: int = Field(8, ge=1, le=64)
    duration_seconds: int = Field(90, ge=15, le=180)


class JobResponse(BaseModel):
    id: str
    title: str
    type: str  # text_to_song, cover, voice_clone
    status: str  # queued, encoding_prompt, freeing_memory, submitting_comfyui, generating, fetching_audio, completed, failed, cancelled
    idea: Optional[str] = None
    lyrics: Optional[str] = None
    style_tags: Optional[str] = None
    model_name: Optional[str] = None
    qwen_model: Optional[str] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    cfg: Optional[float] = None
    duration_seconds: Optional[int] = None
    progress: int = 0  # 0 to 100
    stage_name: str = "Initialized"
    audio_url: Optional[str] = None
    error_message: Optional[str] = None
    workflow_snapshot: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str


class JobListResponse(BaseModel):
    jobs: List[JobResponse]
    total: int


class JobProgressEvent(BaseModel):
    job_id: str
    status: str
    progress: int
    stage_name: str
    log_line: Optional[str] = None
    audio_url: Optional[str] = None
    error: Optional[str] = None
