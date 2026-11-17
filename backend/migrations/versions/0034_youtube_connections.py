"""Per-account YouTube connections and channel-bound video batches.

Revision ID: 0034_youtube_connections
Revises: 0033_profile_sharing

Existing shared-channel videos are retained. Credentials are never assigned from the old
server token: each person must explicitly connect their own channel.
"""

import sqlalchemy as sa
from alembic import op

revision = "0034_youtube_connections"
down_revision = "0033_profile_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "youtube_connections",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("channel_id", sa.String(100), nullable=False),
        sa.Column("channel_title", sa.String(200), nullable=False),
        sa.Column("encrypted_credentials", sa.Text(), nullable=False),
        sa.Column("needs_reconnect", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.create_table(
        "youtube_oauth_states",
        sa.Column("state_hash", sa.String(64), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("user_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("encrypted_verifier", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_youtube_oauth_states_user_id", "youtube_oauth_states", ["user_id"])
    op.add_column("sessions", sa.Column("youtube_channel_id", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "youtube_channel_id")
    op.drop_table("youtube_oauth_states")
    op.drop_table("youtube_connections")
