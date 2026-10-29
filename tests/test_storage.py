import json

import pytest

from backend import storage
from backend.file_store import FileStore
from backend.supabase_store import StorageError, SupabaseStore
from tests.fake_postgrest import FakePostgrest

CONFIG = {"model": "gemini-2.5-flash-lite", "agents": [], "review_rounds": 2}


def client_message(message_id: str, content: str, created_at: str = "2026-10-30T10:00:00") -> dict:
    return {"id": message_id, "role": "client", "content": content, "created_at": created_at}


@pytest.fixture
def fake_postgrest():
    return FakePostgrest()


@pytest.fixture(params=["file", "supabase"])
def store(request, tmp_path, monkeypatch, fake_postgrest):
    if request.param == "file":
        selected = FileStore(str(tmp_path / "conversations"), str(tmp_path / "dialogues"))
    else:
        selected = SupabaseStore("https://example.supabase.co", "sb_secret_test", transport=fake_postgrest.transport())
    monkeypatch.setattr(storage, "get_store", lambda: selected)
    return selected


def test_create_then_get_returns_the_same_conversation(store):
    created = storage.create_conversation("abc-123", CONFIG)

    loaded = storage.get_conversation("abc-123")

    assert loaded == created
    assert loaded["dialogue_file_number"] == 1
    assert loaded["title"] == "New counseling session"


def test_dialogue_numbers_increase_per_conversation(store):
    first = storage.create_conversation("first", CONFIG)
    second = storage.create_conversation("second", CONFIG)

    assert (first["dialogue_file_number"], second["dialogue_file_number"]) == (1, 2)


def test_first_client_message_becomes_title_and_dialogue(store):
    storage.create_conversation("abc", CONFIG)

    storage.add_message("abc", client_message("m1", "仕事がつらいです\nどうしたら"))

    loaded = storage.get_conversation("abc")
    assert loaded["title"] == "仕事がつらいです どうしたら"
    assert loaded["dialogue"] == [
        {"role": "client", "time": "2026-10-30T10:00:00", "utterance": "仕事がつらいです\nどうしたら"}
    ]


def test_list_returns_summaries_newest_first(store):
    storage.create_conversation("older", CONFIG)
    storage.create_conversation("newer", CONFIG)
    storage.add_message("newer", client_message("m1", "hello"))

    summaries = storage.list_conversations()

    assert [item["id"] for item in summaries] == ["newer", "older"]
    assert summaries[0]["message_count"] == 1
    assert summaries[0]["turn_count"] == 1
    assert "messages" not in summaries[0]


def test_update_message_replaces_by_id(store):
    storage.create_conversation("abc", CONFIG)
    storage.add_message("abc", client_message("m1", "before"))

    storage.update_message("abc", client_message("m1", "after"))

    assert storage.get_conversation("abc")["messages"][0]["content"] == "after"


def test_update_message_with_unknown_id_raises(store):
    storage.create_conversation("abc", CONFIG)

    with pytest.raises(ValueError):
        storage.update_message("abc", client_message("missing", "x"))


def test_config_update_merges_values(store):
    storage.create_conversation("abc", CONFIG)

    updated = storage.update_conversation_config("abc", {"model": "gemini-2.5-flash"})

    assert updated["config"] == {**CONFIG, "model": "gemini-2.5-flash"}


def test_add_agent_round_appends(store):
    storage.create_conversation("abc", CONFIG)

    storage.add_agent_round("abc", {"round": 1})

    assert storage.get_conversation("abc")["agent_rounds"] == [{"round": 1}]


def test_delete_removes_conversation(store):
    storage.create_conversation("abc", CONFIG)

    assert storage.delete_conversation("abc") is True
    assert storage.get_conversation("abc") is None
    assert storage.delete_conversation("abc") is False


def test_missing_conversation_raises_on_write(store):
    with pytest.raises(ValueError):
        storage.add_message("nope", client_message("m1", "x"))


@pytest.mark.parametrize("bad_id", ["../etc/passwd", "a,b", "id=eq.1", ""])
def test_invalid_ids_are_treated_as_missing(store, bad_id):
    assert storage.get_conversation(bad_id) is None
    assert storage.delete_conversation(bad_id) is False


def test_file_store_writes_numbered_dialogue_export(tmp_path, monkeypatch):
    selected = FileStore(str(tmp_path / "conversations"), str(tmp_path / "dialogues"))
    monkeypatch.setattr(storage, "get_store", lambda: selected)
    storage.create_conversation("abc", CONFIG)
    storage.add_message("abc", client_message("m1", "hi"))

    exported = json.loads((tmp_path / "dialogues" / "1.json").read_text())

    assert exported["dialogue"][0]["utterance"] == "hi"


def test_supabase_store_sends_secret_key_only_in_apikey_header(fake_postgrest):
    selected = SupabaseStore("https://example.supabase.co/", "sb_secret_test", transport=fake_postgrest.transport())

    selected.load("abc")

    request = fake_postgrest.requests[0]
    assert request.headers["apikey"] == "sb_secret_test"
    assert "authorization" not in request.headers


def test_supabase_store_sends_legacy_jwt_as_bearer_too(fake_postgrest):
    selected = SupabaseStore("https://example.supabase.co", "eyJlegacy", transport=fake_postgrest.transport())

    selected.load("abc")

    assert fake_postgrest.requests[0].headers["authorization"] == "Bearer eyJlegacy"


def test_supabase_errors_raise_storage_error_without_leaking_key():
    failing = FakePostgrest(fail_with_status=500)
    selected = SupabaseStore("https://example.supabase.co", "sb_secret_test", transport=failing.transport())

    with pytest.raises(StorageError) as error:
        selected.load("abc")

    assert "500" in str(error.value)
    assert "sb_secret_test" not in str(error.value)


def test_get_store_refuses_file_storage_on_vercel(monkeypatch):
    monkeypatch.setattr(storage, "SUPABASE_URL", "")
    monkeypatch.setattr(storage, "IS_VERCEL", True)
    storage.get_store.cache_clear()

    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        storage.get_store()

    storage.get_store.cache_clear()
