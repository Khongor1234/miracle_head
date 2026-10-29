"""Anonymous visitor id: each browser keeps a random id and only sees its own conversations."""

import re
from typing import Optional

from fastapi import Header, HTTPException

VISITOR_ID_PATTERN = re.compile(r"[A-Za-z0-9-]{16,64}")


def require_visitor_id(x_visitor_id: Optional[str] = Header(default=None)) -> str:
    if not x_visitor_id or not VISITOR_ID_PATTERN.fullmatch(x_visitor_id):
        raise HTTPException(status_code=400, detail="X-Visitor-Id header is missing or malformed.")
    return x_visitor_id
