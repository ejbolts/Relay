"""Deduplicate retries of the same client workout session."""

import sqlalchemy as sa
from alembic import op

revision = "0043_workout_save_sessions"
down_revision = "0042_machine_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("training_workouts", sa.Column("client_session_id", sa.String(36), nullable=True))
    op.create_index(
        "uq_training_workout_user_client_session",
        "training_workouts",
        ["user_id", "client_session_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_training_workout_user_client_session", table_name="training_workouts")
    op.drop_column("training_workouts", "client_session_id")
