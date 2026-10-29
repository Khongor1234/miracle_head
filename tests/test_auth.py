import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.main import app

client = TestClient(app)
ALLOWED_ORIGIN = "https://miracle-head.vercel.app"


@pytest.fixture
def password(monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "open-sesame")
    monkeypatch.setattr(config, "IS_VERCEL", True)
    return "open-sesame"


def test_request_without_password_is_rejected(password):
    response = client.get("/api/settings")

    assert response.status_code == 401


def test_request_with_wrong_password_is_rejected(password):
    response = client.get("/api/settings", headers={"X-App-Password": "wrong"})

    assert response.status_code == 401


def test_request_with_correct_password_succeeds(password):
    response = client.get("/api/settings", headers={"X-App-Password": password})

    assert response.status_code == 200
    assert "agents" in response.json()


def test_cors_preflight_passes_without_password(password):
    response = client.options(
        "/api/settings",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-app-password",
        },
    )

    assert response.status_code == 200


def test_rejection_still_carries_cors_headers(password):
    response = client.get("/api/settings", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_vercel_without_configured_password_fails_closed(monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "")
    monkeypatch.setattr(config, "IS_VERCEL", True)

    response = client.get("/api/settings")

    assert response.status_code == 503


def test_local_development_without_password_is_open(monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "")
    monkeypatch.setattr(config, "IS_VERCEL", False)

    response = client.get("/api/settings")

    assert response.status_code == 200


def test_vercel_with_public_access_is_open(monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "")
    monkeypatch.setattr(config, "IS_VERCEL", True)
    monkeypatch.setattr(config, "PUBLIC_ACCESS", True)

    response = client.get("/api/settings")

    assert response.status_code == 200
