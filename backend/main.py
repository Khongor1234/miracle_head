"""FastAPI backend for the counseling dialogue app."""

import asyncio
import uuid

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

from . import storage
from .auth import require_app_password
from .config import CORS_ORIGINS, DEFAULT_GEMINI_MODEL, ELEVENLABS_API_KEY, ELEVENLABS_VOICES, IS_VERCEL
from .counseling import AGENTS, AGENT_CHARACTERS, now_iso, run_counseling_round
from .llm import LLMError
from .stream import counseling_events, new_client_message
from .visitor import require_visitor_id

# The schema pages sit outside the password dependency, so hide them in the cloud.
_DOCS_OFF = {"docs_url": None, "redoc_url": None, "openapi_url": None} if IS_VERCEL else {}

app = FastAPI(title="Counseling Dialogue API", dependencies=[Depends(require_app_password)], **_DOCS_OFF)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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
    lang: Optional[str] = "ja"


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
async def list_conversations(visitor_id: str = Depends(require_visitor_id)):
    return await asyncio.to_thread(storage.list_conversations, visitor_id)


@app.post("/api/conversations", status_code=201)
async def create_conversation(request: CreateConversationRequest, visitor_id: str = Depends(require_visitor_id)):
    conversation_id = str(uuid.uuid4())
    agents = validate_agents(request.agents)
    review_rounds = validate_review_rounds(request.review_rounds)
    config = {
        "model": (request.model or DEFAULT_GEMINI_MODEL).strip(),
        "agents": agents,
        "review_rounds": review_rounds,
    }
    return await asyncio.to_thread(storage.create_conversation, conversation_id, config, visitor_id)


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, visitor_id: str = Depends(require_visitor_id)):
    conversation = await asyncio.to_thread(storage.get_owned_conversation, conversation_id, visitor_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str, visitor_id: str = Depends(require_visitor_id)):
    if not await asyncio.to_thread(storage.delete_conversation, conversation_id, visitor_id):
        raise HTTPException(status_code=404, detail="Conversation not found")


@app.post("/api/conversations/{conversation_id}/messages")
async def create_message(
    conversation_id: str, request: CreateMessageRequest, visitor_id: str = Depends(require_visitor_id)
):
    conversation = await asyncio.to_thread(storage.get_owned_conversation, conversation_id, visitor_id)
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
    await asyncio.to_thread(storage.add_message, conversation_id, client_message)

    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    model = (request.model or conversation.get("config", {}).get("model") or DEFAULT_GEMINI_MODEL).strip()
    if model != conversation.get("config", {}).get("model"):
        conversation = await asyncio.to_thread(storage.update_conversation_config, conversation_id, {"model": model})
    agents = conversation_agents(conversation)
    review_rounds = conversation_review_rounds(conversation)

    try:
        agent_round = await run_counseling_round(
            model=model,
            messages=conversation.get("messages", []),
            client_message=client_message,
            agents=agents,
            review_rounds=review_rounds,
            lang=request.lang or "ja",
        )
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Counseling round failed: {exc}")

    await asyncio.to_thread(storage.add_agent_round, conversation_id, agent_round)

    counselor_message = {
        "id": str(uuid.uuid4()),
        "role": "counselor",
        "content": agent_round["winner"]["reply"],
        "created_at": now_iso(),
        "source_round_id": agent_round["id"],
        "source_agent": agent_round["winner"]["character"],
    }
    await asyncio.to_thread(storage.add_message, conversation_id, counselor_message)

    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    return {
        "client_message": client_message,
        "counselor_message": counselor_message,
        "agent_round": agent_round,
        "conversation": conversation,
    }


@app.post("/api/conversations/{conversation_id}/messages/stream")
async def create_message_stream(
    conversation_id: str, request: CreateMessageRequest, visitor_id: str = Depends(require_visitor_id)
):
    conversation = await asyncio.to_thread(storage.get_owned_conversation, conversation_id, visitor_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail={"errors": ["Message is required."]})

    client_message = new_client_message(content)
    await asyncio.to_thread(storage.add_message, conversation_id, client_message)

    conversation = await asyncio.to_thread(storage.get_conversation, conversation_id)
    model = (request.model or conversation.get("config", {}).get("model") or DEFAULT_GEMINI_MODEL).strip()
    if model != conversation.get("config", {}).get("model"):
        conversation = await asyncio.to_thread(storage.update_conversation_config, conversation_id, {"model": model})

    async def save_round(agent_round: dict, counselor_message: dict) -> dict:
        await asyncio.to_thread(storage.add_agent_round, conversation_id, agent_round)
        await asyncio.to_thread(storage.add_message, conversation_id, counselor_message)
        return await asyncio.to_thread(storage.get_conversation, conversation_id)

    events = counseling_events(
        model=model,
        agents=conversation_agents(conversation),
        messages=conversation.get("messages", []),
        client_message=client_message,
        lang=request.lang or "ja",
        on_finished=save_round,
    )
    return StreamingResponse(events, media_type="application/x-ndjson")


MAX_HISTORY_MESSAGES = 40
MAX_MESSAGE_LENGTH = 4000


class HistoryMessage(BaseModel):
    role: Literal["client", "counselor"]
    content: str = Field(max_length=MAX_MESSAGE_LENGTH)


class StatelessChatRequest(BaseModel):
    content: str = Field(max_length=MAX_MESSAGE_LENGTH)
    model: Optional[str] = None
    lang: Optional[str] = "ja"
    agents: Optional[List[AgentRequest]] = None
    history: List[HistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)


async def _nothing_to_save(agent_round: dict, counselor_message: dict) -> None:
    return None


@app.post("/api/chat/stream")
async def stateless_chat_stream(request: StatelessChatRequest):
    """Run one counseling round without storing anything.

    The browser keeps the conversation and sends the recent history with
    every message, so no database is needed.
    """
    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail={"errors": ["Message is required."]})

    client_message = new_client_message(content)
    history = [{"role": m.role, "content": m.content} for m in request.history]
    events = counseling_events(
        model=(request.model or DEFAULT_GEMINI_MODEL).strip(),
        agents=validate_agents(request.agents),
        messages=[*history, client_message],
        client_message=client_message,
        lang=request.lang or "ja",
        on_finished=_nothing_to_save,
    )
    return StreamingResponse(events, media_type="application/x-ndjson")


MAX_TTS_TEXT_LENGTH = 5000
_ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
_ALLOWED_TTS_CHARACTERS = {agent["character"] for agent in AGENTS}


class TTSRequest(BaseModel):
    text: str
    character: Optional[str] = None


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured")

    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > MAX_TTS_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"text must be {MAX_TTS_TEXT_LENGTH} characters or fewer")

    character = (request.character or "").strip()
    if character and character not in _ALLOWED_TTS_CHARACTERS:
        raise HTTPException(status_code=400, detail="unknown character")

    voice_id = ELEVENLABS_VOICES.get(character) or ELEVENLABS_VOICES.get("default", "")
    if not voice_id or voice_id.startswith("your-"):
        raise HTTPException(status_code=503, detail="Voice not configured — set voice IDs in config.json")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{_ELEVENLABS_TTS_URL}/{voice_id}",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            },
        )

    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=502, detail=f"ElevenLabs error {resp.status_code}: {detail}")

    return Response(content=resp.content, media_type="audio/mpeg")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
