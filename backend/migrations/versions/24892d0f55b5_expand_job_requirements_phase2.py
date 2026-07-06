"""expand job_requirements phase2

Revision ID: 24892d0f55b5
Revises: d25f966bb9c6
Create Date: 2026-07-02 19:32:24.228271

Adds Phase 2 job requirement columns. FK columns are indexed but FK
constraints are omitted here for SQLite batch_alter compatibility; the ORM
still maps vendor_id/client_id/etc. PostgreSQL deployments may add named
FK constraints separately if desired.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '24892d0f55b5'
down_revision: Union[str, None] = 'd25f966bb9c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.add_column(sa.Column('external_job_id', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('job_reference_number', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('vendor_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('recruiter_contact_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('client_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('end_client_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('city', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('state', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('country', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('employment_type', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('contract_type', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('rate_min', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('rate_max', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('rate_currency', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('rate_type', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('clearance_requirement', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('minimum_experience', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('education_requirement', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('certification_requirement', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('submission_instructions', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('number_of_openings', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('created_by', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('received_at', sa.DateTime(), nullable=True))
        batch_op.create_index('ix_job_requirements_client_id', ['client_id'], unique=False)
        batch_op.create_index('ix_job_requirements_end_client_id', ['end_client_id'], unique=False)
        batch_op.create_index('ix_job_requirements_external_job_id', ['external_job_id'], unique=False)
        batch_op.create_index('ix_job_requirements_recruiter_contact_id', ['recruiter_contact_id'], unique=False)
        batch_op.create_index('ix_job_requirements_vendor_id', ['vendor_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('job_requirements', schema=None) as batch_op:
        batch_op.drop_index('ix_job_requirements_vendor_id')
        batch_op.drop_index('ix_job_requirements_recruiter_contact_id')
        batch_op.drop_index('ix_job_requirements_external_job_id')
        batch_op.drop_index('ix_job_requirements_end_client_id')
        batch_op.drop_index('ix_job_requirements_client_id')
        batch_op.drop_column('received_at')
        batch_op.drop_column('created_by')
        batch_op.drop_column('number_of_openings')
        batch_op.drop_column('submission_instructions')
        batch_op.drop_column('certification_requirement')
        batch_op.drop_column('education_requirement')
        batch_op.drop_column('minimum_experience')
        batch_op.drop_column('clearance_requirement')
        batch_op.drop_column('rate_type')
        batch_op.drop_column('rate_currency')
        batch_op.drop_column('rate_max')
        batch_op.drop_column('rate_min')
        batch_op.drop_column('contract_type')
        batch_op.drop_column('employment_type')
        batch_op.drop_column('country')
        batch_op.drop_column('state')
        batch_op.drop_column('city')
        batch_op.drop_column('end_client_id')
        batch_op.drop_column('client_id')
        batch_op.drop_column('recruiter_contact_id')
        batch_op.drop_column('vendor_id')
        batch_op.drop_column('job_reference_number')
        batch_op.drop_column('external_job_id')
