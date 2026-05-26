"""Configuration for the counseling dialogue system."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Legacy Gemini API key. Local vLLM is used by the counseling engine now.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Load config from config.json at project root
_config_path = Path(__file__).parent.parent / "config.json"
with open(_config_path) as f:
    _config = json.load(f)

# Default model for counselor agents. Keep the old constant name so existing
# endpoint code and saved conversations remain compatible.
DEFAULT_GEMINI_MODEL = _config.get("default_llm_model", _config.get("default_gemini_model", "kokoro-chat"))

# Gemini API endpoint
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"

# Data directory for conversation storage
DATA_DIR = "data/conversations"
