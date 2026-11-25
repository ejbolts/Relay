"""Expo push tokens for the native app, bound to the sign-in that registered each one.

Revision ID: 0066_expo_push_tokens
Revises: 0065_native_client
"""

import sqlalchemy as sa
from alembic import op

revision = "0066_expo_push_tokens"
down_revision = "0065_native_client"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expo_push_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("session_id", sa.String(36), nullable=True),
        sa.Column("token", sa.String(200), nullable=False, unique=True),
        sa.Column("platform", sa.String(16), nullable=True),
        sa.Column("local_alerts", sa.JSON(), nullable=False),
        sa.Column("local_reminder_workout", sa.String(30), nullable=True),
        sa.Column("local_reminder_due_ms", sa.BigInteger(), nullable=True),
        sa.Column("native_reminder_due_ms", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_expo_push_tokens_user_id", "expo_push_tokens", ["user_id"])
    op.create_index("ix_expo_push_tokens_session_id", "expo_push_tokens", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_expo_push_tokens_session_id", "expo_push_tokens")
    op.drop_index("ix_expo_push_tokens_user_id", "expo_push_tokens")
    op.drop_table("expo_push_tokens")
