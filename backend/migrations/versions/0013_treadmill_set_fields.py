"""Add incline and speed fields to treadmill workout sets.

Revision ID: 0013_treadmill_set_fields
Revises: 0012_exercise_favorites
"""

import sqlalchemy as sa
from alembic import op

revision = "0013_treadmill_set_fields"
down_revision = "0012_exercise_favorites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.add_column(sa.Column("incline_percent", sa.Float(), nullable=True))
        batch.add_column(sa.Column("speed_kph", sa.Float(), nullable=True))
        batch.create_check_constraint(
            "workout_set_incline_range",
            "incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 100)",
        )
        batch.create_check_constraint(
            "workout_set_speed_range",
            "speed_kph IS NULL OR (speed_kph >= 0 AND speed_kph <= 100)",
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.drop_constraint("workout_set_speed_range", type_="check")
        batch.drop_constraint("workout_set_incline_range", type_="check")
        batch.drop_column("speed_kph")
        batch.drop_column("incline_percent")
