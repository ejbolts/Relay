"""Inline comments, replies and reactions on shared workouts."""

import sqlalchemy as sa
from alembic import op

revision = "0041_workout_comments"
down_revision = "0040_friendships"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workout_id",
            sa.String(36),
            sa.ForeignKey("training_workouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "parent_id", sa.String(36), sa.ForeignKey("workout_comments.id", ondelete="CASCADE")
        ),
        sa.Column(
            "reply_to_id", sa.String(36), sa.ForeignKey("workout_comments.id", ondelete="SET NULL")
        ),
        sa.Column("body", sa.String(280), nullable=False),
        sa.Column("reaction", sa.String(20)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("length(body) BETWEEN 1 AND 280", name="comment_length"),
    )
    op.create_index("ix_workout_comments_workout_id", "workout_comments", ["workout_id"])
    op.create_index("ix_workout_comments_user_id", "workout_comments", ["user_id"])
    op.create_table(
        "comment_reactions",
        sa.Column(
            "comment_id",
            sa.String(36),
            sa.ForeignKey("workout_comments.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("reaction", sa.String(20), nullable=False),
        sa.CheckConstraint(
            "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy')",
            name="comment_reaction_known",
        ),
    )
    op.create_table(
        "comment_notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "comment_id",
            sa.String(36),
            sa.ForeignKey("workout_comments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("reaction", sa.String(20)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.create_index("ix_comment_notifications_comment_id", "comment_notifications", ["comment_id"])
    op.create_index(
        "ix_comment_notifications_recipient_id", "comment_notifications", ["recipient_id"]
    )


def downgrade() -> None:
    op.drop_table("comment_notifications")
    op.drop_table("comment_reactions")
    op.drop_table("workout_comments")
