"""Phase 5 — ATS staff role table (Clerk user id → role).

Clerk session JWTs often omit public_metadata unless a custom session template
is configured, and the Clerk Backend API can be unavailable. Roles resolved
here are authoritative when JWT metadata is missing.
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "j0e1f2a3b4c5"
down_revision = "i9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ats_staff_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clerk_user_id", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=40), nullable=False, server_default="viewer"),
        sa.Column("organization_name", sa.String(length=255), nullable=True),
        sa.Column("role_updated_at", sa.DateTime(), nullable=True),
        sa.Column("role_updated_by", sa.String(length=128), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_ats_staff_users_clerk_user_id", "ats_staff_users", ["clerk_user_id"], unique=True)
    op.create_index("ix_ats_staff_users_email", "ats_staff_users", ["email"], unique=False)
    op.create_index("ix_ats_staff_users_role", "ats_staff_users", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ats_staff_users_role", table_name="ats_staff_users")
    op.drop_index("ix_ats_staff_users_email", table_name="ats_staff_users")
    op.drop_index("ix_ats_staff_users_clerk_user_id", table_name="ats_staff_users")
    op.drop_table("ats_staff_users")
