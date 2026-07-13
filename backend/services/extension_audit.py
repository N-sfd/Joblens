"""Structured extension security/ops audit events (Phase 5 M4).

Never log field values, resume/cover text, document bytes, tokens, cookies,
CAPTCHA data, or employer credentials.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog

logger = logging.getLogger("joblens.extension.audit")

# Allowed event types for extension security/ops monitoring.
EXTENSION_EVENTS = frozenset({
    "extension.connected",
    "extension.disconnected",
    "extension.token_refreshed",
    "extension.token_revoked",
    "extension.form_analyzed",
    "extension.fill_session_started",
    "extension.fill_approved",
    "extension.fill_completed",
    "extension.fill_partial",
    "extension.document_selected",
    "extension.document_token_issued",
    "extension.document_uploaded",
    "extension.manual_upload_required",
    "extension.submission_confirmed",
    "extension.version_rejected",
    "extension.auth_failure",
    "extension.rate_limited",
    "extension.feature_blocked",
    "extension.feedback_submitted",
    "extension.origin_rejected",
    "extension.document_access_denied",
})


def log_extension_event(
    db: Optional[Session],
    event_type: str,
    *,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    platform: Optional[str] = None,
    extension_version: Optional[str] = None,
    outcome: str = "ok",
    error_code: Optional[str] = None,
    extra_summary: Optional[str] = None,
) -> None:
    if event_type not in EXTENSION_EVENTS:
        event_type = "extension.feedback_submitted" if "feedback" in event_type else event_type

    parts = [
        f"event={event_type}",
        f"outcome={outcome}",
    ]
    if session_id:
        parts.append(f"session={session_id}")
    if platform:
        parts.append(f"platform={platform}")
    if extension_version:
        parts.append(f"ext={extension_version}")
    if error_code:
        parts.append(f"code={error_code}")
    if extra_summary:
        # Strip anything that looks like a secret/value payload.
        safe = extra_summary.replace("\n", " ")[:200]
        for banned in ("Bearer ", "token=", "password=", "cookie="):
            if banned.lower() in safe.lower():
                safe = "[redacted]"
                break
        parts.append(safe)

    summary = " | ".join(parts)[:500]
    logger.info(summary)

    if db is None:
        return
    try:
        db.add(
            AuditLog(
                user_id=user_id,
                action=event_type,
                entity_type="extension",
                entity_id=session_id,
                summary=summary,
            )
        )
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception("Failed to persist extension audit event %s", event_type)


def owner_audit_id(owner) -> Optional[str]:
    if owner is None:
        return None
    if getattr(owner, "user_id", None) is not None:
        return f"user:{owner.user_id}"
    if getattr(owner, "guest_id", None):
        return f"guest:{owner.guest_id}"
    return None
