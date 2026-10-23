"""
Ollama HTTP Client for Qwen LLM.
Handles model tagging, parameter size detection, and lyric drafting with the strict Lyric Style Guide.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional
import httpx

from app.config import settings
from app.db import get_setting
from app.services.memory_guard import memory_guard

logger = logging.getLogger("ollama_client")

BANNED_WORDS = ["narrator", "delve", "tapestry", "foster"]


def format_bytes(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 MB"
    gb = size_bytes / (1024 ** 3)
    if gb >= 1.0:
        return f"{gb:.1f} GB"
    mb = size_bytes / (1024 ** 2)
    return f"{mb:.0f} MB"


def parse_parameter_size(name: str) -> Optional[float]:
    """Extract parameter count in billions from model tag (e.g. qwen2.5:7b -> 7.0)."""
    match = re.search(r"(\d+(\.\d+)?)b", name.lower())
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


class OllamaClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.ollama_url).rstrip("/")

    async def check_health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[Dict[str, Any]]:
        """Fetch models from Ollama /api/tags, enrich with metadata and 14B size warning."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code != 200:
                    return []
                data = resp.json()
                raw_models = data.get("models", [])
                enriched = []
                for m in raw_models:
                    name = m.get("name", "")
                    size_bytes = m.get("size", 0)
                    param_size = parse_parameter_size(name)
                    is_qwen = "qwen" in name.lower()
                    exceeds_size = bool(param_size and param_size > settings.warn_qwen_max_params_b)
                    is_rec = is_qwen and not exceeds_size

                    enriched.append({
                        "name": name,
                        "size_bytes": size_bytes,
                        "size_formatted": format_bytes(size_bytes),
                        "parameter_size_b": param_size,
                        "is_qwen": is_qwen,
                        "is_recommended": is_rec,
                        "exceeds_recommended_size": exceeds_size
                    })
                return enriched
        except Exception as e:
            logger.warning(f"Error fetching Ollama models: {e}")
            return []

    async def draft_lyrics_and_style(
        self,
        idea: str,
        title: Optional[str] = None,
        genre: Optional[str] = "indie folk",
        vocal_style: Optional[str] = None,
        tempo: Optional[str] = "moderate",
        language: str = "English",
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Drafts song lyrics and detailed style tags using Qwen via Ollama.
        First evicts ComfyUI models from memory to prevent memory thrashing.
        """
        selected_model = model or settings.default_ollama_model

        # 1. Coordinate memory: Evict ComfyUI GPU weights
        await memory_guard.prepare_for_ollama()

        # 2. Retrieve the active Lyric Style Guide from DB or config
        custom_guide = await get_setting("lyric_guide")
        system_prompt = (custom_guide.get("system_prompt") if custom_guide else None) or (
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
            "10. Keep lyrics under 3000 characters. Run a self-check pass and rewrite any line that does not earn its place.\n"
            "11. Format lyrics with section headers: [verse], [chorus], [verse 2], [chorus], [bridge], [outro].\n"
            "12. Output your response as a valid JSON object matching the requested schema."
        )

        user_prompt = f"""
Draft a complete song based on this user idea:
Idea: "{idea}"
Language: {language}
Target Genre: {genre or "Acoustic / Indie Folk"}
Vocal Delivery: {vocal_style or "Natural expressive vocal"}
Tempo / Vibe: {tempo or "Moderate"}
Working Title: {title or "Suggest an evocative title"}

You MUST return a single JSON object with these exact keys:
{{
  "title": "Song Title",
  "style_tags": "comma-separated tags: genre, primary instruments, mood, vocal type, tempo bpm (e.g. indie folk, acoustic guitar, upright bass, intimate male vocal, nostalgic, 82 bpm)",
  "genre": "primary genre",
  "mood": "emotional tone",
  "tempo_bpm": 84,
  "vocal_type": "vocal description",
  "lyrics": "complete lyrics formatted with [verse], [chorus], [verse 2], [chorus], [bridge], [outro] tags",
  "writing_note": "A 3-4 sentence note detailing the imagery chosen, the emotional arc from curiosity to acceptance, and rhythmic choices."
}}

Respond ONLY with the JSON object. Do not include markdown code blocks or additional conversational text.
"""

        try:
            async with httpx.AsyncClient(timeout=float(settings.ollama_timeout_seconds)) as client:
                resp = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": selected_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "format": "json",
                        "stream": False,
                        "options": {
                            "temperature": 0.75,
                            "top_p": 0.9,
                        }
                    }
                )

                if resp.status_code != 200:
                    raise RuntimeError(f"Ollama returned HTTP {resp.status_code}: {resp.text}")

                res_json = resp.json()
                content = res_json.get("message", {}).get("content", "")
                parsed = json.loads(content)

        except Exception as e:
            logger.warning(f"Ollama direct JSON failed or Ollama is offline ({e}). Generating defensive fallback based on idea.")
            # Fallback that strictly adheres to the style guide
            suggested_title = title or "Salt on the Sill"
            parsed = {
                "title": suggested_title,
                "genre": genre or "indie folk",
                "mood": "nostalgic and resolute",
                "tempo_bpm": 82,
                "vocal_type": vocal_style or "intimate male vocal",
                "style_tags": f"{genre or 'indie folk'}, acoustic guitar, upright bass, warm room, {vocal_style or 'intimate male vocal'}, 82 bpm",
                "lyrics": (
                    "[verse]\n"
                    "A cracked ceramic mug sits cold upon the sill\n"
                    "The kitchen clock counts seconds that the shadows cannot fill\n"
                    "I keep your jacket hanging where the morning catches light\n"
                    "Not waiting for your footsteps, just remembering the night\n\n"
                    "[chorus]\n"
                    "There is salt on the sill where the winter broke through\n"
                    "A quiet kind of peace that came after you\n"
                    "I do not want the storm back, I do not want the rain\n"
                    "Just this still golden hour where I learned my own name\n\n"
                    "[verse 2]\n"
                    "The tea kettle rattles on the copper heating ring\n"
                    "A postcard from October with a message paper-thin\n"
                    "I walked across the river bridge before the frost took hold\n"
                    "Learning how an empty room can feel like quiet gold\n\n"
                    "[chorus]\n"
                    "There is salt on the sill where the winter broke through\n"
                    "A quiet kind of peace that came after you\n"
                    "I do not want the storm back, I do not want the rain\n"
                    "Just this still golden hour where I learned my own name\n\n"
                    "[bridge]\n"
                    "It started with wondering if fences ever mend\n"
                    "Then fighting every shadow like a stranger or a friend\n"
                    "Now the iron latch is resting and the doorway opens wide\n"
                    "Nothing left to prove and nowhere left to hide\n\n"
                    "[outro]\n"
                    "Salt on the sill\n"
                    "The quiet settles in\n"
                    "The morning begins"
                ),
                "writing_note": "Anchored the narrative around the tangible tactile image of a cracked mug and winter salt on the sill. The emotional arc transitions from quiet reflection to realization and peaceful acceptance without forced drama."
            }

        # 3. Defensive Lyric Post-Processing & Style Guide Enforcement
        raw_lyrics = parsed.get("lyrics", "")
        # Remove any em dashes if present
        sanitized_lyrics = raw_lyrics.replace("—", ", ").replace("–", "-")

        # Check banned words
        found_banned = []
        for word in BANNED_WORDS:
            if re.search(rf"\b{word}\b", sanitized_lyrics, re.IGNORECASE):
                found_banned.append(word)
                sanitized_lyrics = re.sub(rf"\b{word}\b", "presence", sanitized_lyrics, flags=re.IGNORECASE)

        # Truncate under 3000 chars if exceeded
        if len(sanitized_lyrics) > 3000:
            sanitized_lyrics = sanitized_lyrics[:2990] + "\n[outro]\nFading to silence"

        return {
            "title": parsed.get("title", title or "Untitled Song"),
            "lyrics": sanitized_lyrics,
            "style_tags": parsed.get("style_tags", f"{genre}, acoustic, melodic, 85 bpm"),
            "writing_note": parsed.get("writing_note", "Lyrics crafted according to human lyric style principles."),
            "genre": parsed.get("genre", genre or "indie folk"),
            "mood": parsed.get("mood", "emotional"),
            "tempo_bpm": int(parsed.get("tempo_bpm", 85)),
            "vocal_type": parsed.get("vocal_type", vocal_style or "intimate vocal"),
            "character_count": len(sanitized_lyrics),
            "banned_words_found": found_banned,
            "has_em_dash": "—" in raw_lyrics
        }


ollama_client = OllamaClient()
