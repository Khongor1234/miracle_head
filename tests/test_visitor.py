import pytest
from fastapi.testclient import TestClient

from backend import config, storage
from backend.file_store import FileStore
from backend.main import app

client = TestClient(app)
VISITOR_A = {"X-Visitor-Id": "11111111-1111-4111-8111-111111111111"}
VISITOR_B = {"X-Visitor-Id": "22222222-2222-4222-8222-222222222222"}


@pytest.fixture(autouse=True)
def file_store(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_PASSWORD", "")
    monkeypatch.setattr(config, "IS_VERCEL", False)
    selected = FileStore(str(tmp_path / "conversations"), str(tmp_path / "dialogues"))
    monkeypatch.setattr(storage, "get_store", lambda: selected)
    return selected


def test_conversation_routes_require_a_visitor_id():
    response = client.get("/api/conversations")

    assert response.status_code == 400


@pytest.mark.parametrize("bad_id", ["short", "x" * 65, "a,b-cccccccccccccccc", "id=eq.1-cccccccccccc"])
def test_malformed_visitor_id_is_rejected(bad_id):
    response = client.get("/api/conversations", headers={"X-Visitor-Id": bad_id})

    assert response.status_code == 400


def test_settings_do_not_need_a_visitor_id():
    assert client.get("/api/settings").status_code == 200


def test_visitors_only_see_their_own_conversations():
    created = client.post("/api/conversations", json={}, headers=VISITOR_A).json()

    assert [item["id"] for item in client.get("/api/conversations", headers=VISITOR_A).json()] == [created["id"]]
    assert client.get("/api/conversations", headers=VISITOR_B).json() == []


def test_other_visitor_gets_404_for_read_write_and_delete():
    conversation_id = client.post("/api/conversations", json={}, headers=VISITOR_A).json()["id"]

    assert client.get(f"/api/conversations/{conversation_id}", headers=VISITOR_B).status_code == 404
    assert client.post(
        f"/api/conversations/{conversation_id}/messages", json={"content": "hi"}, headers=VISITOR_B
    ).status_code == 404
    assert client.post(
        f"/api/conversations/{conversation_id}/messages/stream", json={"content": "hi"}, headers=VISITOR_B
    ).status_code == 404
    assert client.delete(f"/api/conversations/{conversation_id}", headers=VISITOR_B).status_code == 404
    assert client.get(f"/api/conversations/{conversation_id}", headers=VISITOR_A).status_code == 200
