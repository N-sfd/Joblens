"""Extension-scoped auth tokens (Phase 5 M1 + M4 hardening).

Short-lived JWTs with typ=extension, iss, and aud. Refresh tokens stored as
SHA-256 hashes only. Not Clerk ATS credentials; not general JobLens cookie sessions.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from auth import ALGORITHM, Owner
from database import get_db
from models import ExtensionToken, ExtensionAuthChallenge
from services.extension_config import load_extension_config, version_allowed
from services import extension_audit as ext_audit

TOKEN_TYP = "extension"
# M1 used extension:diagnostics; M2 tokens use extension:assist (diagnostics + fill).
TOKEN_SCOPE_ASSIST = "extension:assist"
TOKEN_SCOPE_LEGACY = "extension:diagnostics"
ALLOWED_SCOPES = frozenset({TOKEN_SCOPE_ASSIST, TOKEN_SCOPE_LEGACY})

# Back-compat alias used by routers/tests
MIN_EXTENSION_VERSION = load_extension_config().min_extension_version


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cfg():
    return load_extension_config()


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _access_ttl_minutes() -> int:
    return max(1, _cfg().access_token_ttl_seconds // 60)


def _refresh_ttl_days() -> int:
    return max(1, _cfg().refresh_token_ttl_seconds // 86400)


def create_challenge(db: Session, challenge: str, extension_version: Optional[str] = None) -> ExtensionAuthChallenge:
    if extension_version or os_getenv_production():
        ok, reason = version_allowed(extension_version)
        if not ok:
            ext_audit.log_extension_event(
                db,
                "extension.version_rejected",
                extension_version=extension_version,
                outcome="rejected",
                error_code="version_unsupported",
                extra_summary=reason,
            )
            raise HTTPException(status_code=426, detail=reason)

    existing = db.query(ExtensionAuthChallenge).filter(ExtensionAuthChallenge.challenge == challenge).first()
    if existing:
        raise HTTPException(status_code=409, detail="Challenge already exists.")
    row = ExtensionAuthChallenge(
        challenge=challenge,
        status="pending",
        extension_version=extension_version,
        expires_at=_utcnow() + timedelta(minutes=10),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def confirm_challenge(db: Session, challenge: str, owner: Owner, extension_version: Optional[str] = None) -> ExtensionAuthChallenge:
    row = db.query(ExtensionAuthChallenge).filter(ExtensionAuthChallenge.challenge == challenge).first()
    if not row:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Challenge is no longer pending.")
    if row.expires_at < _utcnow():
        row.status = "expired"
        db.commit()
        raise HTTPException(status_code=410, detail="Challenge expired.")

    access, refresh, token_row = issue_token_pair(db, owner, extension_version or row.extension_version)
    row.status = "confirmed"
    row.user_id = owner.user_id
    row.guest_id = owner.guest_id
    row.confirmed_at = _utcnow()
    row.pending_access_token = access
    row.pending_refresh_token = refresh
    db.commit()
    db.refresh(row)
    ext_audit.log_extension_event(
        db,
        "extension.connected",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=token_row.jti,
        extension_version=extension_version or row.extension_version,
        outcome="ok",
    )
    return row


def exchange_challenge(db: Session, challenge: str) -> Optional[dict]:
    row = db.query(ExtensionAuthChallenge).filter(ExtensionAuthChallenge.challenge == challenge).first()
    if not row:
        return None
    if row.expires_at < _utcnow() and row.status == "pending":
        row.status = "expired"
        db.commit()
        return None
    if row.status != "confirmed" or not row.pending_access_token:
        return None
    access = row.pending_access_token
    refresh = row.pending_refresh_token
    row.pending_access_token = None
    row.pending_refresh_token = None
    row.status = "consumed"
    db.commit()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "expires_in": _access_ttl_minutes() * 60,
        "token_type": "Bearer",
    }


def issue_token_pair(
    db: Session,
    owner: Owner,
    extension_version: Optional[str] = None,
) -> tuple[str, str, ExtensionToken]:
    cfg = _cfg()
    jti = secrets.token_urlsafe(24)
    refresh = secrets.token_urlsafe(32)
    now = _utcnow()
    access_exp = now + timedelta(seconds=cfg.access_token_ttl_seconds)
    refresh_exp = now + timedelta(seconds=cfg.refresh_token_ttl_seconds)

    sub = f"user:{owner.user_id}" if owner.user_id is not None else f"guest:{owner.guest_id}"
    access = jwt.encode(
        {
            "typ": TOKEN_TYP,
            "sub": sub,
            "jti": jti,
            "scope": TOKEN_SCOPE_ASSIST,
            "iss": cfg.token_issuer,
            "aud": cfg.token_audience,
            "exp": int(access_exp.replace(tzinfo=timezone.utc).timestamp()),
        },
        cfg.jwt_secret,
        algorithm=ALGORITHM,
    )

    row = ExtensionToken(
        jti=jti,
        user_id=owner.user_id,
        guest_id=owner.guest_id,
        access_token_hash=hash_secret(access),
        refresh_token_hash=hash_secret(refresh),
        extension_version=extension_version,
        expires_at=access_exp,
        refresh_expires_at=refresh_exp,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return access, refresh, row


def refresh_token_pair(db: Session, refresh_token: str) -> dict:
    h = hash_secret(refresh_token)
    row = db.query(ExtensionToken).filter(ExtensionToken.refresh_token_hash == h).first()
    if not row or row.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Invalid or revoked refresh token.")
    if row.refresh_expires_at < _utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired.")

    owner = Owner(user_id=row.user_id, guest_id=row.guest_id)
    row.revoked_at = _utcnow()
    db.commit()
    access, refresh, new_row = issue_token_pair(db, owner, row.extension_version)
    ext_audit.log_extension_event(
        db,
        "extension.token_refreshed",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=new_row.jti,
        extension_version=row.extension_version,
        outcome="ok",
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "expires_in": _access_ttl_minutes() * 60,
        "token_type": "Bearer",
    }


def revoke_by_refresh(db: Session, refresh_token: Optional[str], access_jti: Optional[str] = None) -> int:
    count = 0
    owner_id = None
    if refresh_token:
        h = hash_secret(refresh_token)
        row = db.query(ExtensionToken).filter(ExtensionToken.refresh_token_hash == h).first()
        if row and row.revoked_at is None:
            row.revoked_at = _utcnow()
            owner_id = ext_audit.owner_audit_id(Owner(user_id=row.user_id, guest_id=row.guest_id))
            count += 1
    if access_jti:
        row = db.query(ExtensionToken).filter(ExtensionToken.jti == access_jti).first()
        if row and row.revoked_at is None:
            row.revoked_at = _utcnow()
            owner_id = owner_id or ext_audit.owner_audit_id(Owner(user_id=row.user_id, guest_id=row.guest_id))
            count += 1
    if count:
        db.commit()
        ext_audit.log_extension_event(
            db,
            "extension.token_revoked",
            user_id=owner_id,
            outcome="ok",
        )
    return count


def revoke_all_for_owner(db: Session, owner: Owner) -> int:
    q = db.query(ExtensionToken).filter(ExtensionToken.revoked_at.is_(None))
    if owner.user_id is not None:
        q = q.filter(ExtensionToken.user_id == owner.user_id)
    else:
        q = q.filter(ExtensionToken.guest_id == owner.guest_id, ExtensionToken.user_id.is_(None))
    rows = q.all()
    now = _utcnow()
    for r in rows:
        r.revoked_at = now
    db.commit()
    if rows:
        ext_audit.log_extension_event(
            db,
            "extension.disconnected",
            user_id=ext_audit.owner_audit_id(owner),
            outcome="ok",
            extra_summary=f"revoked={len(rows)}",
        )
    return len(rows)


def revoke_all_extension_tokens(db: Session) -> int:
    """Emergency: revoke every active extension token."""
    rows = db.query(ExtensionToken).filter(ExtensionToken.revoked_at.is_(None)).all()
    now = _utcnow()
    for r in rows:
        r.revoked_at = now
    db.commit()
    return len(rows)


def _check_extension_id_and_origin(request: Optional[Request], extension_id: Optional[str]) -> None:
    cfg = _cfg()
    if cfg.allowed_extension_ids:
        if not extension_id or extension_id not in cfg.allowed_extension_ids:
            raise HTTPException(status_code=403, detail="Unknown or disallowed extension ID.")
    if request is not None and cfg.allowed_origins:
        origin = request.headers.get("origin") or request.headers.get("referer") or ""
        # Extension pages may omit Origin; only enforce when present.
        if origin:
            ok = any(origin.startswith(allowed.rstrip("/")) for allowed in cfg.allowed_origins)
            if not ok:
                raise HTTPException(status_code=403, detail="Origin not allowed for extension API.")


def owner_from_extension_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_joblens_extension_version: Optional[str] = Header(None, alias="X-JobLens-Extension-Version"),
    x_joblens_extension_id: Optional[str] = Header(None, alias="X-JobLens-Extension-Id"),
    db: Session = Depends(get_db),
) -> Owner:
    cfg = _cfg()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Extension bearer token required.")
    token = authorization.split(" ", 1)[1].strip()

    ok, reason = version_allowed(x_joblens_extension_version, cfg)
    if x_joblens_extension_version:
        if not ok:
            ext_audit.log_extension_event(
                db,
                "extension.version_rejected",
                extension_version=x_joblens_extension_version,
                outcome="rejected",
                error_code="version_unsupported",
                extra_summary=reason,
            )
            raise HTTPException(status_code=426, detail=reason)
    elif os_getenv_production():
        raise HTTPException(
            status_code=426,
            detail=f"Update required: minimum supported extension version is {cfg.min_extension_version}.",
        )

    try:
        _check_extension_id_and_origin(request, x_joblens_extension_id)
    except HTTPException as exc:
        if exc.status_code == 403:
            ext_audit.log_extension_event(
                db,
                "extension.origin_rejected",
                extension_version=x_joblens_extension_version,
                outcome="rejected",
                error_code="origin_or_id",
            )
        raise

    try:
        payload = jwt.decode(
            token,
            cfg.jwt_secret,
            algorithms=[ALGORITHM],
            audience=cfg.token_audience,
            issuer=cfg.token_issuer,
            options={"require_aud": True, "require_iss": True},
        )
    except JWTError:
        # Tolerate legacy tokens issued before iss/aud (dev/migration window only).
        try:
            payload = jwt.decode(token, cfg.jwt_secret, algorithms=[ALGORITHM])
            if payload.get("iss") or payload.get("aud"):
                raise JWTError("iss/aud mismatch")
            if os_getenv_production():
                raise JWTError("legacy tokens rejected in production")
        except JWTError:
            ext_audit.log_extension_event(
                db,
                "extension.auth_failure",
                extension_version=x_joblens_extension_version,
                outcome="failure",
                error_code="invalid_token",
            )
            raise HTTPException(status_code=401, detail="Invalid or expired extension token.") from None

    if payload.get("typ") != TOKEN_TYP:
        raise HTTPException(status_code=401, detail="Not an extension token.")
    if payload.get("scope") not in ALLOWED_SCOPES:
        raise HTTPException(status_code=403, detail="Insufficient extension scope.")

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(status_code=401, detail="Malformed extension token.")

    row = db.query(ExtensionToken).filter(ExtensionToken.jti == jti).first()
    if not row or row.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Extension token revoked.")
    if row.access_token_hash != hash_secret(token):
        raise HTTPException(status_code=401, detail="Extension token mismatch.")

    row.last_used_at = _utcnow()
    db.commit()

    sub = str(payload.get("sub") or "")
    if sub.startswith("user:"):
        return Owner(user_id=int(sub.split(":", 1)[1]))
    if sub.startswith("guest:"):
        return Owner(guest_id=sub.split(":", 1)[1])
    raise HTTPException(status_code=401, detail="Malformed extension subject.")


def os_getenv_production() -> bool:
    import os

    return os.getenv("ENV", "development").strip().lower() == "production"


# Expose ACCESS_TOKEN_MINUTES for older tests/callers
ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 7
CHALLENGE_MINUTES = 10
