"""Record estimated cardio calories and preserve attribution when movements reorder.

Revision ID: 0017_cardio_calories
Revises: 0016_workout_times
"""

import sqlalchemy as sa
from alembic import op

revision = "0017_cardio_calories"
down_revision = "0016_workout_times"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.add_column(sa.Column("calories_kcal", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("source_exercise_id", sa.String(36), nullable=True))
        batch.create_check_constraint(
            "cardio_calories_range",
            "calories_kcal IS NULL OR (calories_kcal >= 0 AND calories_kcal <= 100000)",
        )
    op.execute(
        """
        UPDATE cardio_sessions SET source_exercise_id = (
            SELECT exercise_id FROM workout_movements
            WHERE workout_movements.workout_id = cardio_sessions.source_workout_id
              AND workout_movements.order_index = cardio_sessions.source_movement_index
        ) WHERE source_workout_id IS NOT NULL
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.drop_constraint("cardio_calories_range", type_="check")
        batch.drop_column("source_exercise_id")
        batch.drop_column("calories_kcal")
