"""
Configuration settings for YuE2 Song Studio backend.
Parses environment variables and .env with Pydantic v2.
"""

from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Server configuration
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"

    # Ollama LLM
    ollama_url: str = "http://localhost:11434"
    default_ollama_model: str = "qwen2.5:7b-instruct"
    ollama_timeout_seconds: int = 120

    # ComfyUI Engine
    comfyui_url: str = "http://127.0.0.1:8188"
    comfyui_ws_url: str = "ws://127.0.0.1:8188/ws"
    comfyui_path: str = "/Users/daniel/ComfyUI"

    # Storage paths
    data_dir: str = "./data"
    database_url: str = "sqlite:///./data/studio.db"
    outputs_dir: str = "./outputs"
    voices_dir: str = "./voices"
    models_dir: str = "./models"
    workflows_dir: str = "./workflows"
    config_dir: str = "./config"
    logs_dir: str = "./logs"

    # Hardware & Memory Guard (Apple Silicon 24GB Unified Memory)
    max_concurrent_heavy_jobs: int = 1
    min_free_memory_gb: float = 4.0
    auto_unload_models: bool = True
    warn_qwen_max_params_b: int = 14

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlite_db_path(self) -> Path:
        clean = self.database_url.replace("sqlite:///", "").replace("sqlite://", "")
        return Path(clean)


settings = Settings()
