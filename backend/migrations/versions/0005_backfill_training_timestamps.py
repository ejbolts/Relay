"""Backfill workout timestamps missing from early SQLite migrations."""

from alembic import op

revision = "0005_backfill_training_timestamps"
down_revision = "0004_csv_fields_and_samples"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE training_workouts SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
    )
    op.execute(
        "UPDATE training_workouts SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) "
        "WHERE updated_at IS NULL"
    )


def downgrade() -> None:
    pass
