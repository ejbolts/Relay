"""Add CSV compatibility fields and sample marker."""

import sqlalchemy as sa
from alembic import op

revision = "0004_csv_fields_and_samples"
down_revision = "0003_workout_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("training_workouts") as batch:
        batch.add_column(sa.Column("is_sample", sa.Boolean(), nullable=False, server_default="0"))
    with op.batch_alter_table("workout_sets") as batch:
        batch.add_column(sa.Column("bodyweight_kg", sa.Float(), nullable=True))
        batch.add_column(sa.Column("percentile", sa.Float(), nullable=True))
        batch.add_column(sa.Column("warmup", sa.Boolean(), nullable=False, server_default="0"))
        batch.create_check_constraint(
            "workout_set_bodyweight_nonnegative",
            "bodyweight_kg IS NULL OR bodyweight_kg >= 0",
        )
        batch.create_check_constraint(
            "workout_set_percentile_range",
            "percentile IS NULL OR (percentile >= 0 AND percentile <= 100)",
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.drop_constraint("workout_set_percentile_range", type_="check")
        batch.drop_constraint("workout_set_bodyweight_nonnegative", type_="check")
        batch.drop_column("warmup")
        batch.drop_column("percentile")
        batch.drop_column("bodyweight_kg")
    with op.batch_alter_table("training_workouts") as batch:
        batch.drop_column("is_sample")
