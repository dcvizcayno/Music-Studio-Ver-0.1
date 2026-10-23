"""
Workflow builder and template parameter injector.
Reads API-format workflows and injects dynamic UI settings based on companion mapping files.
"""

import copy
import json
import logging
import random
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.config import settings

logger = logging.getLogger("workflow_builder")


class WorkflowBuilder:
    def __init__(self, workflows_dir: Optional[str] = None):
        self.workflows_dir = Path(workflows_dir or settings.workflows_dir)

    def load_workflow_and_mapping(self, workflow_name: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Load the raw workflow json and its companion mapping json."""
        workflow_path = self.workflows_dir / f"{workflow_name}.json"
        mapping_path = self.workflows_dir / f"{workflow_name}.mapping.json"

        if not workflow_path.exists():
            raise FileNotFoundError(f"Workflow template '{workflow_path}' not found.")
        if not mapping_path.exists():
            raise FileNotFoundError(f"Workflow mapping '{mapping_path}' not found.")

        with open(workflow_path, "r", encoding="utf-8") as wf:
            workflow = json.load(wf)
        with open(mapping_path, "r", encoding="utf-8") as mp:
            mapping = json.load(mp)

        return workflow, mapping

    def build_text_to_song_prompt(
        self,
        lyrics: str,
        style_tags: str,
        seed: Optional[int] = None,
        steps: int = 50,
        cfg: float = 3.0,
        duration_seconds: int = 60,
        model_name: Optional[str] = None,
        precision: str = "bf16"
    ) -> Tuple[Dict[str, Any], int]:
        """Inject user parameters into text_to_song.json."""
        workflow, mapping = self.load_workflow_and_mapping("text_to_song")
        prompt_graph = copy.deepcopy(workflow)

        final_seed = seed if seed is not None and seed > 0 else random.randint(1000, 999999999)
        params = mapping.get("parameter_mapping", {})

        # 1. Inject Lyrics
        lyrics_node_id = params.get("lyrics", {}).get("node_id")
        lyrics_input = params.get("lyrics", {}).get("input_name", "prompt")
        if lyrics_node_id and lyrics_node_id in prompt_graph:
            prompt_graph[lyrics_node_id]["inputs"][lyrics_input] = lyrics

        # 2. Inject Style Tags
        tags_node_id = params.get("style_tags", {}).get("node_id")
        tags_input = params.get("style_tags", {}).get("input_name", "style_tags")
        if tags_node_id and tags_node_id in prompt_graph:
            prompt_graph[tags_node_id]["inputs"][tags_input] = style_tags

        # 3. Inject Seed, Steps, CFG, Duration
        seed_node_id = params.get("seed", {}).get("node_id")
        if seed_node_id and seed_node_id in prompt_graph:
            inputs = prompt_graph[seed_node_id]["inputs"]
            inputs["seed"] = final_seed
            inputs["steps"] = steps
            inputs["cfg"] = cfg
            if "duration_seconds" in inputs or "duration" in inputs:
                duration_key = "duration_seconds" if "duration_seconds" in inputs else "duration"
                inputs[duration_key] = duration_seconds

        # 4. Inject Model and Precision
        model_node_id = params.get("model_name", {}).get("node_id")
        if model_node_id and model_node_id in prompt_graph:
            inputs = prompt_graph[model_node_id]["inputs"]
            if model_name:
                inputs["model_name"] = model_name
            if "precision" in inputs:
                inputs["precision"] = precision

        return prompt_graph, final_seed

    def build_cover_prompt(
        self,
        lyrics: str,
        style_tags: str,
        source_audio_filename: str,
        seed: Optional[int] = None,
        steps: int = 60,
        duration_seconds: int = 90
    ) -> Tuple[Dict[str, Any], int]:
        """Inject user parameters into cover.json."""
        workflow, mapping = self.load_workflow_and_mapping("cover")
        prompt_graph = copy.deepcopy(workflow)

        final_seed = seed if seed is not None and seed > 0 else random.randint(1000, 999999999)
        params = mapping.get("parameter_mapping", {})

        # Inject source audio
        audio_node_id = params.get("source_audio", {}).get("node_id")
        if audio_node_id and audio_node_id in prompt_graph:
            prompt_graph[audio_node_id]["inputs"]["audio"] = source_audio_filename

        # Inject lyrics & tags
        lyrics_node_id = params.get("lyrics", {}).get("node_id")
        if lyrics_node_id and lyrics_node_id in prompt_graph:
            prompt_graph[lyrics_node_id]["inputs"]["prompt"] = lyrics
            prompt_graph[lyrics_node_id]["inputs"]["style_tags"] = style_tags

        # Inject sampler settings
        seed_node_id = params.get("seed", {}).get("node_id")
        if seed_node_id and seed_node_id in prompt_graph:
            inputs = prompt_graph[seed_node_id]["inputs"]
            inputs["seed"] = final_seed
            inputs["steps"] = steps
            if "duration_seconds" in inputs:
                inputs["duration_seconds"] = duration_seconds

        return prompt_graph, final_seed


workflow_builder = WorkflowBuilder()
