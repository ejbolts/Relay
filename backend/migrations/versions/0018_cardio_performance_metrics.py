"""Track cardio heart rate, distance, speed, and incline.

Revision ID: 0018_cardio_performance_metrics
Revises: 0017_cardio_calories
"""

import sqlalchemy as sa
from alembic import op

revision = "0018_cardio_performance_metrics"
down_revision = "0017_cardio_calories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.add_column(sa.Column("average_heart_rate_bpm", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("distance_km", sa.Float(), nullable=True))
        batch.add_column(sa.Column("average_speed_kph", sa.Float(), nullable=True))
        batch.add_column(sa.Column("incline_percent", sa.Float(), nullable=True))
        batch.create_check_constraint(
            "cardio_average_heart_rate_range",
            "average_heart_rate_bpm IS NULL OR "
            "(average_heart_rate_bpm >= 20 AND average_heart_rate_bpm <= 250)",
        )
        batch.create_check_constraint(
            "cardio_distance_range",
            "distance_km IS NULL OR (distance_km >= 0 AND distance_km <= 10000)",
        )
        batch.create_check_constraint(
            "cardio_average_speed_range",
            "average_speed_kph IS NULL OR (average_speed_kph >= 0 AND average_speed_kph <= 100)",
        )
        batch.create_check_constraint(
            "cardio_incline_range",
            "incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 100)",
        )


def downgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.drop_constraint("cardio_incline_range", type_="check")
        batch.drop_constraint("cardio_average_speed_range", type_="check")
        batch.drop_constraint("cardio_distance_range", type_="check")
        batch.drop_constraint("cardio_average_heart_rate_range", type_="check")
        batch.drop_column("incline_percent")
        batch.drop_column("average_speed_kph")
        batch.drop_column("distance_km")
        batch.drop_column("average_heart_rate_bpm")
