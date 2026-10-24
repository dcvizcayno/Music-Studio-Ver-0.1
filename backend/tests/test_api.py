"""API smoke and security tests that do not require model weights."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_and_capabilities():
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["engine"] == "mlx"

        caps = client.get("/api/capabilities")
        assert caps.status_code == 200
        body = caps.json()
        assert body["engine"] == "mlx"
        assert isinstance(body["mlx_available"], bool)

        models = client.get("/api/models/yue")
        assert models.status_code == 200
        assert "models" in models.json()


def test_invalid_and_traversal_job_ids_are_rejected():
    with TestClient(app) as client:
        assert client.get("/api/jobs/not-a-uuid").status_code == 404
        response = client.get("/api/outputs/..%2F..%2Fetc/audio.flac")
        assert response.status_code in {400, 404}


def test_generate_validates_empty_fields():
    with TestClient(app) as client:
        response = client.post("/api/songs/generate", json={
            "title": "x", "lyrics": " ", "style_tags": "pop",
            "steps": 8, "duration_seconds": 30,
        })
        assert response.status_code == 400
