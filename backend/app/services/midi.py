"""Per-stem MIDI generation.

Pitched stems use Spotify Basic Pitch's Apache-2.0 ONNX model. Drums use an
onset + spectral-band classifier (kick / snare / closed hi-hat) because Basic
Pitch is a pitched-instrument model, not a drum transcriber.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import settings
from app.db import get_job
from app.services import stems

logger = logging.getLogger("midi")

MIDI_DEFS = [
    ("vocals", "Lead Vocal"),
    ("drums", "Drums"),
    ("bass", "Bass"),
    ("guitar", "Guitar"),
    ("piano", "Piano / Keyboard"),
    ("other", "Synth / Other"),
]

NOTES = [
    "Pitched stems (vocals, bass, guitar, piano, other) use Basic Pitch ONNX polyphonic transcription.",
    "Drums use onset detection plus spectral-band classification: kick (36), snare (38), closed hi-hat (42).",
    "MIDI is an estimate from the separated stem; bleed and effects can add or miss notes.",
]

_state: Dict[str, Dict[str, Any]] = {}
_tasks: Dict[str, asyncio.Task] = {}


def _paths(job_id: str) -> tuple[Path, Path, Path]:
    root = settings.outputs_path / job_id
    return root, root / "midi", root / "midi.tmp"


def read_midi(job_id: str) -> Optional[Dict[str, Any]]:
    _, final, _ = _paths(job_id)
    meta = final / "midi.json"
    if meta.exists():
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            data["status"] = "completed"
            return data
        except Exception:
            return None
    return None


def status(job_id: str) -> Dict[str, Any]:
    if job_id in _state:
        return _state[job_id]
    data = read_midi(job_id)
    if data:
        return data
    return {"status": "idle", "job_id": job_id, "stems": [], "notes": NOTES}


def _pitched_midi(source: Path, target: Path) -> int:
    from basic_pitch.inference import predict

    _, midi, events = predict(
        str(source),
        model_or_model_path=str(settings.basic_pitch_model),
        onset_threshold=0.5,
        frame_threshold=0.3,
        minimum_note_length=80,
        melodia_trick=True,
    )
    midi.write(str(target))
    return len(events)


def _drum_midi(source: Path, target: Path) -> int:
    import librosa
    import numpy as np
    import pretty_midi

    y, sr = librosa.load(str(source), sr=22050, mono=True)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)
    midi = pretty_midi.PrettyMIDI()
    drum = pretty_midi.Instrument(program=0, is_drum=True, name="Drums")
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low_band = freqs < 150
    high_band = freqs > 5000

    for t in onsets:
        start = max(0, int(float(t) * sr))
        frame = y[start:start + 2048]
        if len(frame) < 512:
            continue
        power = np.abs(librosa.stft(frame, n_fft=2048)) ** 2
        low = float(power[low_band].sum())
        high = float(power[high_band].sum())
        total = float(power.sum()) + 1e-9
        mid = max(0.0, total - low - high)
        if low > mid * 1.4 and low > high * 1.6:
            pitch = 36  # kick
        elif high > mid * 1.2 and high > low * 1.1:
            pitch = 42  # closed hi-hat
        else:
            pitch = 38  # snare
        rms = float(np.sqrt(np.mean(frame.astype(np.float32) ** 2)))
        velocity = int(np.clip(42 + rms * 220, 35, 122))
        drum.notes.append(pretty_midi.Note(velocity=velocity, pitch=pitch, start=float(t), end=float(t) + 0.08))
    midi.instruments.append(drum)
    midi.write(str(target))
    return len(drum.notes)


async def _run(job_id: str) -> None:
    root, final, tmp = _paths(job_id)
    source_dir = root / "stems"
    if not (source_dir / "stems.json").exists():
        _state[job_id] = {"status": "failed", "job_id": job_id, "error": "Split stems first", "stems": [], "notes": NOTES}
        return

    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True, exist_ok=True)
    _state[job_id] = {"status": "running", "job_id": job_id, "stage": "Transcribing stems to MIDI", "stems": [], "notes": NOTES}

    try:
        outputs = []
        for stem_id, label in MIDI_DEFS:
            source = source_dir / f"{stem_id}.wav"
            if not source.exists():
                continue
            target = tmp / f"{stem_id}.mid"
            if stem_id == "drums":
                count = await asyncio.to_thread(_drum_midi, source, target)
                method = "onset + spectral bands"
            else:
                count = await asyncio.to_thread(_pitched_midi, source, target)
                method = "Basic Pitch ONNX"
            outputs.append({
                "id": stem_id,
                "label": label,
                "file": f"/api/jobs/{job_id}/midi/{stem_id}.mid",
                "notes": count,
                "method": method,
                "bytes": target.stat().st_size,
            })

        shutil.rmtree(final, ignore_errors=True)
        final.mkdir(parents=True, exist_ok=True)
        for item in outputs:
            (tmp / f"{item['id']}.mid").replace(final / f"{item['id']}.mid")
        payload = {
            "status": "completed",
            "job_id": job_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "stems": outputs,
            "notes": NOTES,
        }
        (final / "midi.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        _state[job_id] = payload
        logger.info("MIDI ready for %s (%s tracks)", job_id, len(outputs))
    except Exception as exc:
        logger.exception("MIDI generation failed for %s", job_id)
        _state[job_id] = {"status": "failed", "job_id": job_id, "error": str(exc)[:1000], "stems": [], "notes": NOTES}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        _tasks.pop(job_id, None)


async def start(job_id: str) -> Dict[str, Any]:
    if stems.status(job_id).get("status") != "completed":
        raise ValueError("Split the stems first, then create MIDI")
    current = status(job_id)
    if current.get("status") in {"running", "completed"}:
        return current
    task = _tasks.get(job_id)
    if task and not task.done():
        return current
    _tasks[job_id] = asyncio.create_task(_run(job_id))
    return {"status": "running", "job_id": job_id, "stage": "Starting MIDI transcription", "stems": [], "notes": NOTES}
