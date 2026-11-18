"""Track elevation gain for cardio sessions.

Revision ID: 0060_cardio_elevation_gain
Revises: 0059_workout_auto_save
"""

import sqlalchemy as sa
from alembic import op

revision = "0060_cardio_elevation_gain"
down_revision = "0059_workout_auto_save"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.add_column(sa.Column("elevation_gain_m", sa.Float(), nullable=True))
        batch.create_check_constraint(
            "cardio_elevation_gain_range",
            "elevation_gain_m IS NULL OR (elevation_gain_m >= 0 AND elevation_gain_m <= 30000)",
        )


def downgrade() -> None:
    with op.batch_alter_table("cardio_sessions") as batch:
        batch.drop_constraint("cardio_elevation_gain_range", type_="check")
        batch.drop_column("elevation_gain_m")
