"""add application_platform to job_requirements

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-14 20:00:00.000000

Phase 5 M0 — store classifier label (greenhouse, lever, workday, …) alongside
application_url so Discover / ATS / reports do not re-parse on every request.
No application_attempts tables in this milestone.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("job_requirements", schema=None) as batch_op:
        batch_op.add_column(sa.Column("application_platform", sa.String(length=50), nullable=True))
        batch_op.create_index(
            "ix_job_requirements_application_platform",
            ["application_platform"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("job_requirements", schema=None) as batch_op:
        batch_op.drop_index("ix_job_requirements_application_platform")
        batch_op.drop_column("application_platform")
