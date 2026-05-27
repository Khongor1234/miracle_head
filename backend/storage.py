"""JSON-based storage for counseling conversations."""

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import DATA_DIR

APP_ROLES = {"client", "counselor"}
DIALOGUE_DIR = os.path.join(os.path.dirname(DATA_DIR), "dialogues")


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def ensure_dialogue_dir():
    """Ensure the simplified dialogue export directory exists."""
    Path(DIALOGUE_DIR).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str) -> str:
    """Get the file path for a conversation."""
    return os.path.join(DATA_DIR, f"{conversation_id}.json")


def get_dialogue_path(conversation_id: str) -> str:
    """Get the file path for the simplified dialogue JSON."""
    return os.path.join(DIALOGUE_DIR, f"{conversation_id}.json")


def clean_utterance(value: Any) -> str:
    """Keep dialogue exports focused on visible speech, even if an old reply stored raw JSON."""
    text = str(value or "")
    current = text.strip()
    for _ in range(3):
        try:
            parsed = json.loads(current)
        except (TypeError, json.JSONDecodeError):
            break
        if isinstance(parsed, str):
            current = parsed.strip()
            continue
        if isinstance(parsed, dict) and "reply" in parsed:
            return str(parsed.get("reply") or "").strip()
        break

    match = re.search(r'"reply"\s*:\s*"((?:\\.|[^"\\])*)"', text, re.DOTALL)
    if match:
        try:
            return json.loads(f'"{match.group(1)}"').strip()
        except json.JSONDecodeError:
            return match.group(1).strip()
    return text


def build_dialogue(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Convert app messages to the simple dataset-style dialogue format."""
    dialogue = []
    for message in messages:
        role = message.get("role")
        if role not in APP_ROLES:
            continue
        dialogue.append({
            "role": role,
            "time": message.get("created_at") or message.get("time") or "",
            "utterance": clean_utterance(message.get("content", message.get("utterance", ""))),
        })
    return dialogue


def save_dialogue(conversation: Dict[str, Any]):
    """Write a companion JSON containing only client/counselor dialogue."""
    ensure_dialogue_dir()
    path = get_dialogue_path(conversation["id"])
    with open(path, "w") as f:
        json.dump({"dialogue": conversation.get("dialogue", [])}, f, indent=2, ensure_ascii=False)


def create_conversation(conversation_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new counseling conversation."""
    ensure_data_dir()
    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "title": "New counseling session",
        "config": config,
        "messages": [],
        "dialogue": [],
        "agent_rounds": [],
        "status": "active",
    }
    save_conversation(conversation)
    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Load a conversation from storage."""
    path = get_conversation_path(conversation_id)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def save_conversation(conversation: Dict[str, Any]):
    """Save a conversation to storage."""
    ensure_data_dir()
    conversation["updated_at"] = datetime.utcnow().isoformat()
    conversation["dialogue"] = build_dialogue(conversation.get("messages", []))
    path = get_conversation_path(conversation["id"])
    with open(path, "w") as f:
        json.dump(conversation, f, indent=2, ensure_ascii=False)
    save_dialogue(conversation)


def list_conversations() -> List[Dict[str, Any]]:
    """List all counseling conversations (metadata only)."""
    ensure_data_dir()
    conversations = []
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(DATA_DIR, filename)
        with open(path, "r") as f:
            data = json.load(f)
        if "id" not in data:
            continue
        messages = data.get("messages", data.get("turns", data.get("dialogue", [])))
        conversations.append({
            "id": data["id"],
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at", data.get("created_at")),
            "title": data.get("title", "New counseling session"),
            "message_count": len(messages),
            "turn_count": len(messages),
            "status": data.get("status", "active"),
        })
    conversations.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return conversations


def add_message(conversation_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
    """Append a visible client/counselor message."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    conversation.setdefault("messages", []).append(message)
    if message["role"] == "client" and conversation.get("title") == "New counseling session":
        content = message["content"].strip().replace("\n", " ")
        conversation["title"] = content[:42] or "New counseling session"
    save_conversation(conversation)
    return message


def update_conversation_config(conversation_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update stored conversation config values."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    conversation.setdefault("config", {}).update(updates)
    save_conversation(conversation)
    return conversation


def add_agent_round(conversation_id: str, agent_round: Dict[str, Any]) -> Dict[str, Any]:
    """Append an internal five-agent review round."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    conversation.setdefault("agent_rounds", []).append(agent_round)
    save_conversation(conversation)
    return agent_round


def update_message(conversation_id: str, message: Dict[str, Any]):
    """Replace one visible message by id."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    messages = conversation.setdefault("messages", [])
    for index, current in enumerate(messages):
        if current.get("id") == message.get("id"):
            messages[index] = message
            save_conversation(conversation)
            return
    raise ValueError(f"Message {message.get('id')} not found")


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation file."""
    path = get_conversation_path(conversation_id)
    if not os.path.exists(path):
        return False
    os.remove(path)
    dialogue_path = get_dialogue_path(conversation_id)
    if os.path.exists(dialogue_path):
        os.remove(dialogue_path)
    return True
