"""Uniform, safe error handling for AI (Groq) call sites.

Never forwards raw provider exception text to the client — that can leak
config hints, request internals, or (in edge cases) fragments of the request
itself. Structured fields (status code, request id, error code) are logged
server-side only; the API key itself is never part of what we log here.
"""

from __future__ import annotations

import logging
from typing import NoReturn

from fastapi import HTTPException
from openai import APIStatusError


def log_ai_error(logger: logging.Logger, action: str, exc: Exception) -> None:
    """Log-only variant for call sites that degrade gracefully per-item (e.g. a
    batch loop) rather than aborting the whole request."""
    status_code = getattr(exc, "status_code", None)
    request_id = getattr(exc, "request_id", None)
    error_code = getattr(exc, "code", None) or type(exc).__name__
    logger.error(
        "AI request failed action=%r provider_status=%s request_id=%s error_code=%s",
        action, status_code, request_id, error_code,
    )


def raise_clean_ai_error(logger: logging.Logger, action: str, exc: Exception) -> NoReturn:
    """Log a structured, key-free record of `exc` and raise a safe HTTPException.

    `action` is a short human description of what failed, e.g. "Resume
    parsing" — used only in the log line and the generic user-facing message.
    """
    status_code = getattr(exc, "status_code", None)
    request_id = getattr(exc, "request_id", None)
    error_code = getattr(exc, "code", None) or type(exc).__name__

    logger.error(
        "AI request failed action=%r provider_status=%s request_id=%s error_code=%s",
        action, status_code, request_id, error_code,
    )

    if isinstance(exc, APIStatusError) and status_code == 401:
        # Misconfigured/invalid GROQ_API_KEY on the server — not a client-side
        # permission problem, so this must never render as a 403.
        raise HTTPException(status_code=500, detail="AI service is not configured correctly. Please try again later.")
    if isinstance(exc, APIStatusError) and status_code == 429:
        raise HTTPException(status_code=429, detail="The AI service is busy right now. Please try again in a minute.")
    raise HTTPException(status_code=500, detail=f"{action} could not be completed. Please try again.")
