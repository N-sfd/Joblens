"""add zoho mail tables

Revision ID: a1b2c3d4e5f6
Revises: 24892d0f55b5
Create Date: 2026-07-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "24892d0f55b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "zoho_oauth_states",
        sa.Column("state", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("state"),
    )
    op.create_index("ix_zoho_oauth_states_user_id", "zoho_oauth_states", ["user_id"])

    op.create_table(
        "zoho_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("zoho_account_id", sa.String(length=64), nullable=True),
        sa.Column("mailbox_email", sa.String(length=255), nullable=True),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("api_domain", sa.String(length=255), nullable=True),
        sa.Column("inbox_folder_id", sa.String(length=64), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_zoho_connections_user_id", "zoho_connections", ["user_id"], unique=True)

    op.create_table(
        "imported_emails",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("zoho_connection_id", sa.Integer(), nullable=False),
        sa.Column("zoho_message_id", sa.String(length=64), nullable=False),
        sa.Column("folder_id", sa.String(length=64), nullable=True),
        sa.Column("from_address", sa.String(length=255), nullable=True),
        sa.Column("from_name", sa.String(length=255), nullable=True),
        sa.Column("subject", sa.String(length=500), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=True),
        sa.Column("classification", sa.String(length=50), nullable=True),
        sa.Column("job_requirement_id", sa.Integer(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["zoho_connection_id"], ["zoho_connections.id"]),
        sa.ForeignKeyConstraint(["job_requirement_id"], ["job_requirements.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_imported_emails_zoho_connection_id", "imported_emails", ["zoho_connection_id"])
    op.create_index("ix_imported_emails_zoho_message_id", "imported_emails", ["zoho_message_id"])
    op.create_index(
        "ix_imported_emails_conn_msg",
        "imported_emails",
        ["zoho_connection_id", "zoho_message_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_imported_emails_conn_msg", table_name="imported_emails")
    op.drop_index("ix_imported_emails_zoho_message_id", table_name="imported_emails")
    op.drop_index("ix_imported_emails_zoho_connection_id", table_name="imported_emails")
    op.drop_table("imported_emails")
    op.drop_index("ix_zoho_connections_user_id", table_name="zoho_connections")
    op.drop_table("zoho_connections")
    op.drop_index("ix_zoho_oauth_states_user_id", table_name="zoho_oauth_states")
    op.drop_table("zoho_oauth_states")
