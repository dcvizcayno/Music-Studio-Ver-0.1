"""Async bridge from FastAPI to the local Mnemosyne memory engine."""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mnemosyne.memory_engine import MemoryUnavailable, memory_engine

logger = logging.getLogger("memory")


async def ensure() -> Dict[str, Any]:
    try:
        await asyncio.to_thread(memory_engine.ensure_qdrant)
        health = await asyncio.to_thread(memory_engine.health)
        logger.info("Memory: Qdrant %s, collection=%s, points=%s",
                    health["qdrant"]["status"], health["collection"], health["points"])
        return health
    except Exception as exc:
        logger.warning("Memory unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}


async def health() -> Dict[str, Any]:
    return await asyncio.to_thread(memory_engine.health)


async def context(query: str, agent: str = "qwen", limit: int = 5) -> str:
    header = f"Known user preferences for {agent} (apply only when relevant)"
    try:
        return await asyncio.to_thread(memory_engine.context, query, limit, header)
    except Exception as exc:
        logger.warning("Memory context failed: %s", exc)
        return ""


async def remember(text: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return await asyncio.to_thread(memory_engine.add, text, metadata)


async def feedback(job_id: str, rating: int, notes: str, tags: Optional[List[str]] = None,
                   title: str = "", style_tags: str = "") -> Dict[str, Any]:
    return await asyncio.to_thread(
        memory_engine.feedback, job_id, rating, notes, tags, title, style_tags
    )


async def all_memories(limit: int = 50) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(memory_engine.all, limit)
