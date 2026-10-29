"""Pure helpers for conversation records, shared by every storage backend."""

import json
import re
from typing import Any, Dict, List, Optional

DEFAULT_TITLE = "New counseling session"
APP_ROLES = {"client", "counselor"}


def dialogue_file_number(conversation: Dict[str, Any]) -> Optional[int]:
    value = conversation.get("dialogue_file_number")
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


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
    return [
        {
            "role": message.get("role"),
            "time": message.get("created_at") or message.get("time") or "",
            "utterance": clean_utterance(message.get("content", message.get("utterance", ""))),
        }
        for message in messages
        if message.get("role") in APP_ROLES
    ]


def message_count(conversation: Dict[str, Any]) -> int:
    messages = conversation.get("messages", conversation.get("turns", conversation.get("dialogue", [])))
    return len(messages)


def summarize(conversation: Dict[str, Any]) -> Dict[str, Any]:
    """Metadata shown in the sidebar list."""
    count = message_count(conversation)
    return {
        "id": conversation["id"],
        "created_at": conversation.get("created_at"),
        "updated_at": conversation.get("updated_at", conversation.get("created_at")),
        "title": conversation.get("title", DEFAULT_TITLE),
        "message_count": count,
        "turn_count": count,
        "status": conversation.get("status", "active"),
    }
