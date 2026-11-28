"""Train together: friends link their live workouts with a short-lived code.

Three new tables, nothing existing changes. A session's attendance rows and its invites go
with it; deleting the account that started a session only clears ``created_by``.

Revision ID: 0068_train_together
Revises: 0067_custom_reactions
"""

import sqlalchemy as sa
from alembic import op

revision = "0068_train_together"
down_revision = "0067_custom_reactions"
branch_labels = None
depends_on = None

REASONS = "'left', 'finished', 'discarded', 'expired', 'unfriended'"


def upgrade() -> None:
    op.create_table(
        "train_together_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_reason", sa.String(20), nullable=True),
        sa.Column(
            "ended_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint(
            f"ended_reason IS NULL OR ended_reason IN ({REASONS})",
            name="train_session_reason_known",
        ),
    )
    op.create_index(
        "ix_train_together_sessions_created_by", "train_together_sessions", ["created_by"]
    )
    op.create_table(
        "train_together_members",
        # One row per attendance: a rejoin is a new row.
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("train_together_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_reason", sa.String(20), nullable=True),
        sa.Column("draft_session_id", sa.String(36), nullable=True),
        sa.Column(
            "workout_id",
            sa.String(36),
            sa.ForeignKey("training_workouts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint(
            f"left_reason IS NULL OR left_reason IN ({REASONS})",
            name="train_member_reason_known",
        ),
    )
    op.create_index("ix_train_together_members_user_id", "train_together_members", ["user_id"])
    op.create_index(
        "ix_train_together_members_session_id", "train_together_members", ["session_id"]
    )
    # An account is in at most one session at a time.
    op.create_index(
        "uq_train_together_members_open",
        "train_together_members",
        ["user_id"],
        unique=True,
        sqlite_where=sa.text("left_at IS NULL"),
    )
    op.create_index(
        "ix_train_together_members_workout_id", "train_together_members", ["workout_id"]
    )
    op.create_table(
        "train_together_invites",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("train_together_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "used_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_train_together_invites_session_id", "train_together_invites", ["session_id"]
    )
    op.create_index(
        "ix_train_together_invites_created_by", "train_together_invites", ["created_by"]
    )


def downgrade() -> None:
    op.drop_index("ix_train_together_invites_created_by", "train_together_invites")
    op.drop_index("ix_train_together_invites_session_id", "train_together_invites")
    op.drop_table("train_together_invites")
    op.drop_index("ix_train_together_members_workout_id", "train_together_members")
    op.drop_index("uq_train_together_members_open", "train_together_members")
    op.drop_index("ix_train_together_members_session_id", "train_together_members")
    op.drop_index("ix_train_together_members_user_id", "train_together_members")
    op.drop_table("train_together_members")
    op.drop_index("ix_train_together_sessions_created_by", "train_together_sessions")
    op.drop_table("train_together_sessions")
