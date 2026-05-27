# Counseling Dialogue

A local counseling dialogue prototype powered by a local vLLM OpenAI-compatible API. The visible chat is a client/counselor conversation. Behind each counselor response, five internal Inside Out-style agents propose and score possible replies; the highest-scoring reply is shown to the client.

This is a supportive role-play prototype, not a licensed clinical tool.

## How It Works

1. The client sends a message in the chat UI.
2. Five internal agents generate Japanese counselor reply candidates: Disgust, Fear, Joy, Sadness, and Anger.
3. The five agents score each candidate on empathy, safety, clarity, helpful next step, and appropriateness.
4. The highest-scoring candidate is saved and shown as the counselor reply.
5. The visible conversation and the internal agent review are stored locally as JSON.

## LLM Configuration

Create a `.env` file in the project root:

```env
DEFAULT_LLM_MODEL=gemini-3.1-flash-lite-preview
GEMINI_API_KEY=your_google_ai_studio_api_key_here
LOCAL_LLM_URL=http://localhost:8000
LOCAL_LLM_MODEL=kokoro-chat
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

## Configuration

`config.json`:

```json
{
  "default_llm_model": "gemini-3.1-flash-lite-preview"
}
```

## Backend API

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
