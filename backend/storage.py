"""JSON-based storage for counseling conversations."""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import DATA_DIR


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str) -> str:
    """Get the file path for a conversation."""
    return os.path.join(DATA_DIR, f"{conversation_id}.json")


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
    path = get_conversation_path(conversation["id"])
    with open(path, "w") as f:
        json.dump(conversation, f, indent=2, ensure_ascii=False)


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
        messages = data.get("messages", data.get("turns", []))
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
    return True
