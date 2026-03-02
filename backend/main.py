"""FastAPI backend for LLM Debate."""

import asyncio
import json
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from . import storage
from .config import DEFAULT_MAX_TURNS
from .debate import (
    build_debater_system_prompt,
    generate_debate_title,
    generate_povs,
    run_debate_turn,
    run_debate_turn_streaming,
    run_judge,
)
from .models import validate_models

app = FastAPI(title="LLM Debate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class GeneratePOVsRequest(BaseModel):
    topic: str
    keywords: Optional[str] = ""


class CreateDebateRequest(BaseModel):
    model1: str
    model2: str
    model1_name: Optional[str] = None
    model2_name: Optional[str] = None
    topic: str
    pov1: str
    pov2: str
    max_turns: Optional[int] = None
    judge_model: Optional[str] = None


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "service": "LLM Debate API"}


# ---------------------------------------------------------------------------
# Debates list / get
# ---------------------------------------------------------------------------

@app.get("/api/debates")
async def list_debates():
    """List all debates (metadata only)."""
    return storage.list_conversations()


@app.get("/api/debates/{debate_id}")
async def get_debate(debate_id: str):
    """Get a specific debate."""
    debate = storage.get_conversation(debate_id)
    if debate is None:
        raise HTTPException(status_code=404, detail="Debate not found")
    return debate


@app.delete("/api/debates/{debate_id}", status_code=204)
async def delete_debate_record(debate_id: str):
    """Delete a debate."""
    import os
    path = storage.get_debate_path(debate_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Debate not found")
    os.remove(path)


# ---------------------------------------------------------------------------
# POV generation
# ---------------------------------------------------------------------------

@app.post("/api/generate-povs")
async def generate_povs_endpoint(request: GeneratePOVsRequest):
    """Generate two opposing POVs for a topic."""
    result = await generate_povs(request.topic, request.keywords or "")
    return result


# ---------------------------------------------------------------------------
# Create debate
# ---------------------------------------------------------------------------

@app.post("/api/debates", status_code=201)
async def create_debate(request: CreateDebateRequest):
    """Validate models and create a new debate record."""
    validation = await validate_models(request.model1, request.model2)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail={"errors": validation["errors"]})

    debate_id = str(uuid.uuid4())
    max_turns = request.max_turns if request.max_turns is not None else DEFAULT_MAX_TURNS

    # Derive display names if not provided
    model1_name = request.model1_name or request.model1.split("/")[-1]
    model2_name = request.model2_name or request.model2.split("/")[-1]

    config = {
        "model1": request.model1,
        "model2": request.model2,
        "model1_name": model1_name,
        "model2_name": model2_name,
        "topic": request.topic,
        "pov1": request.pov1,
        "pov2": request.pov2,
        "max_turns": max_turns,
        "judge_model": request.judge_model or None,
    }

    debate = storage.create_debate(debate_id, config)
    return debate


# ---------------------------------------------------------------------------
# Start / stream debate
# ---------------------------------------------------------------------------

@app.post("/api/debates/{debate_id}/start")
async def start_debate(debate_id: str):
    """Stream the debate turn-by-turn via SSE."""
    debate = storage.get_conversation(debate_id)
    if debate is None:
        raise HTTPException(status_code=404, detail="Debate not found")

    if debate.get("status") not in ("pending", "error"):
        raise HTTPException(status_code=400, detail="Debate already started or completed")

    async def event_generator():
        cfg = debate["config"]
        model1 = cfg["model1"]
        model2 = cfg["model2"]
        model1_name = cfg["model1_name"]
        model2_name = cfg["model2_name"]
        topic = cfg["topic"]
        pov1 = cfg["pov1"]
        pov2 = cfg["pov2"]
        max_turns = cfg["max_turns"]

        judged = bool(cfg.get("judge_model"))
        system1 = build_debater_system_prompt(
            name=model1_name,
            topic=topic,
            pov=pov1,
            opponent_name=model2_name,
            opponent_pov=pov2,
            max_turns=max_turns,
            judged=judged,
        )
        system2 = build_debater_system_prompt(
            name=model2_name,
            topic=topic,
            pov=pov2,
            opponent_name=model1_name,
            opponent_pov=pov1,
            max_turns=max_turns,
            judged=judged,
        )

        try:
            storage.update_debate_status(debate_id, "in_progress")
            yield f"data: {json.dumps({'type': 'debate_start', 'debate_id': debate_id})}\n\n"

            # Start title generation in background
            title_task = asyncio.create_task(generate_debate_title(topic))

            debate_history: List[Dict[str, Any]] = []

            total_messages = max_turns * 2  # each turn = both sides speak
            for msg_index in range(1, total_messages + 1):
                turn_number = (msg_index + 1) // 2  # round number (1-based)
                # Alternate speakers: odd messages → model1, even messages → model2
                if msg_index % 2 == 1:
                    speaker = "model1"
                    model = model1
                    speaker_name = model1_name
                    system_prompt = system1
                    opponent_name = model2_name
                else:
                    speaker = "model2"
                    model = model2
                    speaker_name = model2_name
                    system_prompt = system2
                    opponent_name = model1_name

                yield f"data: {json.dumps({'type': 'turn_start', 'turn_number': turn_number, 'msg_index': msg_index, 'speaker': speaker, 'speaker_name': speaker_name})}\n\n"

                # Stream tokens with retry logic
                content = ""
                max_attempts = 3
                retry_delay = 2.0

                for attempt in range(1, max_attempts + 1):
                    try:
                        content = ""
                        async for token in run_debate_turn_streaming(
                            model=model,
                            system_prompt=system_prompt,
                            debate_history=debate_history,
                            speaker_name=speaker_name,
                            opponent_name=opponent_name,
                            turn_number=msg_index,
                            max_turns=total_messages,
                        ):
                            content += token
                            yield f"data: {json.dumps({'type': 'token', 'turn_number': turn_number, 'msg_index': msg_index, 'speaker': speaker, 'token': token})}\n\n"
                        break  # Success
                    except Exception as e:
                        print(f"Streaming error for {model} (attempt {attempt}/{max_attempts}): {e}")
                        if attempt < max_attempts:
                            await asyncio.sleep(retry_delay)
                        else:
                            content = ""

                if not content:
                    yield f"data: {json.dumps({'type': 'turn_error', 'turn_number': turn_number, 'msg_index': msg_index, 'speaker': speaker, 'message': f'Model {model} failed to respond'})}\n\n"
                    continue

                turn = {
                    "speaker": speaker,
                    "model": model,
                    "speaker_name": speaker_name,
                    "content": content,
                    "turn_number": turn_number,
                    "msg_index": msg_index,
                }

                debate_history.append(turn)
                storage.add_debate_turn(debate_id, turn)

                yield f"data: {json.dumps({'type': 'turn_complete', 'turn': turn})}\n\n"

            # Finalize title
            title = await title_task
            storage.update_conversation_title(debate_id, title)
            storage.update_debate_status(debate_id, "completed")

            yield f"data: {json.dumps({'type': 'title_complete', 'title': title})}\n\n"
            yield f"data: {json.dumps({'type': 'debate_complete'})}\n\n"

        except Exception as e:
            storage.update_debate_status(debate_id, "error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Judge debate
# ---------------------------------------------------------------------------

@app.post("/api/debates/{debate_id}/judge")
async def judge_debate(debate_id: str):
    """Run the configured judge model on a completed debate."""
    debate = storage.get_conversation(debate_id)
    if debate is None:
        raise HTTPException(status_code=404, detail="Debate not found")

    if debate.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Debate must be completed before judging")

    judge_model = debate["config"].get("judge_model")
    if not judge_model:
        raise HTTPException(status_code=400, detail="No judge model configured for this debate")

    cfg = debate["config"]
    try:
        result = await run_judge(
            judge_model=judge_model,
            topic=cfg["topic"],
            model1_name=cfg["model1_name"],
            pov1=cfg["pov1"],
            model2_name=cfg["model2_name"],
            pov2=cfg["pov2"],
            turns=debate.get("turns", []),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    storage.save_judge_result(debate_id, result)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
