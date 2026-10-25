#!/usr/bin/env python3
"""End-to-end Mnemosyne retention/retrieval QA."""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BASE = "http://127.0.0.1:8000"


def main() -> int:
    probe = f"QA memory probe {uuid.uuid4().hex[:10]}"
    checks = {}
    try:
        health = httpx.get(f"{BASE}/api/memory/health", timeout=15).json()
        checks["qdrant_healthy"] = bool(health.get("ok") and health.get("qdrant", {}).get("ok"))
        checks["collection"] = health.get("collection") == "mnemosyne"
        jobs = httpx.get(f"{BASE}/api/jobs?limit=50", timeout=15).json().get("jobs", [])
        job = next((j for j in jobs if j.get("status") == "completed"), None)
        checks["completed_job"] = bool(job)
        if not job:
            raise RuntimeError("No completed job to attach feedback to")

        response = httpx.post(
            f"{BASE}/api/memory/feedback",
            json={"job_id": job["id"], "rating": 5, "notes": probe, "tags": ["qa"]},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        ids = [item.get("id") for item in payload.get("memory", {}).get("result", {}).get("results", [])]
        checks["feedback_stored"] = bool(ids)

        context = httpx.get(
            f"{BASE}/api/memory/context",
            params={"query": probe, "agent": "qwen"},
            timeout=30,
        ).json().get("context", "")
        checks["probe_retrieved"] = probe in context
        checks["context_bounded"] = len(context) <= 2000
        checks["context_nonempty"] = bool(context.strip())

        # Best-effort cleanup so QA probes do not pollute the user's memory.
        try:
            from mnemosyne.memory_engine import memory_engine
            m = memory_engine._get_memory()
            for memory_id in ids:
                if memory_id:
                    try:
                        m.delete(memory_id)
                    except Exception:
                        pass
            remaining = m.get_all(filters={"user_id": "song-studio"}, top_k=50).get("results", [])
            for item in remaining:
                if "QA memory probe" in str(item.get("memory", "")):
                    try:
                        m.delete(item["id"])
                    except Exception:
                        pass
            remaining = m.get_all(filters={"user_id": "song-studio"}, top_k=50).get("results", [])
            checks["probe_cleaned"] = not any("QA memory probe" in str(item.get("memory", "")) for item in remaining)
        except Exception as exc:
            checks["cleanup_error"] = str(exc)
            checks["probe_cleaned"] = False

        report = {"ok": all(checks.values()), "probe": probe, "checks": checks, "health": health}
        (ROOT / "qa/reports/memory_qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 0 if report["ok"] else 1
    except Exception as exc:
        report = {"ok": False, "probe": probe, "error": str(exc), "checks": checks}
        (ROOT / "qa/reports/memory_qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
