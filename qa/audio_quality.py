#!/usr/bin/env python3
"""Technical sound-quality and humanization proxy report for a rendered song.

This is not a substitute for listening. It catches the objective failures that
make output sound synthetic: clipping, missing stereo, dead dynamics, silence,
and excessive flatness. The human listening checklist is in audio_quality_agent.md.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT.parent / "tools/ffmpeg/bin/ffmpeg"
FFPROBE = ROOT.parent / "tools/ffmpeg/bin/ffprobe"


def run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return (proc.stderr or "") + (proc.stdout or "")


def probe(path: Path) -> dict:
    out = run([str(FFPROBE), "-v", "error", "-print_format", "json",
               "-show_format", "-show_streams", str(path)])
    try:
        data = json.loads(out[out.find("{"):])
    except Exception:
        data = {}
    stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    return {
        "duration": float(data.get("format", {}).get("duration") or 0),
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
    }


def loudness(path: Path) -> dict:
    text = run([str(FFMPEG), "-hide_banner", "-nostats", "-i", str(path),
                "-filter_complex", "ebur128=peak=true", "-f", "null", "-"])
    integrated = re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", text)
    lra = re.findall(r"LRA:\s*(-?[\d.]+)\s*LU", text)
    peak = re.findall(r"Peak:\s*(-?[\d.]+)\s*dBFS", text)
    return {
        "integrated_lufs": float(integrated[-1]) if integrated else None,
        "lra_lu": float(lra[-1]) if lra else None,
        "true_peak_dbfs": float(peak[-1]) if peak else None,
    }


def stats(path: Path) -> dict:
    text = run([str(FFMPEG), "-hide_banner", "-nostats", "-i", str(path),
                "-af", "astats=metadata=1:reset=0", "-f", "null", "-"])
    peaks = re.findall(r"Peak level dB:\s*(-?[\d.]+|-inf)", text)
    rms = re.findall(r"RMS level dB:\s*(-?[\d.]+|-inf)", text)
    flat = re.findall(r"Flat factor:\s*([\d.]+)", text)
    return {
        "peak_dbfs": max((float(p) for p in peaks if p != "-inf"), default=-99.0),
        "rms_dbfs": max((float(r) for r in rms if r != "-inf"), default=-99.0),
        "flat_factor": max((float(f) for f in flat), default=0.0),
    }


def evaluate(path: Path) -> dict:
    meta = probe(path)
    loud = loudness(path)
    st = stats(path)
    peak = max(filter(None, [loud.get("true_peak_dbfs"), st["peak_dbfs"]]), default=-99.0)
    lufs = loud.get("integrated_lufs")
    lra = loud.get("lra_lu")

    checks = {
        "exists": path.exists() and path.stat().st_size > 100_000,
        "stereo": meta["channels"] == 2,
        "sample_rate": meta["sample_rate"] == 48000,
        "duration": meta["duration"] > 5,
        "not_silent": st["rms_dbfs"] > -45,
        "no_clipping": peak <= -0.1,
        "loudness_ok": lufs is not None and -20.0 <= lufs <= -9.0,
        "dynamic_range_ok": lra is not None and lra >= 1.5,
        "not_flat": st["flat_factor"] < 20.0,
    }

    score = 10.0
    if not checks["no_clipping"]:
        score -= 2.5
    if not checks["loudness_ok"]:
        score -= 1.0
    if not checks["dynamic_range_ok"]:
        score -= 1.5
    if not checks["not_flat"]:
        score -= 1.0
    if not checks["stereo"]:
        score -= 1.5
    if not checks["sample_rate"]:
        score -= 0.5
    if not checks["not_silent"]:
        score -= 4.0
    score = max(0.0, round(score, 2))

    return {
        "audio": str(path),
        "meta": meta,
        "loudness": loud,
        "stats": st,
        "checks": checks,
        "humanization_proxy_score": score,
        "humanized_proxy_pass": score >= 7.5 and checks["no_clipping"] and checks["not_silent"],
        "note": "Technical proxy only. Confirm lyrics, pronunciation and naturalness by listening.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, default=ROOT / "qa/reports/cover.flac")
    parser.add_argument("--out", type=Path, default=ROOT / "qa/reports/audio_quality.json")
    args = parser.parse_args()
    report = evaluate(args.audio.resolve())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["humanized_proxy_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
