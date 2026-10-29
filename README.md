# Counseling Dialogue

A counseling dialogue prototype powered by Gemini or a local OpenAI-compatible API. The visible chat is a client/counselor conversation. Behind each counselor response, five internal Inside Out-style agents propose replies, revise them after seeing the other agents, then score the revised replies to select one counselor response for the client.

This is a supportive role-play prototype, not a licensed clinical tool.

## How It Works

1. The client sends a message in the chat UI.
2. Five internal agents generate Japanese counselor reply candidates: Disgust, Fear, Joy, Sadness, and Anger.
3. The five agents run a second round that reflects on the other agents' first-round replies.
4. Each agent scores the other four second-round replies.
5. The visible conversation and the internal agent review are stored locally as JSON.

## LLM Configuration

Create a `.env` file in the project root:

```env
DEFAULT_LLM_MODEL=gemini-2.5-flash-lite
GEMINI_API_KEY=your_google_ai_studio_api_key_here
LOCAL_LLM_URL=http://localhost:8000
LOCAL_LLM_MODEL=kokoro-chat
DATA_DIR=data/conversations
DIALOGUE_DIR=data/dialogues
```

The frontend model field controls which backend is used. Model names starting with `gemini` or `models/gemini` are sent to the Gemini API. Other model names are sent to the local OpenAI-compatible endpoint at `${LOCAL_LLM_URL}/v1/chat/completions`.

The frontend never asks for or stores API keys.

## Setup

```bash
uv sync
cd frontend && npm install
```

## Run

```bash
make start
```

Open `http://localhost:5173`.

Stop both services:

```bash
make stop
```

## Linux Server Storage

For persistent JSON storage on a Linux server, point the backend at server-owned directories:

```env
DATA_DIR=/var/lib/llm-debate/conversations
DIALOGUE_DIR=/var/lib/llm-debate/dialogues
```

Create the folders and give the backend user write access:

```bash
sudo mkdir -p /var/lib/llm-debate/conversations /var/lib/llm-debate/dialogues
sudo chown -R $USER:$USER /var/lib/llm-debate
```

The full app session JSON is saved to `DATA_DIR`. The simplified dataset-style JSON is saved to `DIALOGUE_DIR` with numeric filenames such as `1.json`, `2.json`, and `3.json`:

```json
{
  "dialogue": [
    {
      "role": "client",
      "time": "2026-05-27T18:00:00",
      "utterance": "こんにちは"
    },
    {
      "role": "counselor",
      "time": "2026-05-27T18:00:05",
      "utterance": "こんにちは。相談員です。"
    }
  ]
}
```

Example backend command:

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8001
```

## Configuration

`config.json`:

```json
{
  "default_llm_model": "gemini-2.5-flash-lite"
}
```

## Deploy to Vercel + Supabase

The frontend and the backend are two Vercel projects from this one repository.
Vercel functions have no persistent disk, so the backend stores conversations in Supabase
whenever `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set (local runs keep using JSON files).

1. **Supabase**: create a project, open the SQL editor, and run
   `supabase/migrations/20261030000000_conversations.sql`.
   Copy the project URL and a **secret** key (`sb_secret_...`) from Project Settings → API Keys.
2. **Backend project** on Vercel: import this repo with Root Directory = repository root.
   Vercel picks up FastAPI from `[tool.vercel] entrypoint` in `pyproject.toml`; `vercel.json`
   allows a 300 s run for the five-agent round. Environment variables:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | Google AI Studio key |
   | `APP_PASSWORD` | the shared password users type into the app |
   | `SUPABASE_URL` | `https://<project>.supabase.co` |
   | `SUPABASE_SECRET_KEY` | the `sb_secret_...` key |
   | `CORS_ORIGINS` | `https://miracle-head.vercel.app` (comma-separated if several) |
   | `ELEVENLABS_API_KEY` | optional, for TTS |

   On Vercel the API refuses to run without `APP_PASSWORD` (503) and without Supabase settings.
3. **Frontend project** (Root Directory = `frontend`): set `VITE_API_URL` to the backend URL and redeploy.

Only Gemini models work in the cloud; local OpenAI-compatible models need `LOCAL_LLM_URL` to be reachable from Vercel.

Export the dataset-style dialogues from Supabase:

```sql
select dialogue_file_number, data->'dialogue' as dialogue
from conversations order by dialogue_file_number;
```

## Backend API

Every request needs the `X-App-Password` header when `APP_PASSWORD` is set.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Default model and agent definitions |
| `GET` | `/api/conversations` | List saved sessions |
| `POST` | `/api/conversations` | Create a session |
| `GET` | `/api/conversations/{id}` | Get a saved session |
| `DELETE` | `/api/conversations/{id}` | Delete a saved session |
| `POST` | `/api/conversations/{id}/messages` | Add a client message and generate counselor response |

## Safety

Messages containing terms such as `死にたい`, `自殺`, or `消えたい` trigger a crisis-safety prompt path. The generated response is instructed to validate the client, ask about immediate danger, and encourage contacting emergency/local crisis support or a trusted person.
