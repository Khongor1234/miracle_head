"""JSON-based storage for debates."""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from .config import DATA_DIR


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_debate_path(debate_id: str) -> str:
    """Get the file path for a debate."""
    return os.path.join(DATA_DIR, f"{debate_id}.json")


# Keep alias for compatibility
get_conversation_path = get_debate_path


def create_debate(debate_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a new debate with the given config.

    Args:
        debate_id: Unique identifier for the debate
        config: Debate configuration (models, topic, povs, max_turns, etc.)

    Returns:
        New debate dict
    """
    ensure_data_dir()

    debate = {
        "id": debate_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": "New Debate",
        "config": config,
        "turns": [],
        "status": "pending",
    }

    path = get_debate_path(debate_id)
    with open(path, "w") as f:
        json.dump(debate, f, indent=2)

    return debate


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Load a debate from storage."""
    path = get_debate_path(conversation_id)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def save_debate(debate: Dict[str, Any]):
    """Save a debate to storage."""
    ensure_data_dir()
    path = get_debate_path(debate["id"])
    with open(path, "w") as f:
        json.dump(debate, f, indent=2)


def add_debate_turn(debate_id: str, turn: Dict[str, Any]):
    """
    Append a turn to the debate.

    Args:
        debate_id: Debate identifier
        turn: Turn dict with speaker, model, speaker_name, content, turn_number
    """
    debate = get_conversation(debate_id)
    if debate is None:
        raise ValueError(f"Debate {debate_id} not found")
    debate["turns"].append(turn)
    save_debate(debate)


def update_debate_status(debate_id: str, status: str):
    """Update the status of a debate ('pending', 'in_progress', 'completed', 'error')."""
    debate = get_conversation(debate_id)
    if debate is None:
        raise ValueError(f"Debate {debate_id} not found")
    debate["status"] = status
    save_debate(debate)


def list_conversations() -> List[Dict[str, Any]]:
    """
    List all debates (metadata only).

    Returns:
        List of debate metadata dicts
    """
    ensure_data_dir()

    debates = []
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".json"):
            path = os.path.join(DATA_DIR, filename)
            with open(path, "r") as f:
                data = json.load(f)
            debates.append({
                "id": data["id"],
                "created_at": data["created_at"],
                "title": data.get("title", "New Debate"),
                "turn_count": len(data.get("turns", [])),
                "status": data.get("status", "pending"),
            })

    debates.sort(key=lambda x: x["created_at"], reverse=True)
    return debates


def update_conversation_title(conversation_id: str, title: str):
    """Update the title of a debate."""
    debate = get_conversation(conversation_id)
    if debate is None:
        raise ValueError(f"Debate {conversation_id} not found")
    debate["title"] = title
    save_debate(debate)


def save_judge_result(debate_id: str, judge_result: Dict[str, Any]):
    """Persist a judge report card onto a debate."""
    debate = get_conversation(debate_id)
    if debate is None:
        raise ValueError(f"Debate {debate_id} not found")
    debate["judge_result"] = judge_result
    save_debate(debate)
