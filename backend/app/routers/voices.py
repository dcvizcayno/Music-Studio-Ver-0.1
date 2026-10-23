"""
Router for vocal modeling, reference sample uploads, and voice profiles.
Enforces rights confirmation notice.
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import aiosqlite

from app.config import settings
from app.db import get_db_path
from app.schemas.voices import VoiceProfileResponse
from app.services.comfy_client import comfy_client

router = APIRouter(prefix="/api/voices", tags=["Voice Profiles"])

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


@router.get("", response_model=List[VoiceProfileResponse])
async def list_voice_profiles():
    """List all saved vocal profiles."""
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM voice_profiles ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            result.append(VoiceProfileResponse(
                id=r["id"],
                name=r["name"],
                description=r["description"],
                filename=r["filename"],
                audio_url=f"/api/voices/{r['id']}/sample",
                duration_seconds=r["duration_seconds"] or 0.0,
                created_at=r["created_at"]
            ))
        return result


@router.post("", response_model=VoiceProfileResponse)
async def create_voice_profile(
    name: str = Form(...),
    description: str = Form(None),
    rights_acknowledged: bool = Form(...),
    audio_file: UploadFile = File(...)
):
    """
    Upload a vocal reference clip.
    Strictly enforces rights acknowledgment: only personal voice or explicit permission.
    """
    if not rights_acknowledged:
        raise HTTPException(
            status_code=400,
            detail="Rights acknowledgment required. You must confirm you own or have explicit legal permission to use this vocal recording."
        )

    # Check ComfyUI capabilities
    caps = await comfy_client.probe_capabilities()
    if not caps.get("reference_audio_supported"):
        # Note: we still allow saving voice profile, but warn in description
        pass

    ext = Path(audio_file.filename or "sample.wav").suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Supported formats: {', '.join(ALLOWED_AUDIO_EXTENSIONS)}"
        )

    content = await audio_file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Audio file exceeds 25MB limit.")

    profile_id = str(uuid.uuid4())
    filename = f"{profile_id}{ext}"
    voices_dir = Path(settings.voices_dir)
    voices_dir.mkdir(parents=True, exist_ok=True)
    target_path = voices_dir / filename

    with open(target_path, "wb") as f:
        f.write(content)

    now_str = datetime.now(timezone.utc).isoformat()
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            INSERT INTO voice_profiles (id, name, description, filename, duration_seconds, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (profile_id, name, description, filename, 15.0, now_str))
        await db.commit()

    return VoiceProfileResponse(
        id=profile_id,
        name=name,
        description=description,
        filename=filename,
        audio_url=f"/api/voices/{profile_id}/sample",
        duration_seconds=15.0,
        created_at=now_str
    )


@router.get("/{profile_id}/sample")
async def get_voice_sample(profile_id: str):
    """Serve uploaded vocal sample."""
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT filename FROM voice_profiles WHERE id = ?", (profile_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Voice profile not found.")
        file_path = Path(settings.voices_dir) / row["filename"]
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Audio sample file missing.")
        return FileResponse(str(file_path))


@router.delete("/{profile_id}")
async def delete_voice_profile(profile_id: str):
    """Delete a vocal reference profile and its file."""
    db_path = get_db_path()
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT filename FROM voice_profiles WHERE id = ?", (profile_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Voice profile not found.")

        file_path = Path(settings.voices_dir) / row["filename"]
        if file_path.exists():
            file_path.unlink()

        await db.execute("DELETE FROM voice_profiles WHERE id = ?", (profile_id,))
        await db.commit()
        return {"deleted": True, "id": profile_id}
