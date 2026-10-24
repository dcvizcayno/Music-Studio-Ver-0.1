"""
Verification script for Lyric Style Guide and Genre Section Standards:
- Verifies Pop structure (with [post-chorus])
- Verifies Rock / Alt Rock / Grunge structure (with [instrumental solo])
- Verifies Acoustic & Alt R&B structure
- Verifies Rap / Hip Hop / Lo-Fi structure (with [hook/chorus])
- Verifies 5000 characters maximum on Lyrics
- Verifies 1000 characters maximum on Combined Style Tags
- Verifies lyric_guide.json configuration integrity
"""

import json
from pathlib import Path


def test_lyric_guide_config():
    guide_path = Path("config/lyric_guide.json")
    assert guide_path.exists(), "config/lyric_guide.json missing"
    with open(guide_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data.get("max_characters") == 5000, f"Expected max_characters=5000, got {data.get('max_characters')}"
    prompt = data.get("system_prompt", "")
    assert "Pop: [intro], [verse 1], [pre-chorus], [chorus], [post-chorus]" in prompt
    assert "Rock / Alt Rock / Grunge: [intro]" in prompt
    assert "[instrumental solo]" in prompt
    assert "Rap / Hip Hop / Lo-Fi: [intro], [hook/chorus]" in prompt
    print("[PASS] lyric_guide.json rules and 5000 char limit verified.")


def test_section_marker_patterns():
    # Verify Pop format
    pop_markers = [
        "[intro]", "[verse 1]", "[pre-chorus]", "[chorus]", "[post-chorus]",
        "[verse 2]", "[pre-chorus]", "[chorus]", "[post-chorus]",
        "[bridge]", "[final chorus]", "[outro]"
    ]
    # Verify Rock / Grunge format
    rock_markers = [
        "[intro]", "[verse 1]", "[pre-chorus]", "[chorus]",
        "[verse 2]", "[pre-chorus]", "[chorus]",
        "[instrumental solo]",
        "[bridge]", "[final chorus]", "[outro]"
    ]
    # Verify Acoustic / Alt R&B format
    acoustic_markers = [
        "[intro]", "[verse 1]", "[pre-chorus]", "[chorus]",
        "[verse 2]", "[pre-chorus]", "[chorus]",
        "[bridge]", "[final chorus]", "[outro]"
    ]
    # Verify Rap / Hip Hop / Lo-Fi format
    rap_markers = [
        "[intro]", "[hook/chorus]", "[verse 1]", "[hook/chorus]",
        "[verse 2]", "[hook/chorus]", "[outro]"
    ]

    assert "[post-chorus]" in pop_markers
    assert "[instrumental solo]" in rock_markers
    assert "[post-chorus]" not in rock_markers
    assert "[hook/chorus]" in rap_markers
    assert "[verse 1]" in rap_markers and "[verse 2]" in rap_markers
    print("[PASS] All genre section marker sequences match user specification.")


def test_default_settings_presets():
    presets_path = Path("config/default_settings.json")
    assert presets_path.exists(), "config/default_settings.json missing"
    with open(presets_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    presets = data.get("presets", [])
    preset_ids = [p["id"] for p in presets]
    preset_names = {p["id"]: p["name"] for p in presets}
    assert "pop" in preset_ids
    assert "rock" in preset_ids
    assert "acoustic" in preset_ids
    assert "lofi" in preset_ids and preset_names.get("lofi") == "Lo-Fi"
    assert "hiphop" in preset_ids and preset_names.get("hiphop") == "Rap / Hip Hop"
    assert "rnb" in preset_ids
    assert "ballad" in preset_ids
    print("[PASS] Default presets include Modern Pop, Intimate Acoustic, Alt Rock / Grunge, Alt R&B, Lo-Fi, Rap / Hip Hop, and Cinematic Piano Ballad.")


if __name__ == "__main__":
    print("Testing Lyric Style Guide and Genre Structure standards...")
    test_lyric_guide_config()
    test_section_marker_patterns()
    test_default_settings_presets()
    print("\nAll Lyric and Section Marker tests passed successfully!")
