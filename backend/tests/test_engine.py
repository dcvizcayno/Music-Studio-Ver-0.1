"""Contract tests for the MLX engine adapter and API guards."""

import json
from pathlib import Path

from app.services.engine import MlxEngine, parse_progress_line


def test_progress_parser_planning_and_render():
    event = parse_progress_line("[YuE2] Running Planning score: 120/400 tokens (30%) | 12.0 tokens/s | elapsed 10.0s")
    assert event is not None
    assert event.stage == "planning"
    assert 15 <= event.progress <= 35

    event = parse_progress_line("[YuE2] Running Synthesizing audio: 16/32 steps (50%) | elapsed 20.0s")
    assert event is not None
    assert event.stage == "rendering"
    assert event.progress >= 87

    event = parse_progress_line("[YuE2] Completed Decoding audio: 8/8 chunks | elapsed 30.0s")
    assert event is not None
    assert event.progress >= 98


def test_build_request_maps_duration_and_steps():
    engine = MlxEngine()
    job = {
        "id": "11111111-1111-1111-1111-111111111111",
        "style_tags": "English, indie pop, 96 BPM",
        "lyrics": "[Verse]\nhello",
        "seed": 42,
        "steps": 8,
        "duration_seconds": 60,
        "params": {"cot": "full"},
    }
    request = engine.build_request(job)
    assert request["generation_config"]["ode_steps"] == 8
    assert request["semantic_sampling"]["max_tokens"] == 60 * 25
    assert request["cot"] == "full"
    assert request["abc_sampling"]["max_tokens"] == 4096

    job["params"] = {"cot": "off"}
    request = engine.build_request(job)
    assert request["cot"] == "off"
    assert "abc_sampling" not in request


def test_build_request_clamps_duration():
    engine = MlxEngine()
    job = {
        "id": "11111111-1111-1111-1111-111111111111",
        "style_tags": "pop",
        "lyrics": "la",
        "duration_seconds": 9999,
        "params": {},
    }
    request = engine.build_request(job)
    assert request["semantic_sampling"]["max_tokens"] <= 9000
