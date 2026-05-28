"""Configuration for the counseling dialogue system."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICES: dict = _config.get("elevenlabs_voices", {})

# Load config from config.json at project root
_config_path = Path(__file__).parent.parent / "config.json"
with open(_config_path) as f:
    _config = json.load(f)

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
