"""add job requirement review_status

Revision ID: 6f0d3965ca0e
Revises: ded404a2b776
Create Date: 2026-07-12 00:00:00.000000

Adds `review_status` to job_requirements — an editorial gate (Draft |
Approved | Rejected) independent of the operational `status` pipeline and
the `published_for_matching` publish toggle. All three must align for a job
to appear in the public Job Matcher (see routers/public_jobs.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6f0d3965ca0e'
down_revision: Union[str, None] = 'ded404a2b776'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('review_status', sa.String(length=20), nullable=True, server_default='Draft'))


def downgrade() -> None:
    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.drop_column('review_status')
