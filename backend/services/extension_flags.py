"""Phase 5 M4 — extension feature flags and pilot entitlements.

Defaults favor a controlled internal pilot. `automatic_submission_enabled` is
intentionally absent and must never be added.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from auth import Owner


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _csv_set(name: str) -> set[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return set()
    return {p.strip() for p in raw.split(",") if p.strip()}


@dataclass(frozen=True)
class ExtensionFlags:
    extension_enabled: bool
    diagnostics_enabled: bool
    assisted_fill_enabled: bool
    document_upload_enabled: bool
    submission_confirmation_enabled: bool
    greenhouse_enabled: bool
    # Never enable automatic submission — kept only to assert False in APIs/tests.
    automatic_submission_enabled: bool = False


def load_flags() -> ExtensionFlags:
    env = os.getenv("ENV", "development").strip().lower()
    # Production pilot defaults: diagnostics + confirmation on; fill/upload gated by pilot list.
    if env == "production":
        return ExtensionFlags(
            extension_enabled=_env_bool("EXTENSION_ENABLED", True),
            diagnostics_enabled=_env_bool("EXTENSION_DIAGNOSTICS_ENABLED", True),
            assisted_fill_enabled=_env_bool("EXTENSION_ASSISTED_FILL_ENABLED", False),
            document_upload_enabled=_env_bool("EXTENSION_DOCUMENT_UPLOAD_ENABLED", False),
            submission_confirmation_enabled=_env_bool("EXTENSION_SUBMISSION_CONFIRMATION_ENABLED", True),
            greenhouse_enabled=_env_bool("EXTENSION_GREENHOUSE_ENABLED", True),
            automatic_submission_enabled=False,
        )
    # Development: full local assist except automatic submit.
    return ExtensionFlags(
        extension_enabled=_env_bool("EXTENSION_ENABLED", True),
        diagnostics_enabled=_env_bool("EXTENSION_DIAGNOSTICS_ENABLED", True),
        assisted_fill_enabled=_env_bool("EXTENSION_ASSISTED_FILL_ENABLED", True),
        document_upload_enabled=_env_bool("EXTENSION_DOCUMENT_UPLOAD_ENABLED", True),
        submission_confirmation_enabled=_env_bool("EXTENSION_SUBMISSION_CONFIRMATION_ENABLED", True),
        greenhouse_enabled=_env_bool("EXTENSION_GREENHOUSE_ENABLED", True),
        automatic_submission_enabled=False,
    )


def is_pilot_user(owner: Owner) -> bool:
    """Pilot allowlist: comma-separated user IDs and/or guest IDs."""
    allow_users = _csv_set("EXTENSION_PILOT_USER_IDS")
    allow_guests = _csv_set("EXTENSION_PILOT_GUEST_IDS")
    if not allow_users and not allow_guests:
        # Empty allowlist in non-production → treat everyone as pilot (local dev).
        if os.getenv("ENV", "development").strip().lower() != "production":
            return True
        return False
    if owner.user_id is not None and str(owner.user_id) in allow_users:
        return True
    if owner.guest_id and owner.guest_id in allow_guests:
        return True
    return False


def effective_capabilities(owner: Optional[Owner] = None) -> dict:
    flags = load_flags()
    pilot = is_pilot_user(owner) if owner is not None else False
    fill = flags.assisted_fill_enabled and (pilot or os.getenv("ENV", "development") != "production")
    upload = flags.document_upload_enabled and (pilot or os.getenv("ENV", "development") != "production")
    # In production, fill/upload require both flag AND pilot entitlement.
    if os.getenv("ENV", "development").strip().lower() == "production":
        fill = flags.assisted_fill_enabled and pilot
        upload = flags.document_upload_enabled and pilot
    return {
        "extension_enabled": flags.extension_enabled,
        "analyze_form": flags.extension_enabled and flags.greenhouse_enabled,
        "save_diagnostic": flags.extension_enabled and flags.diagnostics_enabled,
        "fill_form": flags.extension_enabled and fill,
        "fill_uploads": flags.extension_enabled and upload,
        "upload_resume": flags.extension_enabled and upload,
        "submit_application": False,
        "record_submission_confirmation": (
            flags.extension_enabled and flags.submission_confirmation_enabled
        ),
        "greenhouse_enabled": flags.greenhouse_enabled,
        "pilot_user": pilot,
        "automatic_submission_enabled": False,
    }


def require_capability(caps: dict, key: str, detail: str | None = None) -> None:
    from fastapi import HTTPException

    if not caps.get("extension_enabled", False):
        raise HTTPException(status_code=503, detail="Extension assistance is temporarily disabled.")
    if not caps.get(key, False):
        raise HTTPException(
            status_code=403,
            detail=detail or f"Capability '{key}' is not available for this account.",
        )
