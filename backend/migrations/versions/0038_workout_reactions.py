"""Let members react to the shared workouts of people they follow."""

import sqlalchemy as sa
from alembic import op

revision = "0038_workout_reactions"
down_revision = "0037_follow_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_reactions",
        sa.Column(
            "workout_id",
            sa.String(36),
            sa.ForeignKey("training_workouts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("reaction", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("notification_seen", sa.Boolean(), nullable=False, server_default="0"),
        sa.CheckConstraint(
            "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy')",
            name="workout_reaction_known",
        ),
    )
    op.create_index("ix_workout_reactions_user_id", "workout_reactions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_workout_reactions_user_id", table_name="workout_reactions")
    op.drop_table("workout_reactions")
