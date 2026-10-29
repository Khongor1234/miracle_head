"""Configuration for the counseling dialogue system."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# Load config from config.json at project root
_config_path = Path(__file__).parent.parent / "config.json"
with open(_config_path) as f:
    _config = json.load(f)

ELEVENLABS_VOICES: dict = _config.get("elevenlabs_voices", {})

# Default model for counselor agents. Keep the old constant name so existing
# endpoint code and saved conversations remain compatible.
DEFAULT_GEMINI_MODEL = os.getenv(
    "DEFAULT_LLM_MODEL",
    _config.get("default_llm_model", _config.get("default_gemini_model", "gemini-2.5-flash-lite")),
)

# Gemini API endpoint
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"

# Data directories for JSON storage. On a Linux server, set these to a
# persistent path such as /var/lib/llm-debate/conversations and
# /var/lib/llm-debate/dialogues.
DATA_DIR = os.getenv("DATA_DIR", "data/conversations")
DIALOGUE_DIR = os.getenv("DIALOGUE_DIR", str(Path(DATA_DIR).parent / "dialogues"))

# Supabase storage replaces the JSON files when both are set (required on Vercel).
# Use the project's secret key (sb_secret_...) or legacy service_role key — server-side only.
# Stripped because values pasted into a dashboard often carry a trailing newline.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY", "").strip()

# Shared password the frontend sends in X-App-Password (the gate trims input too).
# Unset = open API, allowed off Vercel, or on Vercel with PUBLIC_ACCESS=true.
APP_PASSWORD = os.getenv("APP_PASSWORD", "").strip()
IS_VERCEL = bool(os.getenv("VERCEL"))
# Explicit opt-in for a public demo on Vercel; cap the Gemini spend instead of using a password.
PUBLIC_ACCESS = os.getenv("PUBLIC_ACCESS", "").strip().lower() in {"1", "true", "yes"}

_DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,https://miracle-head.vercel.app"
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",") if origin.strip()]
