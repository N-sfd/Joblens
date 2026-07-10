"""add submissions interviews offers (Phase 8)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-09 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_requirement_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("recruiter_contact_id", sa.Integer(), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("job_employee_send_id", sa.Integer(), nullable=True),
        sa.Column("submitted_rate", sa.String(length=100), nullable=True),
        sa.Column("rate_type", sa.String(length=50), nullable=True),
        sa.Column("submission_date", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("vendor_reference", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["job_employee_send_id"], ["job_employee_sends.id"]),
        sa.ForeignKeyConstraint(["job_requirement_id"], ["job_requirements.id"]),
        sa.ForeignKeyConstraint(["recruiter_contact_id"], ["crm_contacts.id"]),
        sa.ForeignKeyConstraint(["vendor_id"], ["crm_organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_submissions_id", "submissions", ["id"])
    op.create_index("ix_submissions_job_requirement_id", "submissions", ["job_requirement_id"])
    op.create_index("ix_submissions_employee_id", "submissions", ["employee_id"])
    op.create_index("ix_submissions_status", "submissions", ["status"])

    op.create_table(
        "interviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("interview_type", sa.String(length=60), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("interviewer_name", sa.String(length=255), nullable=True),
        sa.Column("location_or_link", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("outcome", sa.String(length=50), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interviews_id", "interviews", ["id"])
    op.create_index("ix_interviews_submission_id", "interviews", ["submission_id"])
    op.create_index("ix_interviews_status", "interviews", ["status"])

    op.create_table(
        "offers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("offered_rate", sa.String(length=100), nullable=True),
        sa.Column("rate_type", sa.String(length=50), nullable=True),
        sa.Column("start_date", sa.String(length=30), nullable=True),
        sa.Column("offer_date", sa.DateTime(), nullable=True),
        sa.Column("expiry_date", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("onboarding_status", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_offers_id", "offers", ["id"])
    op.create_index("ix_offers_submission_id", "offers", ["submission_id"])
    op.create_index("ix_offers_status", "offers", ["status"])

    with op.batch_alter_table("crm_activities", schema=None) as batch_op:
        batch_op.create_foreign_key(
            "fk_crm_activities_submission_id",
            "submissions",
            ["submission_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("crm_activities", schema=None) as batch_op:
        batch_op.drop_constraint("fk_crm_activities_submission_id", type_="foreignkey")

    op.drop_index("ix_offers_status", table_name="offers")
    op.drop_index("ix_offers_submission_id", table_name="offers")
    op.drop_index("ix_offers_id", table_name="offers")
    op.drop_table("offers")

    op.drop_index("ix_interviews_status", table_name="interviews")
    op.drop_index("ix_interviews_submission_id", table_name="interviews")
    op.drop_index("ix_interviews_id", table_name="interviews")
    op.drop_table("interviews")

    op.drop_index("ix_submissions_status", table_name="submissions")
    op.drop_index("ix_submissions_employee_id", table_name="submissions")
    op.drop_index("ix_submissions_job_requirement_id", table_name="submissions")
    op.drop_index("ix_submissions_id", table_name="submissions")
    op.drop_table("submissions")
