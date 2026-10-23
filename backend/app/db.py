"""
SQLite database initialization, migration, and CRUD operations using aiosqlite.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import aiosqlite

from app.config import settings


def get_db_path() -> Path:
    db_path = settings.sqlite_db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


async def init_db() -> None:
    """Run re-runnable migrations on the SQLite database."""
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        # 1. Jobs Table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                idea TEXT,
                lyrics TEXT,
                style_tags TEXT,
                model_name TEXT,
                qwen_model TEXT,
                seed INTEGER,
                steps INTEGER,
                cfg REAL,
                duration_seconds INTEGER,
                progress INTEGER DEFAULT 0,
                stage_name TEXT DEFAULT 'Queued',
                audio_path TEXT,
                error_message TEXT,
                workflow_snapshot TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)

        # 2. Voice Profiles Table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS voice_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                filename TEXT NOT NULL,
                duration_seconds REAL DEFAULT 0.0,
                created_at TEXT NOT NULL
            );
        """)

        # 3. Settings Key-Value Table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)

        # Seed presets if not present
        cursor = await db.execute("SELECT value_json FROM settings WHERE key = 'presets'")
        row = await cursor.fetchone()
        if not row:
            preset_file = Path(settings.config_dir) / "default_settings.json"
            if preset_file.exists():
                try:
                    with open(preset_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    await db.execute(
                        "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                        ("presets", json.dumps(data.get("presets", [])), datetime.now(timezone.utc).isoformat())
                    )
                except Exception:
                    pass

        # Seed lyric guide if not present
        cursor = await db.execute("SELECT value_json FROM settings WHERE key = 'lyric_guide'")
        row = await cursor.fetchone()
        if not row:
            guide_file = Path(settings.config_dir) / "lyric_guide.json"
            if guide_file.exists():
                try:
                    with open(guide_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    await db.execute(
                        "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                        ("lyric_guide", json.dumps(data), datetime.now(timezone.utc).isoformat())
                    )
                except Exception:
                    pass

        await db.commit()


# --- Database Helper Functions ---

async def create_job(job_dict: Dict[str, Any]) -> None:
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT INTO jobs (
                id, title, type, status, idea, lyrics, style_tags,
                model_name, qwen_model, seed, steps, cfg, duration_seconds,
                progress, stage_name, audio_path, error_message,
                workflow_snapshot, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            job_dict["id"],
            job_dict["title"],
            job_dict["type"],
            job_dict["status"],
            job_dict.get("idea"),
            job_dict.get("lyrics"),
            job_dict.get("style_tags"),
            job_dict.get("model_name"),
            job_dict.get("qwen_model"),
            job_dict.get("seed"),
            job_dict.get("steps"),
            job_dict.get("cfg"),
            job_dict.get("duration_seconds"),
            job_dict.get("progress", 0),
            job_dict.get("stage_name", "Queued"),
            job_dict.get("audio_path"),
            job_dict.get("error_message"),
            json.dumps(job_dict.get("workflow_snapshot")) if job_dict.get("workflow_snapshot") else None,
            job_dict["created_at"],
            job_dict["updated_at"]
        ))
        await db.commit()


async def update_job_progress(job_id: str, status: str, progress: int, stage_name: str, audio_path: Optional[str] = None, error_message: Optional[str] = None) -> None:
    db_path = get_db_path()
    now_str = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            UPDATE jobs
            SET status = ?, progress = ?, stage_name = ?, audio_path = COALESCE(?, audio_path),
                error_message = COALESCE(?, error_message), updated_at = ?
            WHERE id = ?
        """, (status, progress, stage_name, audio_path, error_message, now_str, job_id))
        await db.commit()


async def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("workflow_snapshot"):
            try:
                d["workflow_snapshot"] = json.loads(d["workflow_snapshot"])
            except Exception:
                pass
        return d


async def list_jobs(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset)
        )
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if d.get("workflow_snapshot"):
                try:
                    d["workflow_snapshot"] = json.loads(d["workflow_snapshot"])
                except Exception:
                    pass
            result.append(d)
        return result


async def delete_job(job_id: str) -> bool:
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        await db.commit()
        return cursor.rowcount > 0


# --- Setting Store ---

async def get_setting(key: str) -> Optional[Any]:
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("SELECT value_json FROM settings WHERE key = ?", (key,))
        row = await cursor.fetchone()
        if not row:
            return None
        try:
            return json.loads(row[0])
        except Exception:
            return row[0]


async def set_setting(key: str, value: Any) -> None:
    db_path = get_db_path()
    now_str = datetime.now(timezone.utc).isoformat()
    value_json = json.dumps(value)
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT INTO settings (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
        """, (key, value_json, now_str))
        await db.commit()
