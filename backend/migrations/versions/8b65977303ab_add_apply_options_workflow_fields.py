"""add apply options workflow fields

Revision ID: 8b65977303ab
Revises: e71c6d4439c4
Create Date: 2026-07-14 00:00:00.000000

Two things:
1. `job_requirements.application_url` — the direct employer application
   link, powering "Apply on Employer Website" in JobLens's Apply Options
   modal.
2. Apply Options workflow fields on `job_applications`: a full job snapshot
   (`job_snapshot_json`, same shape as the public JobRequirementResponse
   projection) so a user who already saved/tracked a job keeps its full
   detail after the source is closed or unpublished, plus
   application_source/application_method/application_opened_at/applied_at/
   recruiter_contacted_at/last_activity_at for the guarded status-transition
   logic in routers/jobs.py.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8b65977303ab'
down_revision: Union[str, None] = 'e71c6d4439c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('application_url', sa.String(length=500), nullable=True))

    with op.batch_alter_table('job_applications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('job_snapshot_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('application_source', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('application_method', sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column('application_opened_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('applied_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('recruiter_contacted_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_activity_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('job_applications', schema=None) as batch_op:
        batch_op.drop_column('last_activity_at')
        batch_op.drop_column('recruiter_contacted_at')
        batch_op.drop_column('applied_at')
        batch_op.drop_column('application_opened_at')
        batch_op.drop_column('application_method')
        batch_op.drop_column('application_source')
        batch_op.drop_column('job_snapshot_json')

    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.drop_column('application_url')
