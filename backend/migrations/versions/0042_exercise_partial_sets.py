"""Allow each account to turn off an exercise's partial muscle credits."""

import sqlalchemy as sa
from alembic import op

revision = "0042_exercise_partial_sets"
down_revision = "0041_workout_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("partial_sets_enabled", sa.Boolean(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("exercises", "partial_sets_enabled")
