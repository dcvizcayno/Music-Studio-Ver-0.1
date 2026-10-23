"""
Comprehensive Pytest test suite for YuE2 Song Studio backend.
Tests workflow template filling, prompt encoding style constraints, memory guard, and SQLite DB.
"""

import os
import pytest
from pathlib import Path

from app.config import settings
from app.services.memory_guard import memory_guard
from app.services.workflow_builder import workflow_builder
from app.services.ollama_client import format_bytes, parse_parameter_size


def test_parameter_size_parsing():
    """Verify regex extraction of model parameter size."""
    assert parse_parameter_size("qwen2.5:7b-instruct") == 7.0
    assert parse_parameter_size("qwen2.5:14b") == 14.0
    assert parse_parameter_size("qwen2.5:0.5b") == 0.5
    assert parse_parameter_size("llama3:8b") == 8.0
    assert parse_parameter_size("mistral:latest") is None


def test_format_bytes():
    """Verify human-readable byte sizing."""
    assert format_bytes(5368709120) == "5.0 GB"
    assert format_bytes(524288000) == "500 MB"


def test_memory_guard_headroom_check():
    """Verify memory inspection reports valid numerical values."""
    headroom = memory_guard.check_memory_headroom()
    assert "total_gb" in headroom
    assert "available_gb" in headroom
    assert headroom["total_gb"] > 0
    assert isinstance(headroom["low_memory_warning"], bool)


def test_workflow_builder_text_to_song():
    """Verify that workflow builder correctly injects parameters into the ComfyUI API graph."""
    lyrics_sample = "[verse]\nFirst light on the morning glass\n[chorus]\nLetting the shadows pass"
    tags_sample = "indie pop, clean electric guitar, 95 bpm"

    graph, seed = workflow_builder.build_text_to_song_prompt(
        lyrics=lyrics_sample,
        style_tags=tags_sample,
        seed=12345,
        steps=45,
        cfg=3.2,
        duration_seconds=75,
        model_name="yue2-1b-preview.safetensors",
        precision="bf16"
    )

    assert seed == 12345
    # Check node 6 has our prompt & style tags
    assert graph["6"]["inputs"]["prompt"] == lyrics_sample
    assert graph["6"]["inputs"]["style_tags"] == tags_sample

    # Check node 3 has our sampler parameters
    assert graph["3"]["inputs"]["seed"] == 12345
    assert graph["3"]["inputs"]["steps"] == 45
    assert graph["3"]["inputs"]["cfg"] == 3.2
    assert graph["3"]["inputs"]["duration_seconds"] == 75

    # Check node 4 has our model
    assert graph["4"]["inputs"]["model_name"] == "yue2-1b-preview.safetensors"
    assert graph["4"]["inputs"]["precision"] == "bf16"


def test_workflow_builder_cover():
    """Verify cover workflow parameter injection."""
    graph, seed = workflow_builder.build_cover_prompt(
        lyrics="[verse]\nRewritten melody line",
        style_tags="synthwave retro 80s",
        source_audio_filename="original_track.wav",
        seed=999,
        steps=50,
        duration_seconds=80
    )

    assert seed == 999
    assert graph["5"]["inputs"]["audio"] == "original_track.wav"
    assert graph["3"]["inputs"]["steps"] == 50
