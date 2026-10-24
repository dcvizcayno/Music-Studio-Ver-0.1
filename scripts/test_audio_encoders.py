"""
Standalone test script to verify all 8 audio encoders with FFmpeg:
WAV, AIFF, FLAC, ALAC, MP3, AAC, OGG, OPUS
"""

import asyncio
import math
import struct
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.audio_encoder import encode_audio_file, FORMAT_CONFIGS


def create_test_wav(filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 44100
    duration_s = 1.5
    num_samples = int(sample_rate * duration_s)

    data_bytes = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        val = 0.5 * math.sin(2 * math.pi * 440.0 * t)  # 440 Hz tone
        sample = int(val * 32767)
        data_bytes.extend(struct.pack("<h", sample))

    byte_rate = sample_rate * 2
    block_align = 2
    data_len = len(data_bytes)
    riff_len = 36 + data_len

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", riff_len, b"WAVE",
        b"fmt ", 16, 1, 1,
        sample_rate, byte_rate, block_align, 16,
        b"data", data_len
    )

    with open(filepath, "wb") as f:
        f.write(header + data_bytes)


async def main():
    test_dir = Path("/tmp/yue2_encoder_test")
    test_dir.mkdir(parents=True, exist_ok=True)
    src_wav = test_dir / "source_test.wav"
    create_test_wav(src_wav)
    print(f"Created test source WAV: {src_wav} ({src_wav.stat().st_size} bytes)")

    formats = ["wav", "aiff", "flac", "alac", "mp3", "aac", "ogg", "opus"]
    results = {}

    for fmt in formats:
        try:
            out_file, mime, ext = await encode_audio_file(
                input_path=src_wav,
                output_dir=test_dir / "out",
                target_format=fmt,
                base_name=f"test_{fmt}",
                sample_rate=48000 if fmt in ["opus", "alac"] else 44100,
                bit_depth=24 if fmt in ["wav", "aiff"] else 16,
                bitrate_kbps=256 if fmt in ["mp3", "aac", "ogg", "opus"] else 320,
                channels=2
            )
            size = out_file.stat().st_size
            results[fmt] = {"status": "SUCCESS", "size": size, "path": str(out_file), "mime": mime}
            print(f"[PASS] {fmt.upper():<5} -> {out_file.name} ({size} bytes, {mime})")
        except Exception as e:
            results[fmt] = {"status": "FAILED", "error": str(e)}
            print(f"[FAIL] {fmt.upper():<5} -> {e}")

    all_passed = all(r["status"] == "SUCCESS" for r in results.values())
    if all_passed:
        print("\nAll 8 audio encoders passed successfully!")
        return 0
    else:
        print("\nSome audio encoders failed.")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
