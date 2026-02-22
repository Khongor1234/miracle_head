"""Configuration for the LLM Debate system."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Load config from config.json at project root
_config_path = Path(__file__).parent.parent / "config.json"
with open(_config_path) as f:
    _config = json.load(f)

# Model used to generate POVs and debate titles
POV_GENERATOR_MODEL = _config.get("pov_generator_model", "anthropic/claude-sonnet-4-5")

# Default number of debate turns
DEFAULT_MAX_TURNS = _config.get("default_max_turns", 10)

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for debate storage
DATA_DIR = "data/conversations"
