"""Track average cycling power for cardio performance history."""

import sqlalchemy as sa
from alembic import op

revision = "0021_cardio_average_power"
down_revision = "0020_merge_duplicate_cardio_exercises"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.add_column(sa.Column("average_power_watts", sa.Integer(), nullable=True))
        batch.create_check_constraint(
            "cardio_average_power_range",
            "average_power_watts IS NULL OR "
            "(average_power_watts >= 1 AND average_power_watts <= 3000)",
        )


def downgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.drop_constraint("cardio_average_power_range", type_="check")
        batch.drop_column("average_power_watts")
