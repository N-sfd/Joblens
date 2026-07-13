"""Clerk JWT verification for the private CRM/ATS API.

Every private ATS endpoint depends on `get_current_ats_user`. In production
(ATS_AUTH_ENFORCE=true) this verifies the Clerk session JWT sent by the frontend
as `Authorization: Bearer <token>` against Clerk's JWKS, rejecting anything
unverified with 401. Frontend route protection (middleware.ts) is NOT trusted on
its own — the backend independently verifies every request.

Role resolution order (never trust a browser-supplied role header):
  1. Verified JWT claims (public_metadata.role / role / metadata)
  2. Clerk Backend API public_metadata (when reachable)
  3. Local `ats_staff_users` row for clerk_user_id
  4. Bootstrap allowlist (ATS_BOOTSTRAP_ADMIN_EMAILS / _USER_IDS) → admin
  5. Default viewer when enforced, else admin for local anonymous CRUD
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, Request
from jose import jwt

from database import SessionLocal

logger = logging.getLogger("joblens.ats.auth")

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "").strip()
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").strip()
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "").strip()
_enforce_env = os.getenv("ATS_AUTH_ENFORCE", "").strip().lower()
if _enforce_env in ("true", "1", "yes"):
    ENFORCE = True
elif _enforce_env in ("false", "0", "no"):
    ENFORCE = False
else:
    ENFORCE = False

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}
_role_cache: dict[str, tuple[str, float]] = {}
_ROLE_CACHE_TTL = 300.0

ATS_ROLES = ("admin", "recruiter", "viewer")
WRITE_ROLES = ("admin", "recruiter")
ADMIN_ROLES = ("admin",)

FORBIDDEN_MSG = (
    "Your account does not have ATS access. Ask an administrator to assign the Recruiter or Admin role."
)
UNAUTHORIZED_MSG = "Your session has expired. Please sign in again."
AUTH_VERIFY_FAIL_MSG = "We could not verify your ATS permissions. Please try again."


def _csv_set(name: str) -> set[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return set()
    return {p.strip().lower() for p in raw.split(",") if p.strip()}


def normalize_ats_role(raw: Optional[str], *, default: str = "viewer") -> str:
    return _normalize_role(raw, default=default)


def _normalize_role(raw: Optional[str], *, default: str = "viewer") -> str:
    """Missing/unknown roles fall back to viewer (least privilege) when enforced."""
    if not raw or not str(raw).strip():
        return default if default in ATS_ROLES else "viewer"
    role = str(raw).strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "administrator": "admin",
        "admins": "admin",
        "hr_admin": "admin",
        "staff_admin": "admin",
        "recruiters": "recruiter",
        "recruiting": "recruiter",
        "talent": "recruiter",
        "view": "viewer",
        "readonly": "viewer",
        "read_only": "viewer",
        "none": "viewer",
        "user": "viewer",
        "member": "viewer",
    }
    role = aliases.get(role, role)
    return role if role in ATS_ROLES else "viewer"


def _email_from_claims(claims: dict) -> Optional[str]:
    for key in ("email", "primary_email_address", "email_address"):
        val = claims.get(key)
        if isinstance(val, str) and "@" in val:
            return val.strip().lower()
    emails = claims.get("email_addresses")
    if isinstance(emails, list) and emails:
        first = emails[0]
        if isinstance(first, str) and "@" in first:
            return first.strip().lower()
        if isinstance(first, dict):
            e = first.get("email_address") or first.get("email")
            if isinstance(e, str) and "@" in e:
                return e.strip().lower()
    return None


def _name_from_claims(claims: dict) -> Optional[str]:
    for key in ("name", "full_name"):
        val = claims.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:255]
    first = claims.get("first_name") or ""
    last = claims.get("last_name") or ""
    combined = f"{first} {last}".strip()
    return combined[:255] if combined else None


def _role_from_claims(claims: dict) -> Optional[str]:
    for key in ("public_metadata", "metadata", "prm", "user_public_metadata"):
        md = claims.get(key)
        if isinstance(md, str):
            try:
                md = json.loads(md)
            except Exception:
                md = None
        if isinstance(md, dict) and md.get("role"):
            return str(md["role"])
    raw = claims.get("role") or claims.get("org_role") or claims.get("ats_role")
    return str(raw) if raw else None


def _fetch_role_from_clerk_api(user_id: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (role, email, display_name) from Clerk Backend API."""
    if not CLERK_SECRET_KEY or not user_id:
        return None, None, None
    cached = _role_cache.get(user_id)
    now = time.time()
    if cached and now - cached[1] < _ROLE_CACHE_TTL:
        # Cache stores role only; email/name refreshed below when miss
        pass
    try:
        req = urllib.request.Request(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={
                "Authorization": f"Bearer {CLERK_SECRET_KEY}",
                "User-Agent": "JobLens-ATS/1.0",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
        md = data.get("public_metadata") or {}
        role_raw = md.get("role") if isinstance(md, dict) else None
        role = _normalize_role(role_raw) if isinstance(role_raw, str) and role_raw.strip() else None
        if role:
            _role_cache[user_id] = (role, now)
        emails = [e.get("email_address", "") for e in (data.get("email_addresses") or []) if e.get("email_address")]
        email = (emails[0] if emails else None) or None
        name = " ".join(p for p in [data.get("first_name"), data.get("last_name")] if p).strip() or None
        return role, (email.lower() if email else None), name
    except urllib.error.HTTPError as e:
        logger.warning(
            "ats_auth clerk_api_role_fetch_failed user_id=%s status=%s",
            user_id,
            e.code,
        )
        return None, None, None
    except Exception:
        logger.warning("ats_auth clerk_api_role_fetch_error user_id=%s", user_id, exc_info=False)
        return None, None, None


def invalidate_role_cache(user_id: Optional[str] = None) -> None:
    if user_id:
        _role_cache.pop(user_id, None)
    else:
        _role_cache.clear()


def _db_staff_lookup(clerk_user_id: str) -> Optional[tuple[str, Optional[str], Optional[str], Optional[str]]]:
    """Return (role, email, display_name, organization_name) from ats_staff_users."""
    try:
        from models import AtsStaffUser

        db = SessionLocal()
        try:
            row = db.query(AtsStaffUser).filter(AtsStaffUser.clerk_user_id == clerk_user_id).first()
            if not row:
                return None
            return (
                _normalize_role(row.role),
                (row.email or None),
                row.display_name,
                row.organization_name,
            )
        finally:
            db.close()
    except Exception:
        logger.warning("ats_auth db_staff_lookup_failed user_id=%s", clerk_user_id, exc_info=False)
        return None


def _upsert_staff_touch(
    *,
    clerk_user_id: str,
    email: Optional[str],
    display_name: Optional[str],
    role: Optional[str] = None,
    role_source: Optional[str] = None,
) -> None:
    """Ensure a staff row exists; optionally set role when provided."""
    try:
        from models import AtsStaffUser

        db = SessionLocal()
        try:
            row = db.query(AtsStaffUser).filter(AtsStaffUser.clerk_user_id == clerk_user_id).first()
            now = datetime.utcnow()
            if not row:
                row = AtsStaffUser(
                    clerk_user_id=clerk_user_id,
                    email=email,
                    display_name=display_name,
                    role=_normalize_role(role) if role else "viewer",
                    role_updated_at=now if role else None,
                    role_updated_by=role_source,
                    last_seen_at=now,
                )
                db.add(row)
            else:
                if email and not row.email:
                    row.email = email
                if display_name and not row.display_name:
                    row.display_name = display_name
                if role and _normalize_role(role) != _normalize_role(row.role):
                    # Do not downgrade an existing elevated DB role from a transient miss
                    if not (
                        _normalize_role(row.role) in WRITE_ROLES
                        and _normalize_role(role) == "viewer"
                        and role_source in ("jwt_missing", "default")
                    ):
                        prev = row.role
                        row.role = _normalize_role(role)
                        row.role_updated_at = now
                        row.role_updated_by = role_source
                        logger.info(
                            "ats_auth staff_role_sync user_id=%s previous=%s new=%s source=%s",
                            clerk_user_id,
                            prev,
                            row.role,
                            role_source,
                        )
                row.last_seen_at = now
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.warning("ats_auth staff_upsert_failed user_id=%s", clerk_user_id, exc_info=False)


def _bootstrap_admin(clerk_user_id: str, email: Optional[str]) -> bool:
    ids = {p.strip() for p in os.getenv("ATS_BOOTSTRAP_ADMIN_USER_IDS", "").split(",") if p.strip()}
    emails = _csv_set("ATS_BOOTSTRAP_ADMIN_EMAILS")
    if clerk_user_id in ids:
        return True
    if email and email.lower() in emails:
        return True
    return False


@dataclass
class AtsPrincipal:
    """The authenticated ATS user derived from a verified Clerk token."""

    user_id: Optional[str] = None
    claims: dict = field(default_factory=dict)
    email: Optional[str] = None
    display_name: Optional[str] = None
    organization_name: Optional[str] = None
    role_source: str = "default"
    _resolved_role: Optional[str] = field(default=None, repr=False)

    @property
    def role(self) -> str:
        if self._resolved_role:
            return self._resolved_role
        return self.resolve_role()

    def resolve_role(self) -> str:
        if not self.user_id and not ENFORCE:
            self._resolved_role = "admin"
            self.role_source = "dev_anonymous"
            return self._resolved_role

        # 1) JWT claims
        raw = _role_from_claims(self.claims)
        if raw:
            self._resolved_role = _normalize_role(raw)
            self.role_source = "jwt"
            return self._resolved_role

        # 2) Clerk Backend API
        if self.user_id:
            api_role, api_email, api_name = _fetch_role_from_clerk_api(self.user_id)
            if api_email and not self.email:
                self.email = api_email
            if api_name and not self.display_name:
                self.display_name = api_name
            if api_role:
                self._resolved_role = api_role
                self.role_source = "clerk_api"
                _upsert_staff_touch(
                    clerk_user_id=self.user_id,
                    email=self.email,
                    display_name=self.display_name,
                    role=api_role,
                    role_source="clerk_api",
                )
                return self._resolved_role

        # 3) Local DB
        if self.user_id:
            db_row = _db_staff_lookup(self.user_id)
            if db_row:
                role, email, name, org = db_row
                if email and not self.email:
                    self.email = email
                if name and not self.display_name:
                    self.display_name = name
                if org:
                    self.organization_name = org
                self._resolved_role = role
                self.role_source = "database"
                _upsert_staff_touch(
                    clerk_user_id=self.user_id,
                    email=self.email,
                    display_name=self.display_name,
                )
                return self._resolved_role

        # 4) Bootstrap admin allowlist
        if self.user_id and _bootstrap_admin(self.user_id, self.email):
            self._resolved_role = "admin"
            self.role_source = "bootstrap"
            _upsert_staff_touch(
                clerk_user_id=self.user_id,
                email=self.email,
                display_name=self.display_name,
                role="admin",
                role_source="bootstrap",
            )
            invalidate_role_cache(self.user_id)
            return self._resolved_role

        # 5) Default
        self._resolved_role = _normalize_role(None, default="viewer" if ENFORCE else "admin")
        self.role_source = "default_viewer" if ENFORCE else "dev_default_admin"
        if self.user_id:
            _upsert_staff_touch(
                clerk_user_id=self.user_id,
                email=self.email,
                display_name=self.display_name,
                role=self._resolved_role if not ENFORCE else None,
                role_source=self.role_source,
            )
        return self._resolved_role


def _fetch_jwks(force: bool = False) -> list:
    now = time.time()
    if not force and _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL_SECONDS:
        return _jwks_cache["keys"]
    if not CLERK_JWKS_URL:
        raise HTTPException(status_code=500, detail="Server authentication is not configured.")
    with urllib.request.urlopen(CLERK_JWKS_URL, timeout=10) as resp:  # noqa: S310
        data = json.loads(resp.read().decode("utf-8"))
    _jwks_cache["keys"] = data.get("keys", [])
    _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


def _verify_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MSG) from None
    kid = header.get("kid")

    keys = _fetch_jwks()
    key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        keys = _fetch_jwks(force=True)
        key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MSG)

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER or None,
            options={"verify_aud": False},
        )
    except Exception:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MSG) from None
    return claims


def _bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return token or None
    return None


def _log_auth_decision(
    *,
    request: Request,
    principal: AtsPrincipal,
    required: tuple[str, ...],
    allowed: bool,
) -> None:
    logger.info(
        "ats_auth decision route=%s method=%s user_id=%s email=%s role=%s role_source=%s "
        "required=%s org=%s result=%s",
        request.url.path,
        request.method,
        principal.user_id,
        principal.email,
        principal.role,
        principal.role_source,
        ",".join(required) if required else "-",
        principal.organization_name,
        "allow" if allowed else "deny",
    )


def get_current_ats_user(request: Request) -> AtsPrincipal:
    """FastAPI dependency for every private ATS endpoint."""
    token = _bearer_token(request)

    if not ENFORCE:
        if token:
            try:
                claims = _verify_token(token)
                principal = AtsPrincipal(
                    user_id=claims.get("sub"),
                    claims=claims,
                    email=_email_from_claims(claims),
                    display_name=_name_from_claims(claims),
                )
                principal.resolve_role()
                return principal
            except HTTPException:
                pass
        return AtsPrincipal(user_id=None, claims={})

    if not token:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MSG)
    try:
        claims = _verify_token(token)
    except HTTPException:
        raise
    except Exception:
        logger.exception("ats_auth unexpected_verify_error route=%s", request.url.path)
        raise HTTPException(status_code=500, detail=AUTH_VERIFY_FAIL_MSG) from None

    principal = AtsPrincipal(
        user_id=claims.get("sub"),
        claims=claims,
        email=_email_from_claims(claims),
        display_name=_name_from_claims(claims),
    )
    try:
        principal.resolve_role()
    except HTTPException:
        raise
    except Exception:
        logger.exception("ats_auth role_resolve_failed user_id=%s", principal.user_id)
        raise HTTPException(status_code=500, detail=AUTH_VERIFY_FAIL_MSG) from None
    return principal


def require_role(*allowed_roles: str):
    """Dependency factory for role-gated actions."""

    normalized = tuple(_normalize_role(r) for r in allowed_roles if r)

    def _dep(request: Request) -> AtsPrincipal:
        principal = get_current_ats_user(request)
        if ENFORCE and normalized and principal.role not in normalized:
            _log_auth_decision(
                request=request,
                principal=principal,
                required=normalized,
                allowed=False,
            )
            raise HTTPException(status_code=403, detail=FORBIDDEN_MSG)
        _log_auth_decision(
            request=request,
            principal=principal,
            required=normalized,
            allowed=True,
        )
        return principal

    return _dep


def require_writer(request: Request) -> AtsPrincipal:
    """Admin or Recruiter — can create/update ATS records / run parsers."""
    return require_role(*WRITE_ROLES)(request)


def require_admin(request: Request) -> AtsPrincipal:
    """Admin-only — destructive or connection-level actions."""
    return require_role(*ADMIN_ROLES)(request)
