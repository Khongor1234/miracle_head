import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.counseling import winner_reply_prompt
from backend.llm import LLMError

client = TestClient(main.app)
DRAFTS = [{"character": "Joy", "reply": "joy draft"}, {"character": "Fear", "reply": "fear draft"}]


@pytest.fixture
def fake_reply(monkeypatch):
    calls = []

    async def fake(model, agent, candidates, context, content, high_risk, lang="ja", was_chosen=True):
        calls.append({"agent": agent, "candidates": candidates, "context": context, "lang": lang, "was_chosen": was_chosen})
        return f"{agent['character']} would say this"

    monkeypatch.setattr(main, "generate_winner_reply", fake)
    return calls


def test_returns_the_reply_of_the_asked_agent(fake_reply):
    response = client.post("/api/chat/alternate", json={
        "character": "Fear", "content": "I had a fight with a friend.", "lang": "en",
        "history": [{"role": "client", "content": "earlier"}, {"role": "counselor", "content": "earlier reply"}],
        "candidates": DRAFTS,
    })

    assert response.status_code == 200
    assert response.json() == {"character": "Fear", "reply": "Fear would say this"}
    call = fake_reply[0]
    assert call["agent"]["character"] == "Fear"
    assert call["was_chosen"] is False
    assert call["lang"] == "en"
    assert "Client: earlier" in call["context"]
    assert call["context"].rstrip().endswith("Client: I had a fight with a friend.")
    assert [c["name"] for c in call["candidates"]] == ["Joy", "Fear"]


def test_rejects_an_unknown_agent(fake_reply):
    response = client.post("/api/chat/alternate", json={"character": "Envy", "content": "hi"})

    assert response.status_code == 400
    assert fake_reply == []


def test_rejects_an_empty_message(fake_reply):
    response = client.post("/api/chat/alternate", json={"character": "Joy", "content": "  "})

    assert response.status_code == 400


def test_reports_model_errors_as_bad_gateway(monkeypatch):
    async def failing(*args, **kwargs):
        raise LLMError("Gemini is unavailable")

    monkeypatch.setattr(main, "generate_winner_reply", failing)

    response = client.post("/api/chat/alternate", json={"character": "Joy", "content": "hi"})

    assert response.status_code == 502


def test_the_prompt_does_not_claim_the_alternate_was_chosen():
    agent = {"character": "Fear", "name": "Fear", "persona": "p"}

    chosen = winner_reply_prompt(agent, "summary", "ctx", "hi", False, "en", True)
    alternate = winner_reply_prompt(agent, "summary", "ctx", "hi", False, "en", False)

    assert "was chosen as the most insightful" in chosen
    assert "was chosen as the most insightful" not in alternate
    assert "would have given" in alternate
