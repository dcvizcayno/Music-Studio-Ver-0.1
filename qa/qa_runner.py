"""End-to-end QA runner. Produces evidence and a scored report."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

ROOT = Path(__file__).resolve().parents[1]
QA_DIR = ROOT / "qa"
REPORTS = QA_DIR / "reports"
PYTHON = ROOT / ".venv/bin/python"
NODE_BIN = ROOT.parent / "tools/node/bin"
FFPROBE = ROOT.parent / "tools/ffmpeg/bin/ffprobe"
FFMPEG = ROOT.parent / "tools/ffmpeg/bin/ffmpeg"
BASE = "http://127.0.0.1:8000"

sys.path.insert(0, str(QA_DIR))
from scoring import evaluate  # noqa: E402


def check(checks: Dict[str, Any], name: str, ok: bool, detail: str, value: Any = None) -> None:
    checks[name] = {"ok": bool(ok), "detail": str(detail)[:800], "value": value}


def run(cmd: list[str], cwd: Path, timeout: int, env: Optional[dict] = None) -> subprocess.CompletedProcess:
    merged = os.environ.copy()
    merged["PATH"] = f"{NODE_BIN}:{merged.get('PATH', '')}"
    if env:
        merged.update(env)
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout, env=merged)


def swap_used_mb() -> float:
    output = subprocess.run(["sysctl", "vm.swapusage"], capture_output=True, text=True).stdout
    match = re.search(r"used = ([\d.]+)M", output)
    return float(match.group(1)) if match else 0.0


async def ensure_server() -> tuple[bool, Optional[subprocess.Popen]]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{BASE}/api/health")
            if response.status_code == 200:
                return True, None
    except Exception:
        pass
    process = subprocess.Popen(
        [str(PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(ROOT / "backend"),
        env={**os.environ, "PYTHONPATH": str(ROOT / "backend")},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(30):
        await asyncio.sleep(1)
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{BASE}/api/health")
                if response.status_code == 200:
                    return True, process
        except Exception:
            continue
    return False, process


async def probe_audio(path: Path) -> tuple[dict, bool, float]:
    result = run(
        [str(FFPROBE), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        ROOT, 30,
    )
    if result.returncode != 0:
        return {}, False, 0.0
    data = json.loads(result.stdout or "{}")
    stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    duration = float(data.get("format", {}).get("duration") or 0.0)
    vol = run(
        [str(FFMPEG), "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        ROOT, 60,
    )
    match = re.search(r"mean_volume:\s*(-?[\d.]+) dB", vol.stderr or "")
    mean_volume = float(match.group(1)) if match else -99.0
    return {
        "duration": duration,
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "bytes": path.stat().st_size,
        "mean_volume_db": mean_volume,
    }, True, mean_volume


async def generate_fixture(client: httpx.AsyncClient, checks: Dict[str, Any], metrics: Dict[str, Any]) -> None:
    payload = {
        "title": "QA Fixture",
        "lyrics": "[Verse]\nLight on the window\n[Chorus]\nHold the morning",
        "style_tags": "English, warm acoustic pop, female vocal, 90 BPM",
        "seed": 12345,
        "steps": 8,
        "cfg": 1.0,
        "duration_seconds": 15,
        "precision": "8bit",
        "cot": "full",
        "vocal_gender": "male",
    }
    started = time.time()
    try:
        response = await client.post(f"{BASE}/api/songs/generate", json=payload)
        response.raise_for_status()
        job = response.json()
    except Exception as exc:
        check(checks, "generation_completed", False, f"submit failed: {exc}")
        return

    deadline = time.time() + 900
    final: Dict[str, Any] = {}
    while time.time() < deadline:
        await asyncio.sleep(5)
        try:
            final = (await client.get(f"{BASE}/api/songs/{job['id']}")).json()
        except Exception:
            continue
        if final.get("status") in {"completed", "failed", "cancelled"}:
            break
    elapsed = time.time() - started
    metrics["generation_seconds"] = round(elapsed, 1)
    check(checks, "generation_completed", final.get("status") == "completed", f"status={final.get('status')} error={final.get('error_message')}")
    check(checks, "generation_under_limit", elapsed <= 600, f"{elapsed:.0f}s (limit 600s)", elapsed)

    audio_path = REPORTS / "latest.flac"
    if final.get("status") != "completed":
        check(checks, "audio_exists", False, "no completed job")
        return
    try:
        audio = await client.get(f"{BASE}/api/outputs/{job['id']}/audio.flac")
        audio.raise_for_status()
        audio_path.write_bytes(audio.content)
    except Exception as exc:
        check(checks, "audio_exists", False, f"download failed: {exc}")
        return

    info, ok, _ = await probe_audio(audio_path)
    metrics["audio"] = info
    check(checks, "audio_exists", ok and info.get("bytes", 0) > 500_000, f"{info.get('bytes', 0)} bytes")
    check(checks, "duration_min", info.get("duration", 0) >= 8, f"{info.get('duration', 0):.1f}s")
    check(checks, "sample_rate_48k", info.get("sample_rate") == 48000, str(info.get("sample_rate")))
    check(checks, "stereo", info.get("channels") == 2, str(info.get("channels")))
    check(checks, "non_silent", info.get("mean_volume_db", -99) > -45, f"{info.get('mean_volume_db')} dB")

    try:
        request_path = ROOT / "outputs" / job["id"] / "request.json"
        request_data = json.loads(request_path.read_text(encoding="utf-8"))
        style = str(request_data.get("style", "")).lower()
        check(checks, "vocal_gender_fed", "male vocal" in style and "female" not in style, style[:300])
    except Exception as exc:
        check(checks, "vocal_gender_fed", False, f"request inspection failed: {exc}")

    try:
        abc = await client.get(f"{BASE}/api/songs/{job['id']}/abc")
        text = abc.text.lstrip()
        check(checks, "abc_score", abc.status_code == 200 and text.startswith("X:") and "K:" in text, f"HTTP {abc.status_code}, {len(text)} chars")
    except Exception as exc:
        check(checks, "abc_score", False, f"ABC fetch failed: {exc}")

    try:
        async with client.stream("GET", f"{BASE}/api/songs/{job['id']}/events") as stream:
            body = await stream.aread()
        text = body.decode("utf-8", errors="replace")
        check(checks, "sse_terminal", "completed" in text and "data:" in text, text[:200])
    except Exception as exc:
        check(checks, "sse_terminal", False, f"SSE failed: {exc}")


async def generate_cover_fixture(client: httpx.AsyncClient, checks: Dict[str, Any], metrics: Dict[str, Any]) -> None:
    reference = REPORTS / "latest.flac"
    if not reference.exists():
        check(checks, "cover_completed", False, "no text fixture to cover")
        check(checks, "cover_audio_valid", False, "no reference")
        return
    started = time.time()
    try:
        with reference.open("rb") as handle:
            response = await client.post(
                f"{BASE}/api/songs/cover",
                data={
                    "title": "QA Cover Fixture",
                    "style_tags": "English, jazz-funk, warm male vocal, Rhodes, 96 BPM",
                    "lyrics": "",
                    "steps": "8",
                    "duration_seconds": "60",
                    "rights_acknowledged": "true",
                },
                files={"audio_file": ("reference.flac", handle, "audio/flac")},
                timeout=120.0,
            )
        response.raise_for_status()
        job = response.json()
    except Exception as exc:
        check(checks, "cover_completed", False, f"submit failed: {exc}")
        check(checks, "cover_audio_valid", False, "not generated")
        return

    final: Dict[str, Any] = {}
    deadline = time.time() + 900
    while time.time() < deadline:
        await asyncio.sleep(5)
        final = (await client.get(f"{BASE}/api/songs/{job['id']}")).json()
        if final.get("status") in {"completed", "failed", "cancelled"}:
            break
    metrics["cover_seconds"] = round(time.time() - started, 1)
    check(checks, "cover_completed", final.get("status") == "completed", f"status={final.get('status')} error={final.get('error_message')}")
    if final.get("status") != "completed":
        check(checks, "cover_audio_valid", False, "not completed")
        return
    audio_path = REPORTS / "cover.flac"
    audio = await client.get(f"{BASE}/api/outputs/{job['id']}/audio.flac")
    audio.raise_for_status()
    audio_path.write_bytes(audio.content)
    info, ok, _ = await probe_audio(audio_path)
    metrics["cover_audio"] = info
    check(checks, "cover_audio_valid", ok and info.get("duration", 0) > 5 and info.get("channels") == 2, str(info))


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-cover", action="store_true")
    parser.add_argument("--with-resilience", action="store_true")
    parser.add_argument("--skip-generation", action="store_true")
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--skip-e2e", action="store_true")
    args = parser.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)
    checks: Dict[str, Any] = {}
    metrics: Dict[str, Any] = {}
    started = time.time()
    before_swap = swap_used_mb()
    server_ok, server_proc = await ensure_server()
    check(checks, "health_ok", server_ok, f"server reachable={server_ok}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            caps = (await client.get(f"{BASE}/api/capabilities")).json()
            check(checks, "engine_ready", bool(caps.get("mlx_available")), caps.get("mlx_detail", ""))
            check(checks, "ollama_reachable", bool(caps.get("ollama_reachable")), "Ollama tags")

            page = await client.get(f"{BASE}/")
            check(checks, "page_loads", page.status_code == 200 and "Song Studio" in page.text, f"HTTP {page.status_code}")

            bad = await client.get(f"{BASE}/api/jobs/not-a-uuid")
            check(checks, "invalid_job_blocked", bad.status_code == 404, f"HTTP {bad.status_code}")
            traversal = await client.get(f"{BASE}/api/outputs/..%2F..%2Fetc/audio.flac")
            check(checks, "traversal_blocked", traversal.status_code in {400, 404}, f"HTTP {traversal.status_code}")

            if not args.skip_generation:
                await generate_fixture(client, checks, metrics)
                if args.with_cover:
                    await generate_cover_fixture(client, checks, metrics)
                else:
                    check(checks, "cover_completed", False, "skipped (use --with-cover)")
                    check(checks, "cover_audio_valid", False, "skipped (use --with-cover)")
                if args.with_resilience:
                    resilience = run(
                        ["node", "qa/resilience.mjs"], ROOT, 240,
                        {"PLAYWRIGHT_BROWSERS_PATH": str(QA_DIR / ".browsers")},
                    )
                    try:
                        result = json.loads(resilience.stdout.strip().splitlines()[-1])
                    except Exception:
                        result = {}
                    ok = (
                        result.get("final_status") == "completed"
                        and result.get("banner") is True
                        and result.get("audio", 0) > 0
                        and result.get("disconnectMessage") is False
                    )
                    check(checks, "resilience_passed", ok, json.dumps(result)[:600])
                else:
                    check(checks, "resilience_passed", False, "skipped (use --with-resilience)")
            else:
                for name in ("generation_completed", "generation_under_limit", "audio_exists",
                             "duration_min", "sample_rate_48k", "stereo", "non_silent", "sse_terminal",
                             "cover_completed", "cover_audio_valid", "resilience_passed"):
                    check(checks, name, False, "skipped")
    finally:
        after_swap = swap_used_mb()
        delta = max(0.0, after_swap - before_swap) / 1024
        metrics["swap_delta_gb"] = round(delta, 2)
        check(checks, "swap_delta_under_limit", delta <= 2.0, f"{delta:.2f} GB", delta)
        if server_proc:
            server_proc.terminate()

    if not args.skip_build:
        pytest = run([str(PYTHON), "-m", "pytest", "tests", "-q"], ROOT / "backend", 180, {"PYTHONPATH": str(ROOT / "backend")})
        check(checks, "pytest_pass", pytest.returncode == 0, (pytest.stdout + pytest.stderr)[-600:])
        build = run(["npm", "run", "build"], ROOT / "frontend", 300)
        check(checks, "frontend_build", build.returncode == 0, (build.stdout + build.stderr)[-600:])
    else:
        check(checks, "pytest_pass", False, "skipped")
        check(checks, "frontend_build", False, "skipped")

    if not args.skip_e2e:
        e2e = run(["node", "qa/e2e.mjs"], ROOT, 180, {"PLAYWRIGHT_BROWSERS_PATH": str(QA_DIR / ".browsers")})
        try:
            ui = json.loads(e2e.stdout.strip().splitlines()[-1])
        except Exception:
            ui = {"ok": False, "error": (e2e.stdout + e2e.stderr)[-500:]}
        check(checks, "tabs_present", bool(ui.get("tabs")), str(ui.get("tabs")))
        check(checks, "text_features", ui.get("text_features") is True, str(ui.get("text_features")))
        check(checks, "no_console_errors", ui.get("console_errors", 1) == 0, str(ui.get("console_errors")))
        check(checks, "screenshot", (REPORTS / "ui.png").exists(), str(REPORTS / "ui.png"))
    else:
        for name in ("tabs_present", "text_features", "no_console_errors", "screenshot"):
            check(checks, name, False, "skipped")

    readme = (ROOT / "README.md").read_text(encoding="utf-8", errors="replace") if (ROOT / "README.md").exists() else ""
    check(checks, "readme_mlx", "mlx-Yue" in readme, "README mentions mlx-Yue")
    check(checks, "license_notice", "CC BY-NC" in readme or "non-commercial" in readme.lower(), "license notice")
    check(checks, "local_only", "127.0.0.1" in readme, "local binding documented")

    backend_text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (ROOT / "backend/app").rglob("*.py"))
    frontend_text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (ROOT / "frontend/src").rglob("*.ts*"))
    fake = "_create_defensive_wav" in backend_text or "synthesizeSongWavUrl" in frontend_text
    check(checks, "fake_engine_absent", not fake, "no synthetic audio fallback")

    evidence = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT), capture_output=True, text=True).stdout.strip(),
        "elapsed_seconds": round(time.time() - started, 1),
        "checks": checks,
        "metrics": metrics,
    }
    report = evaluate(evidence)
    (REPORTS / "evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    (REPORTS / "latest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"score": report["score"], "passed": report["passed"], "blockers": report["blockers"],
                      "categories": {k: v["score"] for k, v in report["categories"].items()},
                      "elapsed_seconds": evidence["elapsed_seconds"]}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
