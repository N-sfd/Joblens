"""Phase 5 M3 — seeker documents, upload sessions, application documents, confirmation fields

Revision ID: i9d0e1f2a3b4
Revises: h8c9d0e1f2a3
Create Date: 2026-07-14 24:00:00.000000

Adds:
- seeker_documents — binary resume/cover files for upload assist
- application_documents — exact version used on an application
- extension_upload_sessions — one-time retrieval tokens (hash only)
- job_applications confirmation / document reference columns

Does not add automatic submission or employer credential storage.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i9d0e1f2a3b4"
down_revision: Union[str, None] = "h8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "seeker_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("source_resume_analysis_id", sa.Integer(), nullable=True),
        sa.Column("source_cover_letter_id", sa.Integer(), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_seeker_documents_user_id", "seeker_documents", ["user_id"])
    op.create_index("ix_seeker_documents_guest_id", "seeker_documents", ["guest_id"])
    op.create_index("ix_seeker_documents_document_type", "seeker_documents", ["document_type"])

    op.create_table(
        "application_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("job_application_id", sa.Integer(), sa.ForeignKey("job_applications.id"), nullable=False),
        sa.Column("extension_fill_session_id", sa.Integer(), nullable=True),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column("source_document_version", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("upload_method", sa.String(length=40), nullable=False),
        sa.Column("upload_status", sa.String(length=40), nullable=False),
        sa.Column("employer_field_label", sa.String(length=255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_application_documents_job_application_id", "application_documents", ["job_application_id"])
    op.create_index("ix_application_documents_source_document_id", "application_documents", ["source_document_id"])

    op.create_table(
        "extension_upload_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=True),
        sa.Column("fill_session_id", sa.Integer(), nullable=True),
        sa.Column("job_application_id", sa.Integer(), nullable=True),
        sa.Column("seeker_document_id", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("employer_field_key", sa.String(length=255), nullable=True),
        sa.Column("employer_field_label", sa.String(length=255), nullable=True),
        sa.Column("accept_attr", sa.String(length=255), nullable=True),
        sa.Column("retrieval_token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("verification_status", sa.String(length=40), nullable=True),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_extension_upload_sessions_retrieval_token_hash", "extension_upload_sessions", ["retrieval_token_hash"])
    op.create_index("ix_extension_upload_sessions_seeker_document_id", "extension_upload_sessions", ["seeker_document_id"])

    with op.batch_alter_table("job_applications") as batch:
        batch.add_column(sa.Column("confirmation_number", sa.String(length=120), nullable=True))
        batch.add_column(sa.Column("confirmation_url", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("submission_notes", sa.Text(), nullable=True))
        batch.add_column(sa.Column("resume_document_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("cover_letter_document_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("job_applications") as batch:
        batch.drop_column("cover_letter_document_id")
        batch.drop_column("resume_document_id")
        batch.drop_column("submission_notes")
        batch.drop_column("confirmation_url")
        batch.drop_column("confirmation_number")
    op.drop_table("extension_upload_sessions")
    op.drop_table("application_documents")
    op.drop_table("seeker_documents")
