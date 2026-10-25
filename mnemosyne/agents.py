"""Local agent registry and memory relevance hints."""

AGENTS = {
    "qwen": {
        "role": "lyrics and style drafting",
        "model": "qwen-fast:latest",
        "provider": "Ollama",
        "memory_query": "user lyric, vocal, genre and production preferences",
    },
    "deepseek": {
        "role": "architecture, code review and planning",
        "model": "deepseek-r1:14b",
        "provider": "Ollama",
        "memory_query": "user architecture, quality and workflow preferences",
    },
    "yue": {
        "role": "song generation and cover rendering",
        "model": "YuE2-3B (MLX 8-bit)",
        "provider": "mlx-Yue",
        "memory_query": "musical style, vocal, tempo and arrangement preferences",
    },
    "ui": {
        "role": "interface copy and workflow guidance",
        "model": "none (deterministic)",
        "provider": "React",
        "memory_query": "user workflow and presentation preferences",
    },
}
