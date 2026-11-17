"""Merge the remaining duplicate machine triceps extension."""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0024_merge_machine_triceps_extension"
down_revision = "0023_merge_duplicate_exercises"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    canonical = connection.execute(
        sa.text("SELECT id, is_favorite FROM exercises WHERE name = 'Triceps Machine Extension'")
    ).first()
    alias = connection.execute(
        sa.text("SELECT id, is_favorite FROM exercises WHERE name = 'Machine Tricep Extension'")
    ).first()
    if canonical is None or alias is None:
        return

    connection.execute(
        sa.text(
            "UPDATE exercises SET is_favorite = :favorite, equipment = 'Machine' WHERE id = :id"
        ),
        {"id": canonical.id, "favorite": bool(canonical.is_favorite or alias.is_favorite)},
    )
    connection.execute(
        sa.text(
            """
            DELETE FROM exercise_muscle_contributions
            WHERE exercise_id = :alias_id
              AND muscle_name IN (
                  SELECT muscle_name FROM exercise_muscle_contributions
                  WHERE exercise_id = :canonical_id
              )
            """
        ),
        {"alias_id": alias.id, "canonical_id": canonical.id},
    )
    for table in (
        "workout_movements",
        "personal_records",
        "machine_photos",
        "exercise_muscle_contributions",
    ):
        connection.execute(
            sa.text(
                f"UPDATE {table} SET exercise_id = :canonical_id WHERE exercise_id = :alias_id"
            ),
            {"canonical_id": canonical.id, "alias_id": alias.id},
        )
    connection.execute(
        sa.text(
            "UPDATE cardio_sessions SET source_exercise_id = :canonical_id "
            "WHERE source_exercise_id = :alias_id"
        ),
        {"canonical_id": canonical.id, "alias_id": alias.id},
    )
    connection.execute(sa.text("DELETE FROM exercises WHERE id = :id"), {"id": alias.id})
    connection.execute(
        sa.text("UPDATE app_settings SET value = :revision WHERE key = 'workout_cache_revision'"),
        {"revision": str(uuid.uuid4())},
    )


def downgrade() -> None:
    # Merged history cannot be separated back into its former alias reliably.
    pass
