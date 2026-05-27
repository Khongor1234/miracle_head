"""FastAPI backend for the counseling dialogue app."""

import asyncio
import json
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional

from . import storage
from .config import DEFAULT_GEMINI_MODEL
from .counseling import (
    AGENTS,
    AGENT_CHARACTERS,
    build_agent_round,
    build_round_result,
    generate_candidate,
    is_high_risk,
    now_iso,
    run_counseling_round,
    synthesize_final_reply,
    visible_context,
)
from .llm import LLMError

app = FastAPI(title="Counseling Dialogue API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "https://miracle-head.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


MAX_PERSONA_LENGTH = 2000
DEFAULT_REVIEW_ROUNDS = 2
MIN_REVIEW_ROUNDS = 1
MAX_REVIEW_ROUNDS = 5


class AgentRequest(BaseModel):
    character: str
    name: Optional[str] = None
    persona: str


class CreateConversationRequest(BaseModel):
    model: Optional[str] = None
    agents: Optional[List[AgentRequest]] = None
    review_rounds: Optional[int] = None


class CreateMessageRequest(BaseModel):
    content: str
    model: Optional[str] = None


def validate_agents(agents: Optional[List[AgentRequest]]) -> list[dict]:
    if agents is None:
        return [agent.copy() for agent in AGENTS]

    errors = []
    if len(agents) != len(AGENT_CHARACTERS):
        errors.append(f"Exactly {len(AGENT_CHARACTERS)} agents are required.")

    normalised = []
    for index, character in enumerate(AGENT_CHARACTERS):
        incoming = agents[index] if index < len(agents) else None
        if incoming is None:
            errors.append(f"Missing agent at position {index + 1}: {character}.")
            continue
        if incoming.character != character:
            errors.append(f"Agent {index + 1} must be {character}.")

        persona = (incoming.persona or "").strip()
        if not persona:
            errors.append(f"{character} persona is required.")
        if len(persona) > MAX_PERSONA_LENGTH:
            errors.append(f"{character} persona must be {MAX_PERSONA_LENGTH} characters or fewer.")

        default_agent = AGENTS[index]
        normalised.append({
            "character": character,
            "name": default_agent["name"],
            "persona": persona,
        })

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    return normalised


def conversation_agents(conversation: dict) -> list[dict]:
    agents = conversation.get("config", {}).get("agents")
    if isinstance(agents, list) and len(agents) == len(AGENT_CHARACTERS):
        return agents
    return [agent.copy() for agent in AGENTS]


def validate_review_rounds(review_rounds: Optional[int]) -> int:
    return DEFAULT_REVIEW_ROUNDS


def conversation_review_rounds(conversation: dict) -> int:
    try:
        return validate_review_rounds(conversation.get("config", {}).get("review_rounds"))
    except HTTPException:
        return DEFAULT_REVIEW_ROUNDS


@app.get("/")
async def root():
    return {"status": "ok", "service": "Counseling Dialogue API"}


@app.get("/api/settings")
async def get_settings():
    return {
        "default_model": DEFAULT_GEMINI_MODEL,
        "agents": AGENTS,
    }


@app.get("/api/conversations")
async def list_conversations():
    return storage.list_conversations()


@app.post("/api/conversations", status_code=201)
async def create_conversation(request: CreateConversationRequest):
    conversation_id = str(uuid.uuid4())
    agents = validate_agents(request.agents)
    review_rounds = validate_review_rounds(request.review_rounds)
    config = {
        "model": (request.model or DEFAULT_GEMINI_MODEL).strip(),
        "agents": agents,
        "review_rounds": review_rounds,
    }
    return storage.create_conversation(conversation_id, config)


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str):
    if not storage.delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.post("/api/conversations/{conversation_id}/messages")
async def create_message(conversation_id: str, request: CreateMessageRequest):
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail={"errors": ["Message is required."]})

    client_message = {
        "id": str(uuid.uuid4()),
        "role": "client",
        "content": content,
        "created_at": now_iso(),
    }
    storage.add_message(conversation_id, client_message)

    conversation = storage.get_conversation(conversation_id)
    model = (request.model or conversation.get("config", {}).get("model") or DEFAULT_GEMINI_MODEL).strip()
    if model != conversation.get("config", {}).get("model"):
        conversation = storage.update_conversation_config(conversation_id, {"model": model})
    agents = conversation_agents(conversation)
    review_rounds = conversation_review_rounds(conversation)

    try:
        agent_round = await run_counseling_round(
            model=model,
            messages=conversation.get("messages", []),
            client_message=client_message,
            agents=agents,
            review_rounds=review_rounds,
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Counseling round failed: {exc}")

    storage.add_agent_round(conversation_id, agent_round)

    counselor_message = {
        "id": str(uuid.uuid4()),
        "role": "counselor",
        "content": agent_round["winner"]["reply"],
        "created_at": now_iso(),
        "source_round_id": agent_round["id"],
        "source_agent": agent_round["winner"]["character"],
    }
    storage.add_message(conversation_id, counselor_message)

    conversation = storage.get_conversation(conversation_id)
    return {
        "client_message": client_message,
        "counselor_message": counselor_message,
        "agent_round": agent_round,
        "conversation": conversation,
    }


def stream_event(event_type: str, payload: dict) -> str:
    return json.dumps(
        {"type": event_type, "payload": payload},
        ensure_ascii=False,
    ) + "\n"


async def indexed_candidate(model, index, agent, context, content, high_risk, round_number, previous_round):
    candidate = await generate_candidate(
        model,
        agent,
        context,
        content,
        high_risk,
        round_number,
        previous_round,
    )
    return index, candidate


@app.post("/api/conversations/{conversation_id}/messages/stream")
async def create_message_stream(conversation_id: str, request: CreateMessageRequest):
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail={"errors": ["Message is required."]})

    client_message = {
        "id": str(uuid.uuid4()),
        "role": "client",
        "content": content,
        "created_at": now_iso(),
    }
    storage.add_message(conversation_id, client_message)

    conversation = storage.get_conversation(conversation_id)
    model = (request.model or conversation.get("config", {}).get("model") or DEFAULT_GEMINI_MODEL).strip()
    if model != conversation.get("config", {}).get("model"):
        conversation = storage.update_conversation_config(conversation_id, {"model": model})
    agents = conversation_agents(conversation)
    review_rounds = conversation_review_rounds(conversation)

    async def generate_events():
        yield stream_event("client_message", {"client_message": client_message})

        context = visible_context(conversation.get("messages", []))
        high_risk = is_high_risk(content)
        rounds = []
        previous_round = None
        candidate_tasks = []
        try:
            for round_number in range(1, review_rounds + 1):
                yield stream_event("round_started", {
                    "round_number": round_number,
                    "review_rounds": review_rounds,
                    "agents": agents,
                    "high_risk": high_risk,
                    "model": model,
                })

                candidates_by_index = [None] * len(agents)
                candidate_tasks = [
                    asyncio.create_task(
                        indexed_candidate(
                            model,
                            index,
                            agent,
                            context,
                            content,
                            high_risk,
                            round_number,
                            previous_round,
                        )
                    )
                    for index, agent in enumerate(agents)
                ]
                for task in asyncio.as_completed(candidate_tasks):
                    index, candidate = await task
                    candidates_by_index[index] = candidate
                    yield stream_event("candidate_ready", {
                        "round_number": round_number,
                        "index": index,
                        "candidate": candidate,
                    })

                candidates = [candidate for candidate in candidates_by_index if candidate is not None]
                round_result = build_round_result(round_number, candidates)
                rounds.append(round_result)
                previous_round = round_result
                yield stream_event("round_complete", {
                    "round_number": round_number,
                    "round": round_result,
                })

            final_reply = await synthesize_final_reply(model, context, content, rounds[-1]["candidates"], high_risk)
            agent_round = build_agent_round(client_message, high_risk, review_rounds, rounds, final_reply)
            storage.add_agent_round(conversation_id, agent_round)

            counselor_message = {
                "id": str(uuid.uuid4()),
                "role": "counselor",
                "content": agent_round["winner"]["reply"],
                "created_at": now_iso(),
                "source_round_id": agent_round["id"],
                "source_agent": agent_round["winner"]["character"],
            }
            storage.add_message(conversation_id, counselor_message)

            updated_conversation = storage.get_conversation(conversation_id)
            yield stream_event("winner_selected", {
                "round_number": review_rounds,
                "agent_round": agent_round,
                "counselor_message": counselor_message,
                "conversation": updated_conversation,
            })
        except LLMError as exc:
            for task in candidate_tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*candidate_tasks, return_exceptions=True)
            yield stream_event("error", {"message": str(exc)})
        except Exception as exc:
            for task in candidate_tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*candidate_tasks, return_exceptions=True)
            yield stream_event("error", {"message": f"Counseling round failed: {exc}"})

    return StreamingResponse(generate_events(), media_type="application/x-ndjson")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
