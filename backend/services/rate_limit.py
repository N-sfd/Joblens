"""Simple in-memory rate limiting for expensive AI / Zoho endpoints.

Per-process sliding window. Sufficient for single-instance Render deploys;
swap for Redis if you scale horizontally.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _limit(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


# Defaults tuned for recruiter workflows without hammering Groq/Zoho.
AI_RATE_LIMIT = _limit("AI_RATE_LIMIT_PER_MINUTE", 20)
ZOHO_RATE_LIMIT = _limit("ZOHO_RATE_LIMIT_PER_MINUTE", 30)
WINDOW_SECONDS = 60.0

# Extension API limits (per user/IP per minute). Stronger on token/document paths.
EXT_AUTH_CHALLENGE_LIMIT = _limit("EXT_AUTH_CHALLENGE_PER_MINUTE", 10)
EXT_TOKEN_EXCHANGE_LIMIT = _limit("EXT_TOKEN_EXCHANGE_PER_MINUTE", 8)
EXT_TOKEN_REFRESH_LIMIT = _limit("EXT_TOKEN_REFRESH_PER_MINUTE", 20)
EXT_DIAGNOSTICS_LIMIT = _limit("EXT_DIAGNOSTICS_PER_MINUTE", 30)
EXT_FILL_SESSION_LIMIT = _limit("EXT_FILL_SESSION_PER_MINUTE", 20)
EXT_MAPPING_LIMIT = _limit("EXT_MAPPING_PER_MINUTE", 40)
EXT_UPLOAD_SESSION_LIMIT = _limit("EXT_UPLOAD_SESSION_PER_MINUTE", 15)
EXT_DOCUMENT_RETRIEVE_LIMIT = _limit("EXT_DOCUMENT_RETRIEVE_PER_MINUTE", 10)
EXT_SUBMISSION_CONFIRM_LIMIT = _limit("EXT_SUBMISSION_CONFIRM_PER_MINUTE", 10)
EXT_FEEDBACK_LIMIT = _limit("EXT_FEEDBACK_PER_MINUTE", 8)
EXT_INVALID_TOKEN_LIMIT = _limit("EXT_INVALID_TOKEN_PER_MINUTE", 5)


def _client_key(request: Request, user_id: str | None = None) -> str:
    if user_id:
        return f"user:{user_id}"
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return f"ip:{forwarded or (request.client.host if request.client else 'unknown')}"


def check_rate_limit(
    request: Request,
    *,
    bucket: str,
    limit: int,
    user_id: str | None = None,
) -> None:
    """Raise 429 if the caller exceeds `limit` hits in the last minute for `bucket`."""
    key = f"{bucket}:{_client_key(request, user_id)}"
    now = time.monotonic()
    cutoff = now - WINDOW_SECONDS
    with _lock:
        q = _hits[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            message = (
                "The AI parsing limit has been reached. Please try again in a minute."
                if bucket == "ai"
                else f"Rate limit exceeded for {bucket}. Try again in a minute."
            )
            raise HTTPException(status_code=429, detail=message)
        q.append(now)


def rate_limit_ai(request: Request, user_id: str | None = None) -> None:
    check_rate_limit(request, bucket="ai", limit=AI_RATE_LIMIT, user_id=user_id)


def rate_limit_zoho(request: Request, user_id: str | None = None) -> None:
    check_rate_limit(request, bucket="zoho", limit=ZOHO_RATE_LIMIT, user_id=user_id)


def rate_limit_extension(
    request: Request,
    *,
    bucket: str,
    limit: int,
    user_id: str | None = None,
) -> None:
    """Raise 429 with a clear extension-oriented message."""
    key = f"ext:{bucket}:{_client_key(request, user_id)}"
    now = time.monotonic()
    cutoff = now - WINDOW_SECONDS
    with _lock:
        q = _hits[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded for extension {bucket}. Try again in a minute.",
            )
        q.append(now)


def rate_limit_ext_auth_challenge(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="auth_challenge", limit=EXT_AUTH_CHALLENGE_LIMIT, user_id=user_id)


def rate_limit_ext_token_exchange(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="token_exchange", limit=EXT_TOKEN_EXCHANGE_LIMIT, user_id=user_id)


def rate_limit_ext_token_refresh(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="token_refresh", limit=EXT_TOKEN_REFRESH_LIMIT, user_id=user_id)


def rate_limit_ext_diagnostics(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="diagnostics", limit=EXT_DIAGNOSTICS_LIMIT, user_id=user_id)


def rate_limit_ext_fill(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="fill_session", limit=EXT_FILL_SESSION_LIMIT, user_id=user_id)


def rate_limit_ext_mapping(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="mapping", limit=EXT_MAPPING_LIMIT, user_id=user_id)


def rate_limit_ext_upload(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="upload_session", limit=EXT_UPLOAD_SESSION_LIMIT, user_id=user_id)


def rate_limit_ext_document_retrieve(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(
        request, bucket="document_retrieve", limit=EXT_DOCUMENT_RETRIEVE_LIMIT, user_id=user_id
    )


def rate_limit_ext_submission(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(
        request, bucket="submission_confirm", limit=EXT_SUBMISSION_CONFIRM_LIMIT, user_id=user_id
    )


def rate_limit_ext_feedback(request: Request, user_id: str | None = None) -> None:
    rate_limit_extension(request, bucket="feedback", limit=EXT_FEEDBACK_LIMIT, user_id=user_id)
