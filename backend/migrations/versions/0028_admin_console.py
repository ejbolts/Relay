"""Add account disabling, last-activity tracking, and runtime server settings.

Revision ID: 0028_admin_console
Revises: 0027_multi_user_auth
"""

import sqlalchemy as sa
from alembic import op

revision = "0028_admin_console"
down_revision = "0027_multi_user_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True))
    # Seed last activity from live sessions so existing accounts do not all read "never".
    op.execute(
        "UPDATE users SET last_active_at = "
        "(SELECT MAX(last_seen_at) FROM user_sessions WHERE user_sessions.user_id = users.id)"
    )
    op.create_table(
        "server_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("server_settings")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_active_at")
        batch.drop_column("disabled_at")
