"""add public job matching fields

Revision ID: ded404a2b776
Revises: c3d4e5f6a7b8
Create Date: 2026-07-12 00:00:00.000000

Adds `published_for_matching` to job_requirements (recruiter opt-in to
surface a requisition in the public Job Matcher) and a job snapshot pair
(`job_requirement_id`, `job_snapshot_json`) to job_matches so historical
match results are unaffected by later edits/closure of the source job.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ded404a2b776'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('published_for_matching', sa.Boolean(), nullable=True))

    with op.batch_alter_table('job_matches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('job_requirement_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('job_snapshot_json', sa.Text(), nullable=True))
        batch_op.create_index('ix_job_matches_job_requirement_id', ['job_requirement_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('job_matches', schema=None) as batch_op:
        batch_op.drop_index('ix_job_matches_job_requirement_id')
        batch_op.drop_column('job_snapshot_json')
        batch_op.drop_column('job_requirement_id')

    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.drop_column('published_for_matching')
