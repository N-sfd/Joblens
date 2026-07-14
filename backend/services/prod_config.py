"""Production environment startup validation (fail-fast, never log secrets)."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("joblens.config")


def _is_production() -> bool:
    return os.getenv("ENV", "development").strip().lower() == "production"


def _present(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def validate_production_env(*, enforce_auth: bool) -> None:
    """Raise RuntimeError when required production configuration is missing.

    Messages list variable *names* only — never values.
    """
    if not _is_production():
        return

    missing: list[str] = []
    warnings: list[str] = []

    if not _present("DATABASE_URL"):
        missing.append("DATABASE_URL")
    elif "sqlite" in os.getenv("DATABASE_URL", "").lower():
        warnings.append("DATABASE_URL points at SQLite — use managed PostgreSQL in production.")

    origins = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not origins:
        missing.append("ALLOWED_ORIGINS")
    elif "*" in origins.split(","):
        missing.append("ALLOWED_ORIGINS must not include wildcard '*' with credentials")

    if enforce_auth:
        for key in ("CLERK_JWKS_URL", "CLERK_ISSUER"):
            if not _present(key):
                missing.append(key)
        if not _present("CLERK_SECRET_KEY"):
            warnings.append("CLERK_SECRET_KEY is unset — role lookup via Clerk API will be unavailable.")

    if not _present("GROQ_API_KEY") and not _present("ANTHROPIC_API_KEY") and not _present("OPENAI_API_KEY"):
        warnings.append("No AI provider API key set — resume/job parsing will fail.")

    frontend = os.getenv("FRONTEND_URL", "").strip() or os.getenv("CORS_FRONTEND_URL", "").strip()
    if not frontend and "localhost" in origins.lower():
        warnings.append("Production ALLOWED_ORIGINS still references localhost.")

    for w in warnings:
        logger.warning("production config: %s", w)

    if missing:
        raise RuntimeError(
            "Production startup aborted — missing or unsafe configuration: "
            + ", ".join(missing)
            + ". See docs/ENVIRONMENT_VARIABLES.md."
        )
