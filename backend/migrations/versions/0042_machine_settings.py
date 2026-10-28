"""Keep the machine settings used in each workout movement."""

import sqlalchemy as sa
from alembic import op

revision = "0042_machine_settings"
down_revision = "0041_workout_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workout_movements",
        sa.Column("machine_settings", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("workout_movements", "machine_settings")
