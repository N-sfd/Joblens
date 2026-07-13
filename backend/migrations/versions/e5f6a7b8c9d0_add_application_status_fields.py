"""add application status fields and notes

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-14 18:00:00.000000

Phase 4 — Application Status:

1. Extend `job_applications` with archive / status-change / action-required /
   last_user_activity / reminder_completed fields used by the Application
   Status page and validated status transitions.

2. Create `application_notes` for multi-note history on a JobApplication
   (separate from the legacy single `notes` text column on the application).

Does not add application_attempts or browser-automation lifecycle fields.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("job_applications", schema=None) as batch_op:
        batch_op.add_column(sa.Column("archived_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("status_changed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("status_changed_by", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("action_required", sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column("action_required_reason", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("last_user_activity_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("reminder_completed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "application_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("job_application_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["job_application_id"], ["job_applications.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_application_notes_id", "application_notes", ["id"])
    op.create_index("ix_application_notes_user_id", "application_notes", ["user_id"])
    op.create_index("ix_application_notes_guest_id", "application_notes", ["guest_id"])
    op.create_index(
        "ix_application_notes_job_application_id",
        "application_notes",
        ["job_application_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_application_notes_job_application_id", table_name="application_notes")
    op.drop_index("ix_application_notes_guest_id", table_name="application_notes")
    op.drop_index("ix_application_notes_user_id", table_name="application_notes")
    op.drop_index("ix_application_notes_id", table_name="application_notes")
    op.drop_table("application_notes")

    with op.batch_alter_table("job_applications", schema=None) as batch_op:
        batch_op.drop_column("reminder_completed_at")
        batch_op.drop_column("last_user_activity_at")
        batch_op.drop_column("action_required_reason")
        batch_op.drop_column("action_required")
        batch_op.drop_column("status_changed_by")
        batch_op.drop_column("status_changed_at")
        batch_op.drop_column("archived_at")
