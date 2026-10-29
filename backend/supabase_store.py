"""Supabase (PostgREST) storage, used on Vercel where the disk does not persist.

Schema: supabase/migrations/20261030000000_conversations.sql
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

from .records import DEFAULT_TITLE, dialogue_file_number, message_count

logger = logging.getLogger(__name__)

TABLE_PATH = "/rest/v1/conversations"
NEXT_NUMBER_PATH = "/rest/v1/rpc/next_dialogue_file_number"
SUMMARY_COLUMNS = "id,title,status,message_count,created_at,updated_at"
REQUEST_TIMEOUT_SECONDS = 15.0
MAX_ERROR_BODY_CHARS = 300


class StorageError(RuntimeError):
    """A storage request failed; the message never contains the API key."""


class SupabaseStore:
    def __init__(self, url: str, secret_key: str, transport: Optional[httpx.BaseTransport] = None):
        headers = {"apikey": secret_key, "Content-Type": "application/json"}
        # New sb_secret_ keys must only travel in `apikey`; legacy service_role JWTs also need the bearer.
        if not secret_key.startswith("sb_"):
            headers["Authorization"] = f"Bearer {secret_key}"
        self._client = httpx.Client(
            base_url=url.rstrip("/"),
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
            transport=transport,
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            logger.error("Supabase %s %s failed: %s", method, path, exc)
            raise StorageError(f"Supabase {method} {path} failed: {type(exc).__name__}") from exc
        if response.is_error:
            body = response.text[:MAX_ERROR_BODY_CHARS]
            logger.error("Supabase %s %s returned %s: %s", method, path, response.status_code, body)
            raise StorageError(f"Supabase {method} {path} returned {response.status_code}: {body}")
        return response

    def load(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        rows = self._request("GET", TABLE_PATH, params={"select": "data", "id": f"eq.{conversation_id}"}).json()
        return rows[0]["data"] if rows else None

    def save(self, conversation: Dict[str, Any]) -> None:
        row = {
            "id": conversation["id"],
            "dialogue_file_number": dialogue_file_number(conversation),
            "title": conversation.get("title", DEFAULT_TITLE),
            "status": conversation.get("status", "active"),
            "message_count": message_count(conversation),
            "created_at": conversation.get("created_at"),
            "updated_at": conversation.get("updated_at"),
            "data": conversation,
        }
        self._request(
            "POST",
            TABLE_PATH,
            params={"on_conflict": "id"},
            json=row,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def list_summaries(self) -> List[Dict[str, Any]]:
        rows = self._request("GET", TABLE_PATH, params={"select": SUMMARY_COLUMNS, "order": "updated_at.desc"}).json()
        return [{**row, "turn_count": row["message_count"]} for row in rows]

    def delete(self, conversation_id: str) -> bool:
        deleted = self._request(
            "DELETE",
            TABLE_PATH,
            params={"id": f"eq.{conversation_id}", "select": "id"},
            headers={"Prefer": "return=representation"},
        ).json()
        return bool(deleted)

    def next_dialogue_number(self) -> int:
        return int(self._request("POST", NEXT_NUMBER_PATH, json={}).json())
