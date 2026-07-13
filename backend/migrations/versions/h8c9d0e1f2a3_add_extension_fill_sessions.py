"""Phase 5 M2 — extension fill sessions

Revision ID: h8c9d0e1f2a3
Revises: g7b8c9d0e1f2
Create Date: 2026-07-14 23:30:00.000000

Adds extension_fill_sessions for assisted-fill metadata (field names/status only).
Does not store profile answer values or employer form values.
Does not add application submission / attempt tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h8c9d0e1f2a3"
down_revision: Union[str, None] = "g7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extension_fill_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("job_requirement_id", sa.Integer(), nullable=True),
        sa.Column("application_url_normalized", sa.String(length=500), nullable=True),
        sa.Column("platform", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("detected_fields_json", sa.Text(), nullable=False),
        sa.Column("requested_fields_json", sa.Text(), nullable=False),
        sa.Column("approved_fields_json", sa.Text(), nullable=False),
        sa.Column("successful_fields_json", sa.Text(), nullable=False),
        sa.Column("skipped_fields_json", sa.Text(), nullable=False),
        sa.Column("failed_fields_json", sa.Text(), nullable=False),
        sa.Column("missing_fields_json", sa.Text(), nullable=False),
        sa.Column("detector_version", sa.String(length=40), nullable=True),
        sa.Column("extension_version", sa.String(length=30), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("filled_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_extension_fill_sessions_user_id", "extension_fill_sessions", ["user_id"])
    op.create_index("ix_extension_fill_sessions_guest_id", "extension_fill_sessions", ["guest_id"])
    op.create_index("ix_extension_fill_sessions_job_id", "extension_fill_sessions", ["job_id"])
    op.create_index("ix_extension_fill_sessions_status", "extension_fill_sessions", ["status"])


def downgrade() -> None:
    op.drop_table("extension_fill_sessions")
