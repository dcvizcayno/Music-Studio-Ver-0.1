from typing import List, Optional
from pydantic import BaseModel, Field


class MemoryFeedbackRequest(BaseModel):
    job_id: str
    rating: int = Field(ge=1, le=5)
    notes: str = Field(default="", max_length=4000)
    tags: List[str] = Field(default_factory=list)


class MemoryRememberRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    metadata: Optional[dict] = None
