"""SQLite persistence for jobs and studio settings."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiosqlite

from app.config import settings

JOB_COLUMNS = {
    "title", "type", "status", "idea", "lyrics", "style_tags", "model_name",
    "qwen_model", "seed", "steps", "cfg", "duration_seconds", "progress",
    "stage_name", "audio_path", "error_message", "params_json",
    "workflow_snapshot", "created_at", "updated_at", "started_at",
    "finished_at", "cancel_requested",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db_path() -> Path:
    path = settings.sqlite_db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


async def init_db() -> None:
    async with aiosqlite.connect(get_db_path()) as db:
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
                params_json TEXT,
                workflow_snapshot TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                cancel_requested INTEGER DEFAULT 0
            )
        """)
        # Additive migrations for databases created by the draft.
        for column, ddl in (
            ("params_json", "TEXT"),
            ("started_at", "TEXT"),
            ("finished_at", "TEXT"),
            ("cancel_requested", "INTEGER DEFAULT 0"),
        ):
            try:
                await db.execute(f"ALTER TABLE jobs ADD COLUMN {column} {ddl}")
            except Exception:
                pass

        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS voice_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                filename TEXT NOT NULL,
                duration_seconds REAL DEFAULT 0.0,
                created_at TEXT NOT NULL
            )
        """)

        for key, filename in (("presets", "default_settings.json"), ("lyric_guide", "lyric_guide.json")):
            cursor = await db.execute("SELECT 1 FROM settings WHERE key = ?", (key,))
            if await cursor.fetchone():
                continue
            source = settings.config_path / filename
            if not source.exists():
                continue
            data = json.loads(source.read_text(encoding="utf-8"))
            value = data.get("presets", []) if key == "presets" else data
            await db.execute(
                "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), now_iso()),
            )
        await db.commit()


def _decode(row: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(row)
    for key in ("params_json", "workflow_snapshot"):
        if data.get(key):
            try:
                data[key] = json.loads(data[key])
            except Exception:
                pass
    if "cancel_requested" in data:
        data["cancel_requested"] = bool(data["cancel_requested"])
    if isinstance(data.get("params_json"), dict):
        data["params"] = data["params_json"]
    return data


async def create_job(job: Dict[str, Any]) -> None:
    values = {
        "id": job["id"],
        "title": job.get("title") or "Untitled",
        "type": job.get("type") or "text_to_song",
        "status": job.get("status") or "queued",
        "idea": job.get("idea"),
        "lyrics": job.get("lyrics"),
        "style_tags": job.get("style_tags"),
        "model_name": job.get("model_name"),
        "qwen_model": job.get("qwen_model"),
        "seed": job.get("seed"),
        "steps": job.get("steps"),
        "cfg": job.get("cfg"),
        "duration_seconds": job.get("duration_seconds"),
        "progress": job.get("progress", 0),
        "stage_name": job.get("stage_name", "Queued"),
        "audio_path": job.get("audio_path"),
        "error_message": job.get("error_message"),
        "params_json": json.dumps(job["params"]) if job.get("params") is not None else None,
        "workflow_snapshot": json.dumps(job["workflow_snapshot"]) if job.get("workflow_snapshot") else None,
        "created_at": job.get("created_at") or now_iso(),
        "updated_at": job.get("updated_at") or now_iso(),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "cancel_requested": int(bool(job.get("cancel_requested", 0))),
    }
    placeholders = ", ".join("?" for _ in values)
    columns = ", ".join(values)
    async with aiosqlite.connect(get_db_path()) as db:
        await db.execute(
            f"INSERT INTO jobs ({columns}) VALUES ({placeholders})",
            tuple(values.values()),
        )
        await db.commit()


async def update_job(job_id: str, **fields: Any) -> None:
    if "params" in fields:
        fields["params_json"] = json.dumps(fields.pop("params"))
    fields = {k: v for k, v in fields.items() if k in JOB_COLUMNS}
    if not fields:
        return
    if "cancel_requested" in fields:
        fields["cancel_requested"] = int(bool(fields["cancel_requested"]))
    fields["updated_at"] = now_iso()
    assignments = ", ".join(f"{key} = ?" for key in fields)
    async with aiosqlite.connect(get_db_path()) as db:
        await db.execute(
            f"UPDATE jobs SET {assignments} WHERE id = ?",
            (*fields.values(), job_id),
        )
        await db.commit()


async def update_job_progress(
    job_id: str,
    status: str,
    progress: int,
    stage_name: str,
    audio_path: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    fields: Dict[str, Any] = {
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "stage_name": stage_name,
    }
    if audio_path is not None:
        fields["audio_path"] = audio_path
    if error_message is not None:
        fields["error_message"] = error_message
    await update_job(job_id, **fields)


async def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    async with aiosqlite.connect(get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
    return _decode(dict(row)) if row else None


async def list_jobs(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
    return [_decode(dict(row)) for row in rows]


async def get_pending_jobs() -> List[Dict[str, Any]]:
    async with aiosqlite.connect(get_db_path()) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC"
        )
        rows = await cursor.fetchall()
    return [_decode(dict(row)) for row in rows]


async def mark_orphans_failed() -> int:
    timestamp = now_iso()
    async with aiosqlite.connect(get_db_path()) as db:
        cursor = await db.execute(
            """UPDATE jobs SET status = 'failed', stage_name = 'Interrupted by restart',
                   error_message = 'Backend restarted while the job was running',
                   finished_at = ?, updated_at = ?
               WHERE status IN ('preparing','planning','generating','rendering')""",
            (timestamp, timestamp),
        )
        await db.commit()
        return cursor.rowcount


async def delete_job(job_id: str) -> bool:
    async with aiosqlite.connect(get_db_path()) as db:
        cursor = await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        await db.commit()
        return cursor.rowcount > 0


async def get_setting(key: str) -> Optional[Any]:
    async with aiosqlite.connect(get_db_path()) as db:
        cursor = await db.execute("SELECT value_json FROM settings WHERE key = ?", (key,))
        row = await cursor.fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except Exception:
        return row[0]


async def set_setting(key: str, value: Any) -> None:
    async with aiosqlite.connect(get_db_path()) as db:
        await db.execute(
            """INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                              updated_at = excluded.updated_at""",
            (key, json.dumps(value), now_iso()),
        )
        await db.commit()
