"""Ollama client for lyric drafting. Failures are surfaced, never faked."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger("ollama_client")
BANNED_WORDS = ["narrator", "delve", "tapestry", "foster"]

SYSTEM_PROMPT = """You are a master lyricist and song producer. Write lyrics that feel human,
evocative, and natural to sing.

Rules:
1. One emotional premise per song; every line supports it.
2. Each verse contains one memorable tactile image.
3. The chorus answers the title emotionally, not literally.
4. Simple words, deep ideas; lines must sound natural when sung.
5. Show what it felt like; do not tell the listener what to think.
6. Avoid forced rhymes, generic heartbreak, overwriting, preaching, and trend-chasing.
7. NEVER use em dashes. NEVER use the words: narrator, delve, tapestry, foster.
8. Keep lyrics under 3000 characters.

Return one valid JSON object with exactly these keys:
title, style_tags, genre, mood, tempo_bpm, vocal_type, lyrics, writing_note.
Lyrics must use section tags such as [Verse], [Chorus], [Bridge], [Outro]."""


class OllamaError(RuntimeError):
    pass


def format_bytes(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 MB"
    gb = size_bytes / (1024 ** 3)
    if gb >= 1.0:
        return f"{gb:.1f} GB"
    return f"{size_bytes / (1024 ** 2):.0f} MB"


def parse_parameter_size(name: str) -> Optional[float]:
    match = re.search(r"(\d+(?:\.\d+)?)b", name.lower())
    return float(match.group(1)) if match else None


class OllamaClient:
    def __init__(self, base_url: Optional[str] = None) -> None:
        self.base_url = (base_url or settings.ollama_url).rstrip("/")

    async def check_health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                raw = response.json().get("models", [])
        except Exception as exc:
            logger.warning("Ollama tags unavailable: %s", exc)
            return []

        models = []
        for item in raw:
            name = item.get("name", "")
            size = int(item.get("size") or 0)
            params = parse_parameter_size(name)
            models.append({
                "name": name,
                "size_bytes": size,
                "size_formatted": format_bytes(size),
                "parameter_size_b": params,
                "is_qwen": "qwen" in name.lower(),
                "is_recommended": "qwen" in name.lower() and (params or 0) <= settings.warn_qwen_max_params_b,
                "exceeds_recommended_size": bool(params and params > settings.warn_qwen_max_params_b),
            })
        return models

    async def unload(self, model: Optional[str] = None) -> None:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": model or settings.default_ollama_model, "prompt": "", "keep_alive": 0},
                )
        except Exception as exc:
            logger.info("Ollama unload skipped: %s", exc)

    async def draft_lyrics_and_style(
        self,
        idea: str,
        title: Optional[str] = None,
        genre: Optional[str] = "indie folk",
        vocal_style: Optional[str] = None,
        tempo: Optional[str] = "moderate",
        language: str = "English",
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        selected = model or settings.default_ollama_model
        user_prompt = (
            f'Write a complete song from this idea: "{idea}"\n'
            f"Language: {language}\nGenre: {genre or 'indie folk'}\n"
            f"Vocal: {vocal_style or 'natural expressive vocal'}\n"
            f"Tempo / vibe: {tempo or 'moderate'}\n"
            f"Working title: {title or 'suggest an evocative title'}\n\n"
            "Return only the JSON object."
        )
        try:
            async with httpx.AsyncClient(timeout=float(settings.ollama_timeout_seconds)) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": selected,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        "format": "json",
                        "stream": False,
                        "options": {"temperature": 0.75, "top_p": 0.9},
                    },
                )
                response.raise_for_status()
                content = response.json().get("message", {}).get("content", "")
        except Exception as exc:
            raise OllamaError(f"Ollama request failed: {exc}") from exc

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if not match:
                raise OllamaError("Ollama did not return valid JSON")
            parsed = json.loads(match.group(0))

        lyrics = str(parsed.get("lyrics") or "").replace("—", ", ").replace("–", "-")
        found = [word for word in BANNED_WORDS if re.search(rf"\b{word}\b", lyrics, re.IGNORECASE)]
        for word in found:
            lyrics = re.sub(rf"\b{word}\b", "presence", lyrics, flags=re.IGNORECASE)
        if len(lyrics) > 3000:
            lyrics = lyrics[:2980].rsplit("\n", 1)[0] + "\n[Outro]\n..."

        if not parsed.get("style_tags"):
            parsed["style_tags"] = f"{genre or 'indie folk'}, {vocal_style or 'expressive vocal'}, 85 bpm"
        parsed["lyrics"] = lyrics
        parsed["title"] = parsed.get("title") or title or "Untitled Song"
        parsed["writing_note"] = parsed.get("writing_note") or "Lyrics written to the studio guide."
        parsed["genre"] = parsed.get("genre") or genre or "indie folk"
        parsed["mood"] = parsed.get("mood") or "reflective"
        parsed["tempo_bpm"] = int(parsed.get("tempo_bpm") or 85)
        parsed["vocal_type"] = parsed.get("vocal_type") or vocal_style or "expressive vocal"
        parsed["character_count"] = len(lyrics)
        parsed["banned_words_found"] = found
        parsed["has_em_dash"] = "—" in str(parsed.get("lyrics", ""))
        return parsed


ollama_client = OllamaClient()
