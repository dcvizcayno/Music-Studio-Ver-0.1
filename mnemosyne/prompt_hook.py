"""Prompt-injection helpers shared by every agent."""

from __future__ import annotations

from typing import Iterable, Mapping, Any

MAX_CONTEXT_CHARS = 1600


def normalize_results(results: Iterable[Mapping[str, Any]]) -> list[str]:
    seen: set[str] = set()
    memories: list[str] = []
    for item in results:
        text = str(item.get("memory") or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        memories.append(text)
    return memories


def format_context(results: Iterable[Mapping[str, Any]], header: str = "Known user preferences and feedback") -> str:
    memories = normalize_results(results)
    if not memories:
        return ""
    body = "\n".join(f"- {item}" for item in memories)
    text = f"{header}:\n{body}"
    return text[:MAX_CONTEXT_CHARS]


def inject(system_prompt: str, context: str) -> str:
    if not context.strip():
        return system_prompt
    return f"{system_prompt.rstrip()}\n\n{context.strip()}"
