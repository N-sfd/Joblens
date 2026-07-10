"""Minimal HTML sanitization for email bodies shown in the ATS UI.

Strips scripts/events and dangerous tags. Not a full HTML sanitizer — prefer
plain text when available.
"""

from __future__ import annotations

import re

_TAG_RE = re.compile(r"<(script|style|iframe|object|embed|link|meta)[^>]*>.*?</\1>", re.I | re.S)
_SELF_CLOSE_RE = re.compile(r"<(script|style|iframe|object|embed|link|meta)[^>]*/?>", re.I)
_EVENT_RE = re.compile(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_JS_URL_RE = re.compile(r"(href|src)\s*=\s*[\"']?\s*javascript:", re.I)


def sanitize_email_html(html: str | None) -> str | None:
    if not html:
        return html
    cleaned = _TAG_RE.sub("", html)
    cleaned = _SELF_CLOSE_RE.sub("", cleaned)
    cleaned = _EVENT_RE.sub("", cleaned)
    cleaned = _JS_URL_RE.sub(r"\1=\"#\" data-blocked=", cleaned)
    return cleaned
