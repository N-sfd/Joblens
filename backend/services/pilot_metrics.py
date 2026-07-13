"""Phase 5 M5 — non-sensitive pilot metrics aggregation.

Never includes field values, resume/cover text, document bytes, tokens, or HTML.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    AuditLog,
    ExtensionDiagnostic,
    ExtensionFillSession,
    ExtensionUploadSession,
    ExtensionToken,
    JobApplication,
)


def collect_pilot_metrics(db: Session, *, since_hours: Optional[int] = 168) -> dict[str, Any]:
    """Aggregate pilot signals for operators. Default window: 7 days."""
    cutoff = None
    if since_hours is not None and since_hours > 0:
        cutoff = datetime.utcnow() - timedelta(hours=since_hours)

    def _since(q, col):
        return q.filter(col >= cutoff) if cutoff is not None else q

    diagnostics = _since(db.query(ExtensionDiagnostic), ExtensionDiagnostic.created_at).all()
    fills = _since(db.query(ExtensionFillSession), ExtensionFillSession.created_at).all()
    uploads = _since(db.query(ExtensionUploadSession), ExtensionUploadSession.created_at).all()

    fill_status = Counter(f.status for f in fills)
    upload_status = Counter(u.status for u in uploads)

    audit_q = db.query(AuditLog).filter(AuditLog.entity_type == "extension")
    if cutoff is not None:
        audit_q = audit_q.filter(AuditLog.created_at >= cutoff)
    audit_rows = audit_q.all()
    audit_actions = Counter(a.action for a in audit_rows)

    feedback = [a for a in audit_rows if a.action == "extension.feedback_submitted"]
    feedback_categories = Counter()
    for a in feedback:
        summary = a.summary or ""
        for part in summary.split("|"):
            part = part.strip()
            if part.startswith("category="):
                feedback_categories[part.split("=", 1)[1].strip()] += 1

    applied = _since(
        db.query(JobApplication).filter(JobApplication.status == "Applied"),
        JobApplication.applied_at,
    ).count()

    active_tokens = (
        db.query(func.count(ExtensionToken.id))
        .filter(ExtensionToken.revoked_at.is_(None))
        .scalar()
        or 0
    )

    diag_with_support = sum(1 for d in diagnostics if (d.supported_count or 0) > 0)
    fill_success = fill_status.get("filled", 0) + fill_status.get("partially_filled", 0)
    fill_done = fill_success + fill_status.get("failed", 0)
    upload_ok = upload_status.get("uploaded", 0) + upload_status.get("verified", 0)
    upload_manual = upload_status.get("manual_required", 0)

    return {
        "window_hours": since_hours,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "diagnostics": {
            "total": len(diagnostics),
            "with_supported_fields": diag_with_support,
            "detection_rate": (diag_with_support / len(diagnostics)) if diagnostics else None,
            "avg_supported_count": (
                sum(d.supported_count or 0 for d in diagnostics) / len(diagnostics)
                if diagnostics
                else None
            ),
            "avg_sensitive_count": (
                sum(d.sensitive_count or 0 for d in diagnostics) / len(diagnostics)
                if diagnostics
                else None
            ),
        },
        "fill_sessions": {
            "total": len(fills),
            "by_status": dict(fill_status),
            "success_or_partial": fill_success,
            "failed": fill_status.get("failed", 0),
            "completion_rate": (fill_success / fill_done) if fill_done else None,
        },
        "upload_sessions": {
            "total": len(uploads),
            "by_status": dict(upload_status),
            "uploaded_or_verified": upload_ok,
            "manual_required": upload_manual,
            "token_reused_signals": audit_actions.get("extension.document_access_denied", 0),
        },
        "submission_confirmations": {
            "audit_events": audit_actions.get("extension.submission_confirmed", 0),
            "applied_in_window": applied,
        },
        "auth_security": {
            "auth_failures": audit_actions.get("extension.auth_failure", 0),
            "version_rejected": audit_actions.get("extension.version_rejected", 0),
            "origin_rejected": audit_actions.get("extension.origin_rejected", 0),
            "active_extension_tokens": int(active_tokens),
            "token_revoked_events": audit_actions.get("extension.token_revoked", 0),
        },
        "feedback": {
            "total": len(feedback),
            "by_category": dict(feedback_categories),
            "privacy_concerns": feedback_categories.get("privacy_concern", 0),
        },
        "notes": [
            "Metrics exclude field values, document contents, tokens, and page HTML.",
            "Manual scoring (mapping accuracy 1–5, undo reliability) remains tester-reported.",
        ],
    }
