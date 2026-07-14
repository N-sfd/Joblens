"""Rename ATS 'viewer' role to 'read_only' and introduce 'manager' role.

Data-only migration: ats_staff_users.role stays a free string column (no
DB-level enum/check constraint exists), so this just backfills existing
'viewer' rows and updates the column's server default. 'manager' requires no
backfill — it simply becomes a newly valid value going forward.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "k1f2a3b4c5d6"
down_revision = "j0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE ats_staff_users SET role = 'read_only' WHERE role = 'viewer'")
    with op.batch_alter_table("ats_staff_users") as batch_op:
        batch_op.alter_column(
            "role",
            existing_type=sa.String(length=40),
            server_default="read_only",
        )


def downgrade() -> None:
    op.execute("UPDATE ats_staff_users SET role = 'viewer' WHERE role IN ('read_only', 'manager')")
    with op.batch_alter_table("ats_staff_users") as batch_op:
        batch_op.alter_column(
            "role",
            existing_type=sa.String(length=40),
            server_default="viewer",
        )
