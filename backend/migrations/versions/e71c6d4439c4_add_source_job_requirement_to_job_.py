"""add source_job_requirement_id to job_applications

Revision ID: e71c6d4439c4
Revises: 6f0d3965ca0e
Create Date: 2026-07-13 00:00:00.000000

Links a Job Tracker entry back to the CRM/ATS job it was saved from (via
Discover Jobs → Save Job / Add to Tracker / Contact Recruiter). Nullable and
unrelated-by-FK-constraint on purpose, matching this codebase's existing
convention (see 24892d0f55b5) — the tracker row already carries its own copy
of the fields it needs, so it stays intact even if the source job later
disappears.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e71c6d4439c4'
down_revision: Union[str, None] = '6f0d3965ca0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('job_applications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source_job_requirement_id', sa.Integer(), nullable=True))
        batch_op.create_index(
            'ix_job_applications_source_job_requirement_id', ['source_job_requirement_id'], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table('job_applications', schema=None) as batch_op:
        batch_op.drop_index('ix_job_applications_source_job_requirement_id')
        batch_op.drop_column('source_job_requirement_id')
