"""expand joblens profile and application answers

Revision ID: d4e5f6a7b8c9
Revises: 8b65977303ab
Create Date: 2026-07-14 12:00:00.000000

Phase 3 — Real Profile system:

1. Extend `profiles` with personal-info columns, projects/certifications JSON,
   professional_links / work_authorization / job_preferences JSON blobs,
   default resume/cover-letter ids, and cached completion percentage.
   Email remains on `users` (auth-managed) and is not duplicated here.

2. Create `application_answers` for reusable, user-approved application
   question answers with sensitivity flags and reuse policies.

Does not add resume/cover-letter FKs on JobApplication (deferred to a later
application-attempt/document phase).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "8b65977303ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("profiles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("full_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("preferred_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("address_line_1", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("address_line_2", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("city", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("state", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("postal_code", sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column("country", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("current_location", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("projects_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("certifications_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("professional_links_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("work_authorization_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("job_preferences_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("default_resume_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("default_cover_letter_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("profile_completion_percentage", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("profile_completed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "application_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("normalized_question_key", sa.String(length=100), nullable=False),
        sa.Column("display_question", sa.String(length=500), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("answer_type", sa.String(length=50), nullable=False),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False),
        sa.Column("approval_status", sa.String(length=30), nullable=False),
        sa.Column("reuse_policy", sa.String(length=40), nullable=False),
        sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_application_answers_id", "application_answers", ["id"])
    op.create_index("ix_application_answers_user_id", "application_answers", ["user_id"])
    op.create_index(
        "ix_application_answers_normalized_question_key",
        "application_answers",
        ["normalized_question_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_application_answers_normalized_question_key", table_name="application_answers")
    op.drop_index("ix_application_answers_user_id", table_name="application_answers")
    op.drop_index("ix_application_answers_id", table_name="application_answers")
    op.drop_table("application_answers")

    with op.batch_alter_table("profiles", schema=None) as batch_op:
        batch_op.drop_column("profile_completed_at")
        batch_op.drop_column("profile_completion_percentage")
        batch_op.drop_column("default_cover_letter_id")
        batch_op.drop_column("default_resume_id")
        batch_op.drop_column("job_preferences_json")
        batch_op.drop_column("work_authorization_json")
        batch_op.drop_column("professional_links_json")
        batch_op.drop_column("certifications_json")
        batch_op.drop_column("projects_json")
        batch_op.drop_column("current_location")
        batch_op.drop_column("country")
        batch_op.drop_column("postal_code")
        batch_op.drop_column("state")
        batch_op.drop_column("city")
        batch_op.drop_column("address_line_2")
        batch_op.drop_column("address_line_1")
        batch_op.drop_column("preferred_name")
        batch_op.drop_column("full_name")
