"""Phase 5 M4 — production configuration validation for extension APIs."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExtensionRuntimeConfig:
    jwt_secret: str
    token_issuer: str
    token_audience: str
    allowed_origins: frozenset[str]
    allowed_extension_ids: frozenset[str]
    allowed_versions: frozenset[str]
    min_extension_version: str
    blocked_versions: frozenset[str]
    access_token_ttl_seconds: int
    refresh_token_ttl_seconds: int
    document_token_ttl_seconds: int
    frontend_base_url: str
    api_base_url: str


def _csv(name: str) -> frozenset[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return frozenset()
    return frozenset(p.strip() for p in raw.split(",") if p.strip())


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def load_extension_config() -> ExtensionRuntimeConfig:
    secret = (
        os.getenv("EXTENSION_JWT_SECRET", "").strip()
        or os.getenv("SECRET_KEY", "").strip()
        or "dev-insecure-secret-change-me"
    )
    return ExtensionRuntimeConfig(
        jwt_secret=secret,
        token_issuer=os.getenv("EXTENSION_TOKEN_ISSUER", "joblens-extension").strip()
        or "joblens-extension",
        token_audience=os.getenv("EXTENSION_TOKEN_AUDIENCE", "joblens-extension-api").strip()
        or "joblens-extension-api",
        allowed_origins=_csv("EXTENSION_ALLOWED_ORIGINS"),
        allowed_extension_ids=_csv("EXTENSION_ALLOWED_IDS"),
        allowed_versions=_csv("EXTENSION_ALLOWED_VERSIONS"),
        min_extension_version=os.getenv("EXTENSION_MIN_VERSION", "0.3.0").strip() or "0.3.0",
        blocked_versions=_csv("EXTENSION_BLOCKED_VERSIONS"),
        access_token_ttl_seconds=_int_env("EXTENSION_ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
        refresh_token_ttl_seconds=_int_env("EXTENSION_REFRESH_TOKEN_TTL_SECONDS", 7 * 24 * 3600),
        document_token_ttl_seconds=_int_env("DOCUMENT_TOKEN_TTL_SECONDS", 5 * 60),
        frontend_base_url=os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").strip(),
        api_base_url=os.getenv("API_BASE_URL", "http://localhost:8000").strip(),
    )


def validate_extension_config_at_startup() -> ExtensionRuntimeConfig:
    """Fail clearly in production when required secrets/config are missing."""
    env = os.getenv("ENV", "development").strip().lower()
    cfg = load_extension_config()

    if env != "production":
        if cfg.jwt_secret == "dev-insecure-secret-change-me":
            logger.warning("Using development SECRET_KEY / EXTENSION_JWT_SECRET — do not deploy.")
        return cfg

    missing: list[str] = []
    if not os.getenv("EXTENSION_JWT_SECRET", "").strip() and not os.getenv("SECRET_KEY", "").strip():
        missing.append("EXTENSION_JWT_SECRET or SECRET_KEY")
    if cfg.jwt_secret == "dev-insecure-secret-change-me":
        missing.append("EXTENSION_JWT_SECRET (must not use development default)")
    if not os.getenv("DATABASE_URL", "").strip() or "sqlite" in os.getenv("DATABASE_URL", "").lower():
        missing.append("DATABASE_URL (PostgreSQL required in production)")
    if not cfg.allowed_origins:
        logger.warning("EXTENSION_ALLOWED_ORIGINS is empty in production — origin checks are open.")
    if missing:
        raise RuntimeError(
            "Production extension configuration incomplete: " + ", ".join(missing) + ". "
            "Refusing to start with development secrets or SQLite."
        )
    return cfg


def parse_version_tuple(version: str) -> tuple[int, ...]:
    parts: list[int] = []
    for p in (version or "0").split("."):
        digits = "".join(c for c in p if c.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts) if parts else (0,)


def version_satisfies_min(version: str | None, minimum: str) -> bool:
    if not version:
        return False
    return parse_version_tuple(version) >= parse_version_tuple(minimum)


def version_allowed(version: str | None, cfg: ExtensionRuntimeConfig | None = None) -> tuple[bool, str]:
    cfg = cfg or load_extension_config()
    if not version:
        return False, "Extension version required."
    if version in cfg.blocked_versions:
        return False, f"Extension version {version} is blocked. Please update JobLens Assistant."
    if not version_satisfies_min(version, cfg.min_extension_version):
        return (
            False,
            f"Update required: minimum supported extension version is {cfg.min_extension_version}.",
        )
    if cfg.allowed_versions and version not in cfg.allowed_versions:
        return False, f"Extension version {version} is not allowed in this environment."
    return True, ""
