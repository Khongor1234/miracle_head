"""Storage for counseling conversations.

Local JSON files by default; Supabase when SUPABASE_URL and SUPABASE_SECRET_KEY are set.
Every write builds a new conversation dict and hands it to the selected store.
"""

import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional

from .config import DATA_DIR, DIALOGUE_DIR, IS_VERCEL, SUPABASE_SECRET_KEY, SUPABASE_URL
from .file_store import FileStore
from .records import DEFAULT_TITLE, build_dialogue
from .supabase_store import SupabaseStore

CONVERSATION_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{1,64}")
MAX_TITLE_LENGTH = 42


@lru_cache(maxsize=1)
def get_store():
    if SUPABASE_URL and SUPABASE_SECRET_KEY:
        return SupabaseStore(SUPABASE_URL, SUPABASE_SECRET_KEY)
    if IS_VERCEL:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SECRET_KEY: Vercel functions have no persistent disk.")
    return FileStore(DATA_DIR, DIALOGUE_DIR)


def utc_now_iso() -> str:
    """With +00:00, so file-store and Supabase timestamps parse to the same instant in the browser."""
    return datetime.now(timezone.utc).isoformat()


def is_valid_conversation_id(conversation_id: str) -> bool:
    return bool(CONVERSATION_ID_PATTERN.fullmatch(conversation_id or ""))


def save_conversation(conversation: Dict[str, Any]) -> Dict[str, Any]:
    """Stamp, derive the visible dialogue, persist, and return the saved copy."""
    saved = {
        **conversation,
        "updated_at": utc_now_iso(),
        "dialogue": build_dialogue(conversation.get("messages", [])),
    }
    get_store().save(saved)
    return saved


def create_conversation(conversation_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    store = get_store()
    now = utc_now_iso()
    return save_conversation({
        "id": conversation_id,
        "created_at": now,
        "updated_at": now,
        "dialogue_file_number": store.next_dialogue_number(),
        "title": DEFAULT_TITLE,
        "config": config,
        "messages": [],
        "dialogue": [],
        "agent_rounds": [],
        "status": "active",
    })


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    if not is_valid_conversation_id(conversation_id):
        return None
    return get_store().load(conversation_id)


def _require_conversation(conversation_id: str) -> Dict[str, Any]:
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    return conversation


def list_conversations() -> List[Dict[str, Any]]:
    """List all counseling conversations (metadata only), newest first."""
    return get_store().list_summaries()


def add_message(conversation_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
    """Append a visible client/counselor message; the first client message names the session."""
    conversation = _require_conversation(conversation_id)
    title = conversation.get("title")
    if message["role"] == "client" and title == DEFAULT_TITLE:
        content = message["content"].strip().replace("\n", " ")
        title = content[:MAX_TITLE_LENGTH] or DEFAULT_TITLE
    save_conversation({
        **conversation,
        "title": title,
        "messages": [*conversation.get("messages", []), message],
    })
    return message


def update_conversation_config(conversation_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    conversation = _require_conversation(conversation_id)
    return save_conversation({**conversation, "config": {**conversation.get("config", {}), **updates}})


def add_agent_round(conversation_id: str, agent_round: Dict[str, Any]) -> Dict[str, Any]:
    """Append an internal five-agent review round."""
    conversation = _require_conversation(conversation_id)
    save_conversation({**conversation, "agent_rounds": [*conversation.get("agent_rounds", []), agent_round]})
    return agent_round


def update_message(conversation_id: str, message: Dict[str, Any]) -> None:
    """Replace one visible message by id."""
    conversation = _require_conversation(conversation_id)
    messages = conversation.get("messages", [])
    if not any(current.get("id") == message.get("id") for current in messages):
        raise ValueError(f"Message {message.get('id')} not found")
    save_conversation({
        **conversation,
        "messages": [message if current.get("id") == message.get("id") else current for current in messages],
    })


def delete_conversation(conversation_id: str) -> bool:
    if not is_valid_conversation_id(conversation_id):
        return False
    return get_store().delete(conversation_id)
