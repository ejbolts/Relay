"""Store screenshot metrics on cardio workout sets."""

import sqlalchemy as sa
from alembic import op

revision = "0022_workout_set_cardio_metrics"
down_revision = "0021_cardio_average_power"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.add_column(sa.Column("calories_kcal", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("average_heart_rate_bpm", sa.Integer(), nullable=True))
        batch.create_check_constraint(
            "workout_set_calories_range",
            "calories_kcal IS NULL OR (calories_kcal >= 0 AND calories_kcal <= 100000)",
        )
        batch.create_check_constraint(
            "workout_set_average_heart_rate_range",
            "average_heart_rate_bpm IS NULL OR "
            "(average_heart_rate_bpm >= 20 AND average_heart_rate_bpm <= 250)",
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.drop_constraint("workout_set_average_heart_rate_range", type_="check")
        batch.drop_constraint("workout_set_calories_range", type_="check")
        batch.drop_column("average_heart_rate_bpm")
        batch.drop_column("calories_kcal")
