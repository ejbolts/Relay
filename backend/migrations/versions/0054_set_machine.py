"""Keep the machine used for each set; older rows remain unassigned."""

import sqlalchemy as sa
from alembic import op

revision = "0054_set_machine"
down_revision = "0053_maintenance_ranges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.add_column(sa.Column("machine_photo_id", sa.String(36), nullable=True))
        batch.create_foreign_key(
            "fk_workout_sets_machine",
            "machine_photos",
            ["machine_photo_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_workout_sets_machine_photo_id", ["machine_photo_id"])
    op.execute(
        sa.text("""
        UPDATE workout_sets SET machine_photo_id = (
            SELECT MIN(COALESCE(p.merged_into_id, p.id))
            FROM movement_machine_photos m JOIN machine_photos p ON p.id = m.machine_photo_id
            WHERE m.movement_id = workout_sets.movement_id
            HAVING COUNT(DISTINCT COALESCE(p.merged_into_id, p.id)) = 1
        )
    """)
    )


def downgrade() -> None:
    with op.batch_alter_table("workout_sets") as batch:
        batch.drop_index("ix_workout_sets_machine_photo_id")
        batch.drop_constraint("fk_workout_sets_machine", type_="foreignkey")
        batch.drop_column("machine_photo_id")
