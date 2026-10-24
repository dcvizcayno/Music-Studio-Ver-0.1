"""
Audio Transcoding & Encoding Engine for YuE2 Song Studio.
Supports:
- WAV (Waveform Audio File Format)
- AIFF (Audio Interchange File Format)
- FLAC (Free Lossless Audio Codec)
- ALAC (Apple Lossless Audio Codec - M4A container)
- MP3 (MPEG Audio Layer III)
- AAC (Advanced Audio Coding - M4A container)
- Ogg Vorbis (.ogg)
- Opus / M4A (.opus / .m4a)
"""

import asyncio
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Optional, Tuple

logger = logging.getLogger("audio_encoder")

FORMAT_CONFIGS = {
    "wav": {
        "ext": ".wav",
        "mime": "audio/wav",
        "lossless": True,
        "name": "WAV (Waveform Audio File Format)"
    },
    "aiff": {
        "ext": ".aiff",
        "mime": "audio/aiff",
        "lossless": True,
        "name": "AIFF (Audio Interchange File Format)"
    },
    "flac": {
        "ext": ".flac",
        "mime": "audio/flac",
        "lossless": True,
        "name": "FLAC (Free Lossless Audio Codec)"
    },
    "alac": {
        "ext": ".m4a",
        "mime": "audio/mp4",
        "lossless": True,
        "name": "ALAC (Apple Lossless Audio Codec)"
    },
    "mp3": {
        "ext": ".mp3",
        "mime": "audio/mpeg",
        "lossless": False,
        "name": "MP3 (MPEG Audio Layer III)"
    },
    "aac": {
        "ext": ".m4a",
        "mime": "audio/mp4",
        "lossless": False,
        "name": "AAC (Advanced Audio Coding)"
    },
    "ogg": {
        "ext": ".ogg",
        "mime": "audio/ogg",
        "lossless": False,
        "name": "Ogg Vorbis"
    },
    "opus": {
        "ext": ".opus",
        "mime": "audio/opus",
        "lossless": False,
        "name": "Opus Interactive Audio"
    }
}


def build_ffmpeg_args(
    input_file: Path,
    output_file: Path,
    target_format: str,
    sample_rate: int = 44100,
    bit_depth: int = 16,
    bitrate_kbps: int = 320,
    channels: int = 2
) -> list:
    fmt = target_format.lower().strip()
    from app.config import settings
    cmd = [str(settings.ffmpeg_bin), "-y", "-i", str(input_file), "-vn"]

    # Channel configuration
    if channels in [1, 2]:
        cmd.extend(["-ac", str(channels)])

    # Sample rate configuration
    if sample_rate in [44100, 48000, 88200, 96000]:
        cmd.extend(["-ar", str(sample_rate)])

    if fmt == "wav":
        if bit_depth == 24:
            codec = "pcm_s24le"
        elif bit_depth == 32:
            codec = "pcm_f32le"
        else:
            codec = "pcm_s16le"
        cmd.extend(["-c:a", codec])

    elif fmt == "aiff":
        if bit_depth == 24:
            codec = "pcm_s24be"
        elif bit_depth == 32:
            codec = "pcm_f32be"
        else:
            codec = "pcm_s16be"
        cmd.extend(["-c:a", codec])

    elif fmt == "flac":
        cmd.extend(["-c:a", "flac"])
        if bit_depth == 24:
            cmd.extend(["-sample_fmt", "s32"])
        else:
            cmd.extend(["-sample_fmt", "s16"])

    elif fmt == "alac":
        cmd.extend(["-c:a", "alac"])

    elif fmt == "mp3":
        cmd.extend(["-c:a", "libmp3lame", "-b:a", f"{bitrate_kbps}k"])

    elif fmt == "aac":
        cmd.extend(["-c:a", "aac", "-b:a", f"{bitrate_kbps}k"])

    elif fmt == "ogg":
        cmd.extend(["-c:a", "libvorbis", "-b:a", f"{bitrate_kbps}k"])

    elif fmt == "opus":
        cmd.extend(["-c:a", "libopus", "-b:a", f"{bitrate_kbps}k"])

    else:
        # Fallback to copy or standard wav
        cmd.extend(["-c:a", "pcm_s16le"])

    cmd.append(str(output_file))
    return cmd


async def encode_audio_file(
    input_path: Path,
    output_dir: Path,
    target_format: str,
    base_name: str = "master_audio",
    sample_rate: int = 44100,
    bit_depth: int = 16,
    bitrate_kbps: int = 320,
    channels: int = 2
) -> Tuple[Path, str, str]:
    """
    Transcode an audio file using ffmpeg to the desired target format.
    Returns: (output_path, mime_type, file_extension)
    """
    if not input_path.exists():
        raise FileNotFoundError(f"Input audio file not found: {input_path}")

    fmt = target_format.lower().strip()
    if fmt not in FORMAT_CONFIGS:
        raise ValueError(f"Unsupported format '{target_format}'. Supported: {', '.join(FORMAT_CONFIGS.keys())}")

    config = FORMAT_CONFIGS[fmt]
    ext = config["ext"]
    mime = config["mime"]

    output_dir.mkdir(parents=True, exist_ok=True)
    # Target file named with format and parameters
    safe_base = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "master"
    output_filename = f"{safe_base}_{fmt}_{sample_rate}hz{ext}"
    output_path = output_dir / output_filename

    # If input is already in same format and parameters, return early
    if input_path.suffix.lower() == ext and fmt == "wav" and bit_depth == 16:
        shutil.copy2(input_path, output_path)
        return output_path, mime, ext

    cmd = build_ffmpeg_args(
        input_file=input_path,
        output_file=output_path,
        target_format=fmt,
        sample_rate=sample_rate,
        bit_depth=bit_depth,
        bitrate_kbps=bitrate_kbps,
        channels=channels
    )

    logger.info(f"Running ffmpeg encoding: {' '.join(cmd)}")
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace")
        logger.error(f"FFmpeg encoding failed (code {proc.returncode}): {err_msg}")
        raise RuntimeError(f"FFmpeg encoding failed: {err_msg[:400]}")

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError("Encoded audio output was not created or is 0 bytes.")

    return output_path, mime, ext
