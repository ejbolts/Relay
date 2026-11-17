"""Add workout start and end times.

Revision ID: 0016_workout_times
Revises: 0015_imported_history_backfill
"""

import sqlalchemy as sa
from alembic import op

revision = "0016_workout_times"
down_revision = "0015_imported_history_backfill"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("training_workouts") as batch:
        batch.add_column(sa.Column("start_time", sa.Time(), nullable=True))
        batch.add_column(sa.Column("end_time", sa.Time(), nullable=True))
        batch.create_check_constraint(
            "training_workout_times_together",
            "(start_time IS NULL AND end_time IS NULL) OR "
            "(start_time IS NOT NULL AND end_time IS NOT NULL)",
        )


def downgrade() -> None:
    with op.batch_alter_table("training_workouts") as batch:
        batch.drop_constraint("training_workout_times_together", type_="check")
        batch.drop_column("end_time")
        batch.drop_column("start_time")
