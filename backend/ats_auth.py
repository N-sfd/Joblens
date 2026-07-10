"""Clerk JWT verification for the private CRM/ATS API.

Every private ATS endpoint depends on `get_current_ats_user`. In production
(ATS_AUTH_ENFORCE=true) this verifies the Clerk session JWT sent by the frontend
as `Authorization: Bearer <token>` against Clerk's JWKS, rejecting anything
unverified with 401. Frontend route protection (middleware.ts) is NOT trusted on
its own — the backend independently verifies every request.

Local development can leave ATS_AUTH_ENFORCE unset/false so the CRUD API is
usable without a browser session; the verification code path is identical and is
exercised whenever a bearer token is present.
"""

import json
import os
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

from fastapi import HTTPException, Request
from jose import jwt

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "").strip()
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").strip()
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "").strip()
# Enforce verification when explicitly enabled, or default to on when a JWKS URL
# is configured AND enforcement isn't explicitly disabled.
_enforce_env = os.getenv("ATS_AUTH_ENFORCE", "").strip().lower()
if _enforce_env in ("true", "1", "yes"):
    ENFORCE = True
elif _enforce_env in ("false", "0", "no"):
    ENFORCE = False
else:
    ENFORCE = False  # safe default; set ATS_AUTH_ENFORCE=true in production

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}
_role_cache: dict[str, tuple[str, float]] = {}
_ROLE_CACHE_TTL = 300.0


# Canonical ATS roles (set in Clerk public_metadata.role).
ATS_ROLES = ("admin", "recruiter", "viewer")
WRITE_ROLES = ("admin", "recruiter")
ADMIN_ROLES = ("admin",)


def _normalize_role(raw: Optional[str], *, default: str = "viewer") -> str:
    """Missing/unknown roles fall back to viewer (least privilege) when enforced."""
    if not raw or not str(raw).strip():
        return default if default in ATS_ROLES else "viewer"
    role = str(raw).strip().lower()
    aliases = {"administrator": "admin", "recruiters": "recruiter", "view": "viewer", "readonly": "viewer"}
    role = aliases.get(role, role)
    return role if role in ATS_ROLES else "viewer"


def _role_from_claims(claims: dict) -> Optional[str]:
    for key in ("public_metadata", "metadata", "prm"):
        md = claims.get(key)
        if isinstance(md, dict) and md.get("role"):
            return str(md["role"])
    raw = claims.get("role") or claims.get("org_role")
    return str(raw) if raw else None


def _fetch_role_from_clerk_api(user_id: str) -> Optional[str]:
    """Fallback when JWT has no public_metadata (common until a custom session template is set)."""
    if not CLERK_SECRET_KEY or not user_id:
        return None
    cached = _role_cache.get(user_id)
    now = time.time()
    if cached and now - cached[1] < _ROLE_CACHE_TTL:
        return cached[0]
    try:
        req = urllib.request.Request(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
        md = data.get("public_metadata") or {}
        role = md.get("role") if isinstance(md, dict) else None
        if isinstance(role, str) and role.strip():
            normalized = _normalize_role(role)
            _role_cache[user_id] = (normalized, now)
            return normalized
    except Exception:
        return None
    return None


@dataclass
class AtsPrincipal:
    """The authenticated ATS user derived from a verified Clerk token.

    user_id is Clerk's `sub` claim — the trusted identity. Never trust a user id
    sent in a request body; always use this value for created_by/audit fields."""

    user_id: Optional[str] = None
    claims: dict = field(default_factory=dict)

    @property
    def role(self) -> str:
        # Local/dev without a token defaults to admin so CRUD stays usable.
        if not self.user_id and not ENFORCE:
            return "admin"
        raw = _role_from_claims(self.claims)
        if raw:
            return _normalize_role(raw)
        if self.user_id:
            api_role = _fetch_role_from_clerk_api(self.user_id)
            if api_role:
                return api_role
        # Enforced production default is least privilege.
        return _normalize_role(None, default="viewer" if ENFORCE else "admin")


def _fetch_jwks(force: bool = False) -> list:
    now = time.time()
    if not force and _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL_SECONDS:
        return _jwks_cache["keys"]
    if not CLERK_JWKS_URL:
        raise HTTPException(status_code=500, detail="Server authentication is not configured.")
    with urllib.request.urlopen(CLERK_JWKS_URL, timeout=10) as resp:  # noqa: S310 (trusted Clerk URL)
        data = json.loads(resp.read().decode("utf-8"))
    _jwks_cache["keys"] = data.get("keys", [])
    _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


def _verify_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed authentication token.")
    kid = header.get("kid")

    keys = _fetch_jwks()
    key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        # Key may have rotated; refresh once.
        keys = _fetch_jwks(force=True)
        key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        raise HTTPException(status_code=401, detail="Unrecognized token signing key.")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER or None,
            options={"verify_aud": False},
        )
    except Exception:
        # Do not leak crypto/validation internals to clients.
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return claims


def _bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return token or None
    return None


def get_current_ats_user(request: Request) -> AtsPrincipal:
    """FastAPI dependency for every private ATS endpoint.

    - Enforced: requires a valid Clerk bearer token, else 401.
    - Not enforced (local dev): verifies a token if provided, otherwise returns
      an anonymous principal so CRUD is usable without a browser session."""
    token = _bearer_token(request)

    if not ENFORCE:
        if token:
            try:
                claims = _verify_token(token)
                return AtsPrincipal(user_id=claims.get("sub"), claims=claims)
            except HTTPException:
                pass
        return AtsPrincipal(user_id=None, claims={})

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    claims = _verify_token(token)
    return AtsPrincipal(user_id=claims.get("sub"), claims=claims)


def require_role(*allowed_roles: str):
    """Dependency factory for role-gated actions (e.g. Admin-only delete)."""

    normalized = tuple(_normalize_role(r) for r in allowed_roles)

    def _dep(request: Request) -> AtsPrincipal:
        principal = get_current_ats_user(request)
        if ENFORCE and normalized and principal.role not in normalized:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action.")
        return principal

    return _dep


def require_writer(request: Request) -> AtsPrincipal:
    """Admin or Recruiter — can create/update ATS records."""
    return require_role(*WRITE_ROLES)(request)


def require_admin(request: Request) -> AtsPrincipal:
    """Admin-only — destructive or connection-level actions."""
    return require_role(*ADMIN_ROLES)(request)
