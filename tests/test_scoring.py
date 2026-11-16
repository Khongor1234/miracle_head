import asyncio
import json

from backend import counseling
from backend.counseling import AGENTS, fallback_peer_scores, score_candidates

JUDGE = AGENTS[0]
CANDIDATES = [
    {"character": agent["character"], "name": agent["name"], "reply": f"reply from {agent['character']}"}
    for agent in AGENTS
]


def valid_scores_json(judge: dict) -> str:
    rows = []
    for candidate in CANDIDATES:
        if candidate["character"] == judge["character"]:
            continue
        row = {"character": candidate["character"], "note": "ok"}
        row.update({item["key"]: 7 for item in counseling.RUBRIC})
        rows.append(row)
    return json.dumps({"scores": rows})


def run(coro):
    return asyncio.run(coro)


def test_scoring_asks_for_enough_tokens_for_thinking_models(monkeypatch):
    calls = []

    async def fake_query(model, prompt, **kwargs):
        calls.append(kwargs)
        return valid_scores_json(JUDGE)

    monkeypatch.setattr(counseling, "query_llm", fake_query)

    result = run(score_candidates("gemini-2.5-flash", JUDGE, "", "hi", CANDIDATES, False))

    assert calls[0]["max_output_tokens"] >= 8192
    assert "fallback" not in result
    assert len(result["scores"]) == len(CANDIDATES) - 1


def test_scoring_retries_once_when_the_json_is_cut_off(monkeypatch):
    answers = iter(['{"scores": [{"character": "Fear", "safety_ri', valid_scores_json(JUDGE)])

    async def fake_query(model, prompt, **kwargs):
        return next(answers)

    monkeypatch.setattr(counseling, "query_llm", fake_query)

    result = run(score_candidates("gemini-2.5-flash", JUDGE, "", "hi", CANDIDATES, False))

    assert "fallback" not in result
    assert all(row["weighted_total"] > 0 for row in result["scores"])


def test_scoring_falls_back_after_two_broken_answers(monkeypatch):
    calls = []

    async def fake_query(model, prompt, **kwargs):
        calls.append(1)
        return '{"scores": [{"character": "Fear"'

    monkeypatch.setattr(counseling, "query_llm", fake_query)

    result = run(score_candidates("gemini-2.5-flash", JUDGE, "", "hi", CANDIDATES, False))

    assert len(calls) == 2
    assert result["fallback"] is True


def test_fallback_scores_english_replies_differently():
    candidates = [
        {"character": "Joy", "reply": "That sounds really hard. Let's try one small step today, together."},
        {"character": "Fear", "reply": "Okay."},
    ]
    judge = {"character": "Disgust", "name": "Disgust"}

    rows = {row["character"]: row["weighted_total"] for row in fallback_peer_scores(judge, candidates, False, "x")["scores"]}

    assert rows["Joy"] > rows["Fear"]


def test_scoring_asks_for_japanese_notes_in_japanese_mode():
    prompt = counseling.scoring_prompt(JUDGE, "", "hi", CANDIDATES, False, 2, "ja")

    assert "natural Japanese" in prompt
    assert "Fear=ビビリ" in prompt


def test_scoring_asks_for_english_notes_in_english_mode():
    prompt = counseling.scoring_prompt(JUDGE, "", "hi", CANDIDATES, False, 2, "en")

    assert 'every "note" in English' in prompt
    assert "Japanese" not in prompt.split("Respond with only valid JSON")[0].split("Use only JSON.")[1]


def test_the_stream_passes_the_language_to_the_judges(monkeypatch):
    from fastapi.testclient import TestClient

    from backend import stream
    from backend.main import app

    seen = []

    async def fake_candidate(model, agent, context, content, high_risk, lang="ja"):
        return {"character": agent["character"], "name": agent["name"], "reply": "draft"}

    async def fake_score(model, agent, context, content, candidates, high_risk, round_number, lang="ja"):
        seen.append(lang)
        return counseling.fallback_peer_scores(agent, candidates, high_risk, "test")

    async def fake_winner(model, agent, candidates, context, content, high_risk, lang="ja"):
        return "reply"

    monkeypatch.setattr(stream, "generate_candidate", fake_candidate)
    monkeypatch.setattr(stream, "score_candidates", fake_score)
    monkeypatch.setattr(stream, "generate_winner_reply", fake_winner)

    TestClient(app).post("/api/chat/stream", json={"content": "hello", "lang": "en"})

    assert seen and set(seen) == {"en"}
