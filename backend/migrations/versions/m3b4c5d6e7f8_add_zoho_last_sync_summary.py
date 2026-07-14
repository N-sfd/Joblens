"""Add last_sync_summary to zoho_connections for safe sync diagnostics UI."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "m3b4c5d6e7f8"
down_revision = "l2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("zoho_connections") as batch_op:
        batch_op.add_column(sa.Column("last_sync_summary", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("zoho_connections") as batch_op:
        batch_op.drop_column("last_sync_summary")
