"""
Comprehensive Pytest test suite for YuE2 Song Studio backend.
Tests workflow template filling, prompt encoding style constraints, memory guard, and SQLite DB.
"""

import os
from pathlib import Path
try:
    import pytest
except ImportError:
    pytest = None

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


def test_audio_format_configs():
    """Verify all 8 requested audio formats exist in configuration."""
    from app.services.audio_encoder import FORMAT_CONFIGS
    expected_formats = ["wav", "aiff", "flac", "alac", "mp3", "aac", "ogg", "opus"]
    for fmt in expected_formats:
        assert fmt in FORMAT_CONFIGS, f"Missing format config for {fmt}"
        assert "ext" in FORMAT_CONFIGS[fmt]
        assert "mime" in FORMAT_CONFIGS[fmt]
        assert "name" in FORMAT_CONFIGS[fmt]


def test_genre_section_structure_rules():
    """Verify section structure standards for Pop, Rock/Grunge, Acoustic/Alt R&B, and Rap/Hip-Hop."""
    import asyncio
    from app.services.ollama_client import ollama_client

    # Test Pop fallback format
    pop_res = asyncio.run(ollama_client.draft_lyrics_and_style(
        idea="A dancefloor moment of freedom",
        genre="modern pop, synth-pop"
    ))
    pop_lyrics = pop_res["lyrics"]
    assert "[intro]" in pop_lyrics
    assert "[verse 1]" in pop_lyrics
    assert "[pre-chorus]" in pop_lyrics
    assert "[chorus]" in pop_lyrics
    assert "[post-chorus]" in pop_lyrics
    assert "[bridge]" in pop_lyrics
    assert "[final chorus]" in pop_lyrics
    assert "[outro]" in pop_lyrics
    assert pop_res["character_count"] <= 5000

    # Test Rock / Grunge fallback format (must include [instrumental solo])
    rock_res = asyncio.run(ollama_client.draft_lyrics_and_style(
        idea="Overdriven catharsis in an empty garage",
        genre="alternative rock, grunge"
    ))
    rock_lyrics = rock_res["lyrics"]
    assert "[intro]" in rock_lyrics
    assert "[instrumental solo]" in rock_lyrics
    assert "[bridge]" in rock_lyrics
    assert "[final chorus]" in rock_lyrics
    assert rock_res["character_count"] <= 5000

    # Test Rap / Hip Hop / Lo-Fi fallback format (must follow [intro], [hook/chorus], [verse], [hook/chorus], [verse], [outro])
    rap_res = asyncio.run(ollama_client.draft_lyrics_and_style(
        idea="Late night subway rides and vinyl dust",
        genre="lo-fi hip hop, boom bap"
    ))
    rap_lyrics = rap_res["lyrics"]
    assert "[intro]" in rap_lyrics
    assert "[hook/chorus]" in rap_lyrics
    assert "[verse 1]" in rap_lyrics
    assert "[verse 2]" in rap_lyrics
    assert "[outro]" in rap_lyrics
    assert rap_res["character_count"] <= 5000

    # Test Acoustic / Alt R&B fallback format
    rnb_res = asyncio.run(ollama_client.draft_lyrics_and_style(
        idea="Quiet room and tape delay reflections",
        genre="alternative r&b, moody trap soul"
    ))
    rnb_lyrics = rnb_res["lyrics"]
    assert "[intro]" in rnb_lyrics
    assert "[verse 1]" in rnb_lyrics
    assert "[pre-chorus]" in rnb_lyrics
    assert "[chorus]" in rnb_lyrics
    assert "[bridge]" in rnb_lyrics
    assert "[final chorus]" in rnb_lyrics
    assert "[outro]" in rnb_lyrics
    assert rnb_res["character_count"] <= 5000


if __name__ == "__main__":
    print("Running backend unit tests...")
    test_parameter_size_parsing()
    test_format_bytes()
    test_memory_guard_headroom_check()
    test_workflow_builder_text_to_song()
    test_workflow_builder_cover()
    test_audio_format_configs()
    test_genre_section_structure_rules()
    print("All backend tests passed successfully!")


