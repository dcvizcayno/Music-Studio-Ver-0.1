"""
Pydantic v2 schemas for voice reference profiles and system status.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class VoiceProfileCreate(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=300)
    rights_acknowledged: bool = Field(..., description="User confirmation that they own or have permission to use the voice sample")


class VoiceProfileResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    filename: str
    audio_url: str
    duration_seconds: float
    created_at: str


class DoctorCheckItem(BaseModel):
    name: str
    status: str  # PASS, WARN, FAIL, INFO
    detail: str
    fix: Optional[str] = None


class SystemStatusResponse(BaseModel):
    timestamp: str
    checks: List[DoctorCheckItem]
    overall_health: str  # healthy, degraded, critical
    memory_headroom_gb: float
    active_jobs_count: int
