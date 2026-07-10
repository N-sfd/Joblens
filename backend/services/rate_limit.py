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
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded for {bucket}. Try again in a minute.",
            )
        q.append(now)


def rate_limit_ai(request: Request, user_id: str | None = None) -> None:
    check_rate_limit(request, bucket="ai", limit=AI_RATE_LIMIT, user_id=user_id)


def rate_limit_zoho(request: Request, user_id: str | None = None) -> None:
    check_rate_limit(request, bucket="zoho", limit=ZOHO_RATE_LIMIT, user_id=user_id)
