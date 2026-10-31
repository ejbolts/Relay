"""Live friend activity: online status and workout-in-progress sharing choices."""

import sqlalchemy as sa
from alembic import op

revision = "0048_live_activity"
down_revision = "0047_weekly_partial_sets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Friends see both by default; either can be turned off in the sharing settings.
    op.add_column(
        "profile_sharing",
        sa.Column("share_online_status", sa.Boolean(), nullable=False, server_default="1"),
    )
    op.add_column(
        "profile_sharing",
        sa.Column("share_live_workouts", sa.Boolean(), nullable=False, server_default="1"),
    )
    op.create_table(
        "live_workouts",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("kind IN ('strength', 'cardio')", name="live_workout_kind_known"),
    )


def downgrade() -> None:
    op.drop_table("live_workouts")
    op.drop_column("profile_sharing", "share_live_workouts")
    op.drop_column("profile_sharing", "share_online_status")
