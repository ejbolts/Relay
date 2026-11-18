"""Finished workouts the app prepares with each live draft, for opt-in auto-save."""

import sqlalchemy as sa
from alembic import op

revision = "0059_workout_auto_save"
down_revision = "0058_workout_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("active_workout_sync") as batch:
        batch.add_column(sa.Column("auto_save", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("auto_save_client_version", sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("active_workout_sync") as batch:
        batch.drop_column("auto_save_client_version")
        batch.drop_column("auto_save")
