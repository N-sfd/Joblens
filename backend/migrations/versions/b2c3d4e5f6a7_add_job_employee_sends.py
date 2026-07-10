"""add job_employee_sends table (Phase 7)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-09 16:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_employee_sends",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_requirement_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("sent_by", sa.String(length=255), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("message_subject", sa.String(length=500), nullable=True),
        sa.Column("message_body", sa.Text(), nullable=True),
        sa.Column("delivery_status", sa.String(length=50), nullable=True),
        sa.Column("employee_response", sa.String(length=50), nullable=True),
        sa.Column("response_at", sa.DateTime(), nullable=True),
        sa.Column("match_score_at_send", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["job_requirement_id"], ["job_requirements.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_job_employee_sends_id", "job_employee_sends", ["id"])
    op.create_index("ix_job_employee_sends_job_requirement_id", "job_employee_sends", ["job_requirement_id"])
    op.create_index("ix_job_employee_sends_employee_id", "job_employee_sends", ["employee_id"])


def downgrade() -> None:
    op.drop_index("ix_job_employee_sends_employee_id", table_name="job_employee_sends")
    op.drop_index("ix_job_employee_sends_job_requirement_id", table_name="job_employee_sends")
    op.drop_index("ix_job_employee_sends_id", table_name="job_employee_sends")
    op.drop_table("job_employee_sends")
