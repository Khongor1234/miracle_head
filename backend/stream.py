"""The streamed counseling round: five drafts, peer scoring, one winning reply.

Shared by the stored-conversation endpoint and the stateless browser-storage
endpoint; the caller decides what (if anything) is saved via `on_finished`.
"""

import asyncio
import json
import uuid
from typing import Awaitable, Callable, Optional

from .counseling import (
    aggregate_scores,
    build_agent_round,
    build_round_result,
    build_scored_round_result,
    generate_candidate,
    generate_winner_reply,
    is_high_risk,
    now_iso,
    score_candidates,
    visible_context,
)
from .llm import LLMError
from .supabase_store import StorageError

SCORING_ROUND = 2

# Receives (agent_round, counselor_message) once the winner is known and
# returns the conversation to send back, or None when nothing is stored.
OnFinished = Callable[[dict, dict], Awaitable[Optional[dict]]]


def stream_event(event_type: str, payload: dict) -> str:
    return json.dumps({"type": event_type, "payload": payload}, ensure_ascii=False) + "\n"


def new_client_message(content: str) -> dict:
    return {"id": str(uuid.uuid4()), "role": "client", "content": content, "created_at": now_iso()}


async def _indexed_candidate(model, index, agent, context, content, high_risk, lang):
    return index, await generate_candidate(model, agent, context, content, high_risk, lang)


async def _indexed_score(model, index, agent, context, content, candidates, high_risk, lang):
    return index, await score_candidates(model, agent, context, content, candidates, high_risk, SCORING_ROUND, lang)


async def _cancel_all(tasks: list) -> None:
    for task in tasks:
        if not task.done():
            task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


def _round_started(round_number: int, agents: list, high_risk: bool, model: str) -> str:
    return stream_event("round_started", {
        "round_number": round_number,
        "review_rounds": SCORING_ROUND,
        "agents": agents,
        "high_risk": high_risk,
        "model": model,
    })


async def counseling_events(
    *,
    model: str,
    agents: list[dict],
    messages: list[dict],
    client_message: dict,
    lang: str,
    on_finished: OnFinished,
):
    """Yield NDJSON events for one counseling round.

    `messages` is the conversation so far, ending with `client_message`.
    """
    content = client_message["content"]
    yield stream_event("client_message", {"client_message": client_message})

    context = visible_context(messages)
    high_risk = is_high_risk(content)
    candidate_tasks: list = []
    scoring_tasks: list = []
    try:
        # Round 1: every agent drafts a reply on its own.
        yield _round_started(1, agents, high_risk, model)
        candidates_by_index = [None] * len(agents)
        candidate_tasks = [
            asyncio.create_task(_indexed_candidate(model, i, agent, context, content, high_risk, lang))
            for i, agent in enumerate(agents)
        ]
        for task in asyncio.as_completed(candidate_tasks):
            index, candidate = await task
            candidates_by_index[index] = candidate
            yield stream_event("candidate_ready", {"round_number": 1, "index": index, "candidate": candidate})

        candidates = [c for c in candidates_by_index if c is not None]
        round_1 = build_round_result(1, candidates, lang)
        yield stream_event("round_complete", {"round_number": 1, "round": round_1})

        # Round 2: every agent scores the drafts.
        yield _round_started(SCORING_ROUND, agents, high_risk, model)
        yield stream_event("scoring_started", {"round_number": SCORING_ROUND, "candidate_count": len(candidates)})
        peer_scores_by_index = [None] * len(agents)
        scoring_tasks = [
            asyncio.create_task(_indexed_score(model, i, agent, context, content, candidates, high_risk, lang))
            for i, agent in enumerate(agents)
        ]
        for task in asyncio.as_completed(scoring_tasks):
            index, score = await task
            peer_scores_by_index[index] = score
            yield stream_event("score_ready", {"round_number": SCORING_ROUND, "index": index, "score": score})
        peer_scores = [s for s in peer_scores_by_index if s is not None]

        # The top-scored agent writes the final reply.
        totals = aggregate_scores(candidates, peer_scores)
        winner_character = totals[0]["character"]
        winner_agent = next((a for a in agents if a["character"] == winner_character), None)
        if winner_agent is None:
            raise ValueError(f"Winner character '{winner_character}' not found in agents")
        winner_reply_text = await generate_winner_reply(
            model, winner_agent, candidates, context, content, high_risk, lang
        )

        round_2 = build_scored_round_result(SCORING_ROUND, high_risk, candidates, peer_scores, winner_reply_text, lang)
        yield stream_event("round_complete", {"round_number": SCORING_ROUND, "round": round_2})

        agent_round = build_agent_round(client_message, high_risk, SCORING_ROUND, [round_1, round_2])
        counselor_message = {
            "id": str(uuid.uuid4()),
            "role": "counselor",
            "content": agent_round["winner"]["reply"],
            "created_at": now_iso(),
            "source_round_id": agent_round["id"],
            "source_agent": agent_round["winner"]["character"],
        }
        conversation = await on_finished(agent_round, counselor_message)
        yield stream_event("winner_selected", {
            "round_number": SCORING_ROUND,
            "agent_round": agent_round,
            "counselor_message": counselor_message,
            "conversation": conversation,
        })
    except LLMError as exc:
        await _cancel_all(candidate_tasks + scoring_tasks)
        yield stream_event("error", {"message": str(exc)})
    except StorageError:
        # Already logged with details; the client only learns that saving failed.
        await _cancel_all(candidate_tasks + scoring_tasks)
        yield stream_event("error", {"message": "Could not save the conversation. Please try again."})
    except Exception as exc:
        await _cancel_all(candidate_tasks + scoring_tasks)
        yield stream_event("error", {"message": f"Counseling round failed: {exc}"})
