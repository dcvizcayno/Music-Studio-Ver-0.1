"""Deterministic scoring for the YuE2 Song Studio release gate."""

from __future__ import annotations

from typing import Any, Dict, List

WEIGHTS = {
    "functional": 0.30,
    "audio": 0.20,
    "tests": 0.15,
    "ux": 0.15,
    "performance": 0.10,
    "security": 0.05,
    "docs": 0.05,
}

CATEGORY_CHECKS = {
    "functional": ["health_ok", "engine_ready", "generation_completed", "sse_terminal", "cover_completed", "resilience_passed", "abc_score", "vocal_gender_fed"],
    "audio": ["audio_exists", "duration_min", "sample_rate_48k", "stereo", "non_silent", "cover_audio_valid", "audio_quality_pass"],
    "tests": ["pytest_pass", "frontend_build"],
    "ux": ["page_loads", "tabs_present", "text_features", "interactive_score", "no_console_errors", "screenshot"],
    "performance": ["generation_under_limit", "swap_delta_under_limit"],
    "security": ["traversal_blocked", "invalid_job_blocked"],
    "docs": ["readme_mlx", "license_notice", "local_only"],
}

HARD_BLOCKERS = [
    "health_ok",
    "engine_ready",
    "generation_completed",
    "audio_exists",
    "pytest_pass",
    "frontend_build",
    "fake_engine_absent",
    "traversal_blocked",
    "abc_score",
    "vocal_gender_fed",
    "audio_quality_pass",
]


def evaluate(evidence: Dict[str, Any]) -> Dict[str, Any]:
    checks = evidence.get("checks", {})
    categories: Dict[str, Dict[str, Any]] = {}
    total = 0.0
    for category, names in CATEGORY_CHECKS.items():
        passed = [name for name in names if checks.get(name, {}).get("ok") is True]
        ratio = len(passed) / len(names) if names else 0.0
        score = round(ratio * 10, 2)
        total += WEIGHTS[category] * score
        categories[category] = {
            "score": score,
            "weight": WEIGHTS[category],
            "passed": passed,
            "missing": [name for name in names if name not in passed],
        }

    blockers = [
        name for name in HARD_BLOCKERS
        if checks.get(name, {}).get("ok") is not True
    ]
    score = round(total, 2)
    return {
        "score": score,
        "passed": score >= 8.00 and not blockers,
        "threshold": 8.00,
        "categories": categories,
        "blockers": blockers,
        "checks": checks,
        "metrics": evidence.get("metrics", {}),
        "commit": evidence.get("commit"),
        "timestamp": evidence.get("timestamp"),
    }
