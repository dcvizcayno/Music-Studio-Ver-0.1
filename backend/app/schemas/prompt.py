"""
Pydantic v2 schemas for prompt encoding, lyric style guide, and presets.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class PromptEncodeRequest(BaseModel):
    idea: str = Field(..., description="Core emotional premise or narrative concept")
    title: Optional[str] = Field(None, description="Optional working song title")
    genre: Optional[str] = Field("indie folk", description="Target musical genre")
    vocal_style: Optional[str] = Field(None, description="e.g. intimate male vocal, belt female")
    tempo: Optional[str] = Field("moderate", description="slow, moderate, upbeat or BPM")
    language: str = Field("English", description="Song language")
    qwen_model: Optional[str] = Field(None, description="Ollama model to use for drafting")


class PromptEncodeResponse(BaseModel):
    title: str
    lyrics: str
    style_tags: str
    writing_note: str
    genre: str
    mood: str
    tempo_bpm: int
    vocal_type: str
    character_count: int
    banned_words_found: List[str] = []
    has_em_dash: bool = False


class LyricGuideConfig(BaseModel):
    system_prompt: str
    banned_words: List[str] = Field(default_factory=lambda: ["narrator", "delve", "tapestry", "foster"])
    disallow_em_dash: bool = True
    max_characters: int = 3000


class StylePreset(BaseModel):
    id: str
    name: str
    genre: str
    instruments: str
    mood: str
    vocal_type: str
    tempo_bpm: int
    steps: int = 50
    cfg: float = 3.0
    duration_seconds: int = 60
