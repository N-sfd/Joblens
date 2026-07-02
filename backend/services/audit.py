"""Lightweight audit logging for CRM/ATS actions.

Records who did what to which record. Deliberately stores only a short summary —
never resume text, OAuth tokens, or full email bodies (see security notes)."""

from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog


def log_audit(
    db: Session,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[object] = None,
    summary: Optional[str] = None,
    user_id: Optional[str] = None,
) -> None:
    """Append an audit entry. Best-effort: never let auditing break the request."""
    try:
        db.add(AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            summary=(summary or "")[:500] or None,
        ))
        db.commit()
    except Exception:
        db.rollback()
