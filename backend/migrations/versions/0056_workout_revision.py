"""Give every workout a revision so a stale editor cannot overwrite newer edits.

``revision`` starts at 1 for every existing workout and advances with each change to its content.
A save that names the revision its editor loaded is refused when the workout has moved on, instead
of silently replacing the newer version. Downgrading drops the column.
"""

import sqlalchemy as sa
from alembic import op

revision = "0056_workout_revision"
down_revision = "0055_remove_ffmi_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_workouts",
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("training_workouts", "revision")
