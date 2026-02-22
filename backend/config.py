"""Configuration for the LLM Council."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Load model config from config.json at project root
_config_path = Path(__file__).parent.parent / "config.json"
with open(_config_path) as f:
    _config = json.load(f)

# Council members - list of OpenRouter model identifiers
COUNCIL_MODELS = _config["council_models"]

# Chairman model - synthesizes final response
CHAIRMAN_MODEL = _config["chairman_model"]

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"
