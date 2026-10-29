"""Local JSON-file storage, the default for development on one machine."""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from .records import dialogue_file_number, summarize


class FileStore:
    def __init__(self, data_dir: str, dialogue_dir: str):
        self.data_dir = data_dir
        self.dialogue_dir = dialogue_dir

    def _conversation_path(self, conversation_id: str) -> str:
        return os.path.join(self.data_dir, f"{conversation_id}.json")

    def _dialogue_paths(self, conversation: Optional[Dict[str, Any]], conversation_id: str) -> List[str]:
        number = dialogue_file_number(conversation) if conversation else None
        names = [f"{number}.json"] if number else []
        return [os.path.join(self.dialogue_dir, name) for name in [*names, f"{conversation_id}.json"]]

    def _read_all(self) -> List[Dict[str, Any]]:
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        conversations = []
        for filename in os.listdir(self.data_dir):
            if not filename.endswith(".json"):
                continue
            try:
                with open(os.path.join(self.data_dir, filename), "r") as f:
                    conversations.append(json.load(f))
            except (OSError, json.JSONDecodeError):
                continue
        return conversations

    def load(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        path = self._conversation_path(conversation_id)
        if not os.path.exists(path):
            return None
        with open(path, "r") as f:
            return json.load(f)

    def save(self, conversation: Dict[str, Any]) -> None:
        """Write the full session JSON plus a companion file with only the visible dialogue."""
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        Path(self.dialogue_dir).mkdir(parents=True, exist_ok=True)
        with open(self._conversation_path(conversation["id"]), "w") as f:
            json.dump(conversation, f, indent=2, ensure_ascii=False)
        dialogue_path = self._dialogue_paths(conversation, conversation["id"])[0]
        with open(dialogue_path, "w") as f:
            json.dump({"dialogue": conversation.get("dialogue", [])}, f, indent=2, ensure_ascii=False)

    def list_summaries(self) -> List[Dict[str, Any]]:
        summaries = [summarize(data) for data in self._read_all() if "id" in data]
        return sorted(summaries, key=lambda item: item.get("updated_at") or "", reverse=True)

    def delete(self, conversation_id: str) -> bool:
        conversation = self.load(conversation_id)
        if conversation is None:
            return False
        os.remove(self._conversation_path(conversation_id))
        for path in self._dialogue_paths(conversation, conversation_id):
            if os.path.exists(path):
                os.remove(path)
        return True

    def next_dialogue_number(self) -> int:
        """Next numeric filename for dialogue exports, past any file or session already using one."""
        Path(self.dialogue_dir).mkdir(parents=True, exist_ok=True)
        numbers = [
            int(match.group(1))
            for match in (re.fullmatch(r"(\d+)\.json", name) for name in os.listdir(self.dialogue_dir))
            if match
        ]
        numbers += [number for number in map(dialogue_file_number, self._read_all()) if number]
        return max(numbers, default=0) + 1
