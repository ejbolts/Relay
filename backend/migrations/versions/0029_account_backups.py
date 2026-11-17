"""Record per-account backups, each owned by exactly one account.

Revision ID: 0029_account_backups
Revises: 0028_admin_console

Backup files live under ``data/account-backups/<user_id>/``. Downgrading drops only the records;
the files stay on disk.
"""

import sqlalchemy as sa
from alembic import op

revision = "0029_account_backups"
down_revision = "0028_admin_console"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_backups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("schema_revision", sa.String(64), nullable=True),
        sa.Column("file_count", sa.Integer(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("source_fingerprint", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("user_id", "source_fingerprint", name="uq_account_backup_user_source"),
    )
    op.create_index("ix_account_backups_user_id", "account_backups", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_account_backups_user_id", table_name="account_backups")
    op.drop_table("account_backups")
