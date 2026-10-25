"""
Router for Qwen prompt encoding, lyric drafting, and Lyric Style Guide configuration.
"""

from fastapi import APIRouter, HTTPException
from app.db import get_setting, set_setting
from app.schemas.prompt import PromptEncodeRequest, PromptEncodeResponse, LyricGuideConfig
from app.services import memory
from app.services.ollama_client import ollama_client

router = APIRouter(prefix="/api/prompt", tags=["Prompt Encoder"])


@router.post("/encode", response_model=PromptEncodeResponse)
async def encode_prompt(request: PromptEncodeRequest):
    """
    Turns an idea into structured style tags and lyrics formatted with section tags,
    strictly abiding by the human lyric style rules.
    """
    if not request.idea.strip():
        raise HTTPException(status_code=400, detail="Song idea / premise cannot be empty.")

    memory_context = await memory.context(
        f"{request.idea} {request.genre or ''} {request.vocal_style or ''} {request.tempo or ''}",
        agent="qwen",
    )
    result = await ollama_client.draft_lyrics_and_style(
        idea=request.idea,
        title=request.title,
        genre=request.genre,
        vocal_style=request.vocal_style,
        tempo=request.tempo,
        language=request.language,
        model=request.qwen_model,
        memory_context=memory_context,
    )
    return result


@router.get("/guide", response_model=LyricGuideConfig)
async def get_lyric_guide():
    """Retrieve current Lyric Style Guide rules."""
    guide = await get_setting("lyric_guide")
    if not guide:
        # Default guide
        guide = {
            "system_prompt": (
                "You are a master lyricist and song producer. You write lyrics that feel human, evocative, and melodically natural.\n\n"
                "CRITICAL LYRIC STYLE GUIDE RULES:\n"
                "1. Story first: one emotional premise per song, and every line supports it.\n"
                "2. Each verse contains one memorable tactile image.\n"
                "3. The chorus answers the title emotionally, not literally. The title sits naturally in the chorus.\n"
                "4. Simple words, deep ideas. Lines must sound naturally spoken or sung.\n"
                "5. Emotional arc: curiosity, hope, conflict, realization, acceptance.\n"
                "6. Show what it felt like. Do not tell listeners what to think.\n"
                "7. Write the emotional aftermath of events, not only the events.\n"
                "8. Avoid: forced rhymes, generic heartbreak, overwriting, preaching, explaining instead of showing, chasing trends.\n"
                "9. NEVER use em dashes. NEVER use words: narrator, delve, tapestry, foster.\n"
                "10. Keep lyrics under 3000 characters. Run a self-check pass and rewrite any line that does not earn its place."
            ),
            "banned_words": ["narrator", "delve", "tapestry", "foster"],
            "disallow_em_dash": True,
            "max_characters": 3000
        }
    return guide


@router.post("/guide", response_model=LyricGuideConfig)
async def update_lyric_guide(guide: LyricGuideConfig):
    """Update editable Lyric Style Guide rules in settings."""
    await set_setting("lyric_guide", guide.model_dump())
    return guide
