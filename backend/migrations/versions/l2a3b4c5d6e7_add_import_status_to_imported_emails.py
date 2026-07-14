"""Add import_status workflow field to imported_emails.

Distinct from `classification` (AI content type: job_req/candidate/spam/other)
— tracks the human workflow state: pending | imported | linked | ignored |
archived | failed. Backfills existing linked rows to 'imported'.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "l2a3b4c5d6e7"
down_revision = "k1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("imported_emails") as batch_op:
        batch_op.add_column(
            sa.Column("import_status", sa.String(length=20), nullable=False, server_default="pending")
        )
        batch_op.create_index("ix_imported_emails_import_status", ["import_status"], unique=False)
    op.execute(
        "UPDATE imported_emails SET import_status = 'imported' WHERE job_requirement_id IS NOT NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table("imported_emails") as batch_op:
        batch_op.drop_index("ix_imported_emails_import_status")
        batch_op.drop_column("import_status")
