"""Keep duplicate machine photos together without deleting their images."""

from alembic import op

revision = "0044_merged_machine_photos"
down_revision = "0043_workout_save_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite supports a nullable REFERENCES column without rebuilding the parent
    # table (which is already referenced by workout movements).
    op.execute(
        "ALTER TABLE machine_photos ADD COLUMN merged_into_id VARCHAR(36) "
        "REFERENCES machine_photos(id) ON DELETE CASCADE"
    )
    op.create_index("ix_machine_photos_merged_into_id", "machine_photos", ["merged_into_id"])


def downgrade() -> None:
    op.drop_index("ix_machine_photos_merged_into_id", table_name="machine_photos")
    op.drop_column("machine_photos", "merged_into_id")
