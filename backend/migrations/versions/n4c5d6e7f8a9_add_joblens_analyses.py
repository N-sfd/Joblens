"""Add joblens_analyses table for Career Intelligence saved analyses."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "n4c5d6e7f8a9"
down_revision = "m3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "joblens_analyses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resume_filename", sa.String(length=255), nullable=True),
        sa.Column("resume_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("job_title", sa.String(length=255), nullable=True),
        sa.Column("company_name", sa.String(length=255), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("job_description_hash", sa.String(length=64), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("required_skills_score", sa.Integer(), nullable=True),
        sa.Column("preferred_skills_score", sa.Integer(), nullable=True),
        sa.Column("experience_score", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_joblens_analyses_content_hash", "joblens_analyses", ["content_hash"])
    op.create_index("ix_joblens_analyses_guest_id", "joblens_analyses", ["guest_id"])
    op.create_index("ix_joblens_analyses_user_id", "joblens_analyses", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_joblens_analyses_user_id", table_name="joblens_analyses")
    op.drop_index("ix_joblens_analyses_guest_id", table_name="joblens_analyses")
    op.drop_index("ix_joblens_analyses_content_hash", table_name="joblens_analyses")
    op.drop_table("joblens_analyses")
