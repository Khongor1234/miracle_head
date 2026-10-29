"""Shared-password guard: every API request must carry X-App-Password."""

import hmac
from typing import Optional

from fastapi import Header, HTTPException

from . import config


def require_app_password(x_app_password: Optional[str] = Header(default=None)) -> None:
    expected = config.APP_PASSWORD
    if not expected:
        if config.IS_VERCEL and not config.PUBLIC_ACCESS:
            raise HTTPException(status_code=503, detail="APP_PASSWORD is not configured on the server.")
        return  # local development, or a public demo with PUBLIC_ACCESS=true
    if not x_app_password or not hmac.compare_digest(x_app_password.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Password required.")
