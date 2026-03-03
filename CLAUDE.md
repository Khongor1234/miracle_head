# CLAUDE.md - Technical Notes for LLM Debate

This file contains technical details, architectural decisions, and important implementation notes for future development sessions.

## Project Overview

LLM Debate is a turn-based debate system where two LLMs argue opposing positions on a topic. An optional third judge model evaluates the debate and declares a winner. The project was refactored from an earlier "LLM Council" 3-stage pipeline system.

## Architecture

### Backend Structure (`backend/`)

**`config.py`**
- Loads `OPENROUTER_API_KEY` from `.env`
- Loads `POV_GENERATOR_MODEL` from `config.json` (default: `anthropic/claude-sonnet-4-5`)
- Loads `DEFAULT_MAX_TURNS` from `config.json` (default: 5)
- Storage path: `data/conversations/`
- Backend runs on **port 8001**

**`openrouter.py`**
- `query_model()`: Single async model query via httpx
- `query_model_streaming()`: Token-by-token streaming from OpenRouter API
- `query_model_with_retry()`: Auto-retry wrapper (3 attempts, 2s delay)
- `query_models_parallel()`: Concurrent queries using `asyncio.gather()`
- All functions use `httpx.AsyncClient`

**`debate.py`** - The Core Logic
- `build_debater_system_prompt()`: Creates system prompt with topic, POV, opponent info, and optional judging criteria
- `build_turn_messages()`: Builds message array; maps current speaker's turns to "assistant" and opponent's to "user"
- `run_debate_turn()`: Execute a single non-streaming turn
- `run_debate_turn_streaming()`: Execute a single turn with token streaming
- `generate_povs()`: Calls POV generator model to create two opposing positions
- `generate_debate_title()`: Generates short debate title (runs async in background after debate starts)
- `run_judge()`: Calls judge model, parses JSON scorecard with 5 facets + winner verdict
  - Facets: Argumentation, Evidence & Reasoning, Rebuttal, Clarity, Persuasiveness
  - Scores: 0–10 per model per facet

**`models.py`** - Model Validation
- `_fetch_openrouter_models()`: HTTP GET to OpenRouter `/api/v1/models`
- `_get_models_cached()`: 1-hour TTL cache stored in `data/models_cache.json`
- `validate_model()`: Check if a model_id exists on OpenRouter
- `validate_models()`: Validate both debater models before creating a debate

**`storage.py`**
- JSON-based storage in `data/conversations/`, one file per debate
- `create_debate()`, `get_conversation()`, `save_debate()`, `add_debate_turn()`
- `update_debate_status()`: Statuses are `pending`, `in_progress`, `completed`, `error`
- `update_conversation_title()`: Updated asynchronously after debate completes
- `save_judge_result()`: Persists judge scorecard to debate JSON
- `list_conversations()`: Returns metadata only (id, created_at, title, turn_count, status)

**`main.py`**
- FastAPI app with CORS enabled for `localhost:5173` and `localhost:3000`
- Endpoints:
  - `GET /` — Health check
  - `GET /api/debates` — List all debates
  - `GET /api/debates/{id}` — Fetch debate details
  - `POST /api/debates` — Create debate (validates models first)
  - `POST /api/debates/{id}/start` — Stream debate via SSE
  - `POST /api/debates/{id}/judge` — Run judge model
  - `DELETE /api/debates/{id}` — Delete debate (204)
  - `POST /api/generate-povs` — Generate opposing POVs for a topic

### Frontend Structure (`frontend/src/`)

**`App.jsx`**
- Main orchestrator: manages `debates[]`, `currentDebateId`, `currentDebate`, `showSetup`, `loadingTurn`
- Token streaming with `useRef` buffering and 150ms flush interval (prevents React re-render thrash)
- `streamDebate()`: Subscribes to SSE, handles events: `turn_start`, `token`, `turn_complete`, `debate_complete`, `title_complete`, `error`
- Auto-judges after streaming if `judge_model` is configured

**`components/Sidebar.jsx`**
- Logo + "New Debate" button
- Debate list with title, turn count, status indicator dot
- Per-debate delete button

**`components/DebateSetup.jsx`**
- Inputs: model1, model2, topic, pov1, pov2, max_turns (1–15), optional judge_model
- "Generate" buttons call backend to auto-generate POVs from the topic
- Side A/B color-coded cards (blue/orange)
- Validates before submission, displays field-level errors

**`components/DebateView.jsx`**
- Renders debate header (topic + both sides with POVs)
- Chat-bubble layout: model1 on left, model2 on right
- During streaming: plain text + typing cursor (avoids ReactMarkdown re-parse lag)
- After streaming: ReactMarkdown rendering
- Auto-scrolls to bottom on new turns
- Triggers judge section when debate is complete

**`components/JudgeReport.jsx`**
- Verdict banner: winner name, total scores, summary
- Scorecard table: 5 facets × 2 models with scores (0–10), bar visualization, and per-model notes
- Total row with max possible score
- Judge model attribution, winner-side highlighted

**Styling**
- **Dark theme**: background `#0b0b10`, text `#eceaf5`
- Model A (blue): `#5ba3f5`; Model B (orange): `#f5924a`
- Fonts: Playfair Display (display), Source Serif 4 (body), Outfit (UI)
- Global markdown styling in `index.css` via `.markdown-content` class

## Key Design Decisions

### Turn-Based Message Mapping
Each debater only sees its own turns as "assistant" and opponent turns as "user". This creates a natural conversation perspective per model, without exposing the underlying multi-model architecture.

### SSE Streaming
Debate turns stream token-by-token via Server-Sent Events. The frontend buffers tokens using `useRef` and flushes to state every 150ms to avoid per-token React re-renders. During streaming, plain text is rendered (not ReactMarkdown) to prevent re-parse latency on every token.

### POV Generation
A dedicated `pov_generator_model` (configurable in `config.json`) generates two opposing POVs given a topic. This is separate from the debater models to avoid conflicts of interest.

### Judge System
The optional judge is a third model that receives the full debate transcript and returns a structured JSON scorecard. Scores are per-facet (5 facets × 10 max = 50 points per model). The judge is called after the debate completes, either automatically or on demand.

### Model Validation
Both debater models are validated against OpenRouter's model list before a debate is created. The list is cached for 1 hour in `data/models_cache.json`.

### Error Handling Philosophy
- Single turn failures don't abort the debate; they're reported via SSE `turn_error`
- Retry logic in `query_model_with_retry()` handles transient API failures
- All errors logged; only surfaced to user if unrecoverable

## Important Implementation Details

### Relative Imports
All backend modules use relative imports (`from .config import ...`). Run backend as `python -m backend.main` from project root, never from the backend directory.

### Port Configuration
- Backend: 8001
- Frontend: 5173 (Vite default)
- Update both `backend/main.py` and `frontend/src/api.js` if changing

### Running the Project
```bash
make start      # Start both backend and frontend
make stop       # Kill both services
make restart    # Stop then start
```
Logs go to `.logs/backend.log` and `.logs/frontend.log`. PIDs stored in `.pids/`.

### Markdown Rendering
All ReactMarkdown components must be wrapped in `<div className="markdown-content">` for proper spacing. Defined globally in `index.css`.

### Config File
`config.json` in project root controls:
- `pov_generator_model`: Model used for POV generation
- `default_max_turns`: Default number of debate turns (user can override in UI)

## Data Storage Schema

Each debate stored as `data/conversations/{id}.json`:
```json
{
  "id": "uuid",
  "created_at": "ISO timestamp",
  "title": "auto-generated title",
  "config": {
    "model1": "openai/gpt-5.2",
    "model2": "anthropic/claude-sonnet-4-6",
    "model1_name": "display name",
    "model2_name": "display name",
    "topic": "debate topic",
    "pov1": "model1 position",
    "pov2": "model2 position",
    "max_turns": 5,
    "judge_model": "model id or null"
  },
  "turns": [
    {
      "speaker": "model1|model2",
      "model": "full model id",
      "speaker_name": "display name",
      "content": "debate text",
      "turn_number": 1,
      "msg_index": 1
    }
  ],
  "status": "pending|in_progress|completed|error",
  "judge_result": {
    "facets": [{"name": "...", "model1_score": 8, "model2_score": 9, ...}],
    "winner": "model name or Draw",
    "summary": "judge summary",
    "total_model1": 39,
    "total_model2": 44,
    "judge_model": "model id"
  }
}
```

## SSE Event Types

From `POST /api/debates/{id}/start`:
- `debate_start` — Debate begins
- `turn_start` — New turn (speaker, speaker_name, turn_number, msg_index)
- `token` — Single token from streaming response
- `turn_complete` — Full turn object
- `turn_error` — Turn failed (message)
- `title_complete` — Auto-generated title ready
- `debate_complete` — All turns finished
- `error` — Unrecoverable error

## Common Gotchas

1. **Module Import Errors**: Always run `python -m backend.main` from project root
2. **CORS Issues**: Frontend origin must be in `main.py` CORS middleware allow-list
3. **Streaming Performance**: Never render streamed tokens directly in React state per-token; use ref + interval flush
4. **Model Validation Failures**: OpenRouter model list cache may be stale; delete `data/models_cache.json` to force refresh
5. **Judge JSON Parsing**: Judge prompt enforces strict JSON output; malformed responses fall back to error state

## Data Flow Summary

```
User configures debate (models, topic, POVs, max_turns)
    ↓
POST /api/debates → validate both models → create debate JSON
    ↓
POST /api/debates/{id}/start → SSE stream opens
    ↓
For each turn:
  build_turn_messages() → query_model_streaming() → stream tokens via SSE
  → turn_complete event → save to storage
    ↓
Background: generate_debate_title() → title_complete SSE event
    ↓
debate_complete event
    ↓
Optional: POST /api/debates/{id}/judge → run_judge() → scorecard
    ↓
Frontend: DebateView renders chat bubbles + JudgeReport
```

The entire flow is async; streaming is token-by-token via SSE.
