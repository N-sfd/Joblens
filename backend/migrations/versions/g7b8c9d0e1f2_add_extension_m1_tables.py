"""Phase 5 M1 — extension auth challenges, tokens, diagnostics

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-14 22:00:00.000000

Adds:
- extension_auth_challenges — short-lived pairing for Connect to JobLens
- extension_tokens — revocable extension-scoped credentials (hashes only)
- extension_diagnostics — read-only Greenhouse field diagnostics (no values)

Does NOT add application_attempts, autofill, or form-answer tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extension_auth_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("challenge", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("extension_version", sa.String(length=30), nullable=True),
        sa.Column("pending_access_token", sa.Text(), nullable=True),
        sa.Column("pending_refresh_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_extension_auth_challenges_challenge", "extension_auth_challenges", ["challenge"], unique=True)
    op.create_index("ix_extension_auth_challenges_user_id", "extension_auth_challenges", ["user_id"])
    op.create_index("ix_extension_auth_challenges_guest_id", "extension_auth_challenges", ["guest_id"])

    op.create_table(
        "extension_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("extension_version", sa.String(length=30), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_extension_tokens_jti", "extension_tokens", ["jti"], unique=True)
    op.create_index("ix_extension_tokens_user_id", "extension_tokens", ["user_id"])
    op.create_index("ix_extension_tokens_guest_id", "extension_tokens", ["guest_id"])
    op.create_index("ix_extension_tokens_refresh_token_hash", "extension_tokens", ["refresh_token_hash"])

    op.create_table(
        "extension_diagnostics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("application_url_normalized", sa.String(length=500), nullable=True),
        sa.Column("platform", sa.String(length=50), nullable=True),
        sa.Column("employer", sa.String(length=255), nullable=True),
        sa.Column("job_title", sa.String(length=255), nullable=True),
        sa.Column("detected_fields_json", sa.Text(), nullable=False),
        sa.Column("supported_count", sa.Integer(), nullable=False),
        sa.Column("sensitive_count", sa.Integer(), nullable=False),
        sa.Column("unsupported_count", sa.Integer(), nullable=False),
        sa.Column("detector_version", sa.String(length=40), nullable=True),
        sa.Column("extension_version", sa.String(length=30), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_extension_diagnostics_user_id", "extension_diagnostics", ["user_id"])
    op.create_index("ix_extension_diagnostics_guest_id", "extension_diagnostics", ["guest_id"])
    op.create_index("ix_extension_diagnostics_job_id", "extension_diagnostics", ["job_id"])


def downgrade() -> None:
    op.drop_table("extension_diagnostics")
    op.drop_table("extension_tokens")
    op.drop_table("extension_auth_challenges")
