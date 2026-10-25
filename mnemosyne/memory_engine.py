"""Mnemosyne memory engine: Mem0 + Qdrant + local Ollama.

Mem0 holds semantic memories; Qdrant is the vector store; Ollama provides both
the embedding model (nomic-embed-text) and the optional extraction/summary LLM
(qwen-fast or deepseek-r1). All services are local.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from .prompt_hook import format_context

ROOT = Path(__file__).resolve().parents[1]
MNEMOSYNE_DIR = ROOT / "mnemosyne"
QDRANT_DIR = MNEMOSYNE_DIR / "qdrant"
QDRANT_BIN = QDRANT_DIR / "bin" / "qdrant"
QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6333")
COLLECTION = os.environ.get("MNEMOSYNE_COLLECTION", "mnemosyne")
USER_ID = os.environ.get("MNEMOSYNE_USER_ID", "song-studio")
EMBED_MODEL = os.environ.get("MNEMOSYNE_EMBED_MODEL", "nomic-embed-text:latest")
LLM_MODEL = os.environ.get("MNEMOSYNE_LLM_MODEL", "qwen-fast:latest")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")

# Must be set before importing mem0.
os.environ.setdefault("MEM0_DIR", str(MNEMOSYNE_DIR / "mem0"))
os.environ.setdefault("MEM0_TELEMETRY", "false")
os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")

logger = logging.getLogger("mnemosyne")


class MemoryUnavailable(RuntimeError):
    pass


class MemoryEngine:
    def __init__(self) -> None:
        self._memory = None
        self._last_error: Optional[str] = None
        self._proc: Optional[subprocess.Popen] = None

    # ---------- Qdrant lifecycle ----------
    def qdrant_health(self) -> Dict[str, Any]:
        try:
            with httpx.Client(timeout=2.0) as client:
                r = client.get(f"{QDRANT_URL}/healthz")
                return {"ok": r.status_code == 200, "status": r.text.strip(), "url": QDRANT_URL}
        except Exception as exc:
            return {"ok": False, "status": str(exc), "url": QDRANT_URL}

    def ensure_qdrant(self, wait_seconds: int = 25) -> Dict[str, Any]:
        health = self.qdrant_health()
        if health["ok"]:
            return health
        if not QDRANT_BIN.exists():
            raise MemoryUnavailable(
                f"Qdrant binary missing at {QDRANT_BIN}. Run scripts/install-qdrant.sh."
            )
        QDRANT_DIR.joinpath("storage").mkdir(parents=True, exist_ok=True)
        QDRANT_DIR.joinpath("snapshots").mkdir(parents=True, exist_ok=True)
        (MNEMOSYNE_DIR / "logs").mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env.update({
            "QDRANT__STORAGE__STORAGE_PATH": str(QDRANT_DIR / "storage"),
            "QDRANT__STORAGE__SNAPSHOTS_PATH": str(QDRANT_DIR / "snapshots"),
            "QDRANT__SERVICE__HTTP_PORT": "6333",
            "QDRANT__SERVICE__GRPC_PORT": "6334",
            "QDRANT__TELEMETRY_DISABLED": "true",
            "QDRANT__LOG_LEVEL": "WARN",
        })
        log = open(MNEMOSYNE_DIR / "logs" / "qdrant.log", "ab")
        self._proc = subprocess.Popen(
            [str(QDRANT_BIN)], cwd=str(QDRANT_DIR), env=env,
            stdout=log, stderr=log, start_new_session=True,
        )
        (MNEMOSYNE_DIR / "logs" / "qdrant.pid").write_text(str(self._proc.pid))
        for _ in range(wait_seconds * 4):
            time.sleep(0.25)
            if self.qdrant_health()["ok"]:
                logger.info("Qdrant started on %s (pid %s)", QDRANT_URL, self._proc.pid)
                return self.qdrant_health()
        raise MemoryUnavailable("Qdrant did not become healthy")

    # ---------- Mem0 ----------
    def _get_memory(self):
        if self._memory is not None:
            return self._memory
        self.ensure_qdrant()
        from mem0 import Memory
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams

        qdrant = QdrantClient(url=QDRANT_URL)
        try:
            info = qdrant.get_collection(COLLECTION)
            size = info.config.params.vectors.size
            if size != 768:
                if (info.points_count or 0) == 0:
                    qdrant.delete_collection(COLLECTION)
                    qdrant.create_collection(
                        COLLECTION,
                        vectors_config=VectorParams(size=768, distance=Distance.COSINE),
                    )
                else:
                    raise MemoryUnavailable(
                        f"Qdrant collection {COLLECTION} has dim {size}, expected 768. "
                        "Migrate or remove it before enabling memory."
                    )
        except Exception as exc:
            if exc.__class__.__name__ == "UnexpectedResponse":
                qdrant.create_collection(
                    COLLECTION,
                    vectors_config=VectorParams(size=768, distance=Distance.COSINE),
                )
            else:
                raise

        config = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "host": "127.0.0.1",
                    "port": 6333,
                    "collection_name": COLLECTION,
                    "embedding_model_dims": 768,
                    "on_disk": True,
                },
            },
            "llm": {
                "provider": "ollama",
                "config": {"model": LLM_MODEL, "ollama_base_url": OLLAMA_URL},
            },
            "embedder": {
                "provider": "ollama",
                "config": {"model": EMBED_MODEL, "ollama_base_url": OLLAMA_URL},
            },
        }
        self._memory = Memory.from_config(config)
        return self._memory

    def health(self) -> Dict[str, Any]:
        q = self.qdrant_health()
        points = None
        if q["ok"]:
            try:
                from qdrant_client import QdrantClient
                points = QdrantClient(url=QDRANT_URL).get_collection(COLLECTION).points_count
            except Exception:
                points = None
        return {
            "ok": q["ok"] and self._last_error is None,
            "qdrant": q,
            "collection": COLLECTION,
            "points": points,
            "user": USER_ID,
            "embedding_model": EMBED_MODEL,
            "llm_model": LLM_MODEL,
            "error": self._last_error,
        }

    def add(self, text: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        text = text.strip()
        if not text:
            raise ValueError("Memory text is empty")
        try:
            m = self._get_memory()
            # Keep the raw preference/feedback. Mem0 still embeds it and dedupes
            # via Qdrant; infer=False avoids a second lossy LLM summarization.
            result = m.add(text, user_id=USER_ID, metadata=metadata or {}, infer=False)
            self._last_error = None
            return {"ok": True, "result": result}
        except Exception as exc:
            self._last_error = str(exc)
            logger.exception("Memory add failed")
            raise

    def _has_points(self) -> bool:
        try:
            from qdrant_client import QdrantClient
            info = QdrantClient(url=QDRANT_URL).get_collection(COLLECTION)
            return bool(info.points_count)
        except Exception:
            return False

    def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        if not query.strip() or not self._has_points():
            return []
        try:
            m = self._get_memory()
            result = m.search(query, filters={"user_id": USER_ID}, limit=limit)
            self._last_error = None
            return list(result.get("results", []))
        except Exception as exc:
            self._last_error = str(exc)
            logger.warning("Memory search failed: %s", exc)
            return []

    def context(self, query: str, limit: int = 5, header: Optional[str] = None,
                agent: str = "qwen") -> str:
        header = header or f"Known user preferences for {agent}"
        return format_context(self.search(query, limit=limit), header=header)

    def all(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            m = self._get_memory()
            result = m.get_all(filters={"user_id": USER_ID}, top_k=limit)
            return list(result.get("results", []))
        except Exception as exc:
            self._last_error = str(exc)
            return []

    def feedback(self, job_id: str, rating: int, notes: str, tags: Optional[List[str]] = None,
                 title: str = "", style_tags: str = "") -> Dict[str, Any]:
        rating = max(1, min(5, int(rating)))
        tags = tags or []
        text = (
            f"User feedback on song '{title or job_id}': rating {rating}/5. "
            f"Notes: {notes.strip().rstrip('.') or 'none'}. "
            f"Tags: {', '.join(tags) if tags else 'none'}. "
            f"Style: {style_tags[:300] or 'unknown'}."
        )
        return self.add(text, metadata={
            "type": "feedback", "job_id": job_id, "rating": rating, "tags": tags,
        })


memory_engine = MemoryEngine()
