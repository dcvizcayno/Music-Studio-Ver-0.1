"""
Router for studio presets, generation defaults, and endpoint configurations.
"""

from typing import Any, Dict, List
from fastapi import APIRouter
from app.config import settings
from app.db import get_setting, set_setting
from app.schemas.prompt import StylePreset

router = APIRouter(prefix="/api/settings", tags=["Settings & Presets"])


@router.get("/presets", response_model=List[StylePreset])
async def get_presets():
    """Retrieve available song presets (Pop, Acoustic, Rock, Hip-hop, Ballad, custom)."""
    data = await get_setting("presets")
    if not data or not isinstance(data, list):
        # Fallback presets
        return [
            StylePreset(
                id="pop",
                name="Modern Pop",
                genre="pop, synth-pop, upbeat",
                instruments="punchy kick, sub bass, bright synth chords, crisp claps",
                mood="euphoric, vibrant, danceable",
                vocal_type="clear modern female lead, doubled chorus, autotune sheen",
                tempo_bpm=122,
                steps=50,
                cfg=3.2,
                duration_seconds=90
            ),
            StylePreset(
                id="acoustic",
                name="Intimate Acoustic",
                genre="indie folk, acoustic ballad",
                instruments="fingerpicked steel-string acoustic guitar, upright bass, soft room reverb",
                mood="intimate, bittersweet, warm",
                vocal_type="breathy close-mic male vocal, dry, raw emotion",
                tempo_bpm=78,
                steps=50,
                cfg=3.0,
                duration_seconds=75
            ),
            StylePreset(
                id="rock",
                name="Alt Rock / Grunge",
                genre="alternative rock, 90s post-grunge",
                instruments="overdriven electric guitars, dynamic live drums, heavy bassline",
                mood="gritty, driving, cathartic",
                vocal_type="raspy energetic male vocal, soaring chorus chest voice",
                tempo_bpm=134,
                steps=55,
                cfg=3.5,
                duration_seconds=90
            ),
            StylePreset(
                id="rnb",
                name="Alt R&B",
                genre="alternative R&B, dark ambient soul, moody trap soul",
                instruments="subtle 808 glide, filtered rhodes, atmospheric synth swells, pitched vocal chops",
                mood="sensual, nocturnal, moody",
                vocal_type="silky falsetto lead with warm intimate lower octave double",
                tempo_bpm=92,
                steps=50,
                cfg=3.1,
                duration_seconds=85
            ),
            StylePreset(
                id="lofi",
                name="Lo-Fi",
                genre="lo-fi, chillhop, dusty instrumental groove",
                instruments="vinyl crackle, warm dusty rhodes piano, mellow boom-bap drums, soft sub bass",
                mood="relaxed, reflective, nostalgic, late-night",
                vocal_type="soft melodic lo-fi vocal, warm tape saturation",
                tempo_bpm=82,
                steps=45,
                cfg=2.8,
                duration_seconds=60
            ),
            StylePreset(
                id="hiphop",
                name="Rap / Hip Hop",
                genre="rap, hip hop, modern boom-bap, rhythmic",
                instruments="punchy 808 bass, crisp snare, tight hi-hat rolls, dark atmospheric keys",
                mood="confident, rhythmic, focused, nocturnal",
                vocal_type="clear rhythmic rap flow, upfront vocal presence, doubled ad-libs",
                tempo_bpm=94,
                steps=50,
                cfg=3.2,
                duration_seconds=75
            ),
            StylePreset(
                id="ballad",
                name="Cinematic Piano Ballad",
                genre="cinematic ballad, orchestral pop",
                instruments="concert grand piano, lush cello quartet, subtle ambient pads",
                mood="poignant, sweeping, heartbreaking",
                vocal_type="expressive dynamic vocal with rich vibrato",
                tempo_bpm=68,
                steps=50,
                cfg=3.0,
                duration_seconds=90
            )
        ]
    return data


@router.post("/presets", response_model=List[StylePreset])
async def save_presets(presets: List[StylePreset]):
    """Save custom preset list."""
    await set_setting("presets", [p.model_dump() for p in presets])
    return presets


@router.get("/config")
async def get_studio_config():
    """Retrieve current runtime studio paths and URLs."""
    return {
        "ollama_url": settings.ollama_url,
        "default_ollama_model": settings.default_ollama_model,
        "comfyui_url": settings.comfyui_url,
        "comfyui_path": settings.comfyui_path,
        "workflows_dir": settings.workflows_dir,
        "outputs_dir": settings.outputs_dir,
        "min_free_memory_gb": settings.min_free_memory_gb,
        "auto_unload_models": settings.auto_unload_models
    }
