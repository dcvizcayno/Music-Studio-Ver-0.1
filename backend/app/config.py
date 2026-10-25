"""Runtime configuration for the local YuE2 Song Studio.

All heavy work is local. The generation engine is mlx-Yue (Apple Silicon MLX),
spawned as a subprocess so a crash or cancel cannot take the API down.
"""

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = REPO_ROOT.parent


class Settings(BaseSettings):
    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False
    cors_origins: str = (
        "http://127.0.0.1:8000,http://localhost:8000,"
        "http://127.0.0.1:3000,http://localhost:3000"
    )

    # Engine
    engine: str = "mlx"
    mlx_yue_bin: str = str(WORKSPACE_ROOT / "engines/mlx-Yue/.venv/bin/mlx-yue")
    mlx_model_dir: str = str(WORKSPACE_ROOT / "models/mlx-Yue2-3B")
    mlx_vae_dir: str = str(WORKSPACE_ROOT / "models/YuE2-Vae")
    mlx_precision: str = "8bit"
    mlx_memory_budget_gb: float = 14.0
    mlx_vae_core_frames: int = 128
    mlx_memory_retry_count: int = 2
    mlx_memory_retry_delay_seconds: int = 20
    mlx_max_duration: int = 360
    mlx_default_steps: int = 8
    mlx_final_steps: int = 32
    mlx_job_timeout_seconds: int = 2400
    mlx_offline: bool = True

    # Ollama (lyrics only)
    ollama_url: str = "http://127.0.0.1:11434"
    default_ollama_model: str = "qwen-fast:latest"
    ollama_timeout_seconds: int = 180
    warn_qwen_max_params_b: int = 8

    # Media tools installed locally in the workspace
    ffmpeg_bin: str = str(WORKSPACE_ROOT / "tools/ffmpeg/bin/ffmpeg")
    ffprobe_bin: str = str(WORKSPACE_ROOT / "tools/ffmpeg/bin/ffprobe")
    hf_home: str = str(WORKSPACE_ROOT / "models/hf-cache")
    demucs_bin: str = str(REPO_ROOT / ".venv/bin/demucs-onnx")
    basic_pitch_model: str = str(WORKSPACE_ROOT / "models/basic-pitch/nmp.onnx")

    # Storage
    data_dir: str = "./data"
    database_url: str = "sqlite:///./data/studio.db"
    outputs_dir: str = "./outputs"
    uploads_dir: str = "./uploads"
    voices_dir: str = "./voices"
    workflows_dir: str = "./workflows"
    config_dir: str = "./config"
    logs_dir: str = "./logs"
    frontend_dist: str = str(REPO_ROOT / "frontend/dist")

    # Limits
    max_upload_mb: int = 60
    min_free_memory_gb: float = 3.0
    max_concurrent_heavy_jobs: int = 1

    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def sqlite_db_path(self) -> Path:
        clean = self.database_url.replace("sqlite:///", "").replace("sqlite://", "")
        path = Path(clean)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def outputs_path(self) -> Path:
        path = Path(self.outputs_dir)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def uploads_path(self) -> Path:
        path = Path(self.uploads_dir)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def logs_path(self) -> Path:
        path = Path(self.logs_dir)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def data_path(self) -> Path:
        path = Path(self.data_dir)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def config_path(self) -> Path:
        path = Path(self.config_dir)
        return path if path.is_absolute() else REPO_ROOT / path


settings = Settings()
