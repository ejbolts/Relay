"""Merge gym-specific cardio aliases into the generic exercises."""

import sqlalchemy as sa
from alembic import op

revision = "0020_merge_duplicate_cardio_exercises"
down_revision = "0019_active_workout_reminders"
branch_labels = None
depends_on = None


CARDIO_MERGES = (
    (
        "Incline Treadmill Walking",
        "Treadmill",
        ("Incline Treadmill (Jetts)", "Incline Walking Treadmill"),
    ),
    (
        "Cycling (Indoor)",
        "Stationary Bike",
        ("Jetts Stationary Bike", "Indoor Cycling", "Stationary Bike (Jetts)"),
    ),
)


def exercise(connection: sa.Connection, name: str):
    return connection.execute(
        sa.text("SELECT id, name FROM exercises WHERE lower(name) = lower(:name)"),
        {"name": name},
    ).first()


def merge_exercise(
    connection: sa.Connection,
    canonical_name: str,
    equipment: str,
    aliases: tuple[str, ...],
) -> bool:
    canonical = exercise(connection, canonical_name)
    alias_rows = [row for name in aliases if (row := exercise(connection, name))]
    if canonical is None and alias_rows:
        canonical = alias_rows.pop(0)
        connection.execute(
            sa.text(
                """
                UPDATE exercises
                SET name = :name, category = 'CARDIO', kind = 'CARDIO',
                    muscle_group = 'Cardio', equipment = :equipment, is_custom = 0
                WHERE id = :id
                """
            ),
            {"id": canonical.id, "name": canonical_name, "equipment": equipment},
        )
    if canonical is None:
        return False

    connection.execute(
        sa.text(
            """
            UPDATE exercises
            SET category = 'CARDIO', kind = 'CARDIO', muscle_group = 'Cardio',
                equipment = :equipment
            WHERE id = :id
            """
        ),
        {"id": canonical.id, "equipment": equipment},
    )

    changed = False
    for alias in alias_rows:
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
                """
                UPDATE cardio_sessions
                SET source_exercise_id = :canonical_id, activity_type = :canonical_name
                WHERE source_exercise_id = :alias_id OR lower(activity_type) = lower(:alias_name)
                """
            ),
            {
                "canonical_id": canonical.id,
                "canonical_name": canonical_name,
                "alias_id": alias.id,
                "alias_name": alias.name,
            },
        )
        connection.execute(sa.text("DELETE FROM exercises WHERE id = :id"), {"id": alias.id})
        changed = True
    return changed


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE cardio_sessions
            SET source_workout_id = NULL, source_movement_index = NULL
            WHERE source_workout_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM training_workouts
                  WHERE training_workouts.id = cardio_sessions.source_workout_id
              )
            """
        )
    )
    changed = False
    for canonical_name, equipment, aliases in CARDIO_MERGES:
        if merge_exercise(connection, canonical_name, equipment, aliases):
            changed = True
    renamed = connection.execute(
        sa.text(
            """
            UPDATE training_workouts
            SET name = CASE name
                WHEN 'Upper body workout' THEN 'Upper body + Cardio workout'
                WHEN 'Lower body workout' THEN 'Lower body + Cardio workout'
                WHEN 'Push workout' THEN 'Push + Cardio workout'
                WHEN 'Pull workout' THEN 'Pull + Cardio workout'
                WHEN 'Full body workout' THEN 'Full body + Cardio workout'
                WHEN 'Other workout' THEN 'Other + Cardio workout'
                ELSE name
            END
            WHERE name IN (
                'Upper body workout', 'Lower body workout', 'Push workout',
                'Pull workout', 'Full body workout', 'Other workout'
            )
              AND EXISTS (
                  SELECT 1
                  FROM workout_movements cardio_movement
                  JOIN exercises cardio_exercise ON cardio_exercise.id = cardio_movement.exercise_id
                  WHERE cardio_movement.workout_id = training_workouts.id
                    AND cardio_exercise.kind = 'CARDIO'
              )
              AND EXISTS (
                  SELECT 1
                  FROM workout_movements strength_movement
                  JOIN exercises strength_exercise
                    ON strength_exercise.id = strength_movement.exercise_id
                  WHERE strength_movement.workout_id = training_workouts.id
                    AND strength_exercise.kind <> 'CARDIO'
              )
            """
        )
    ).rowcount
    if changed or renamed:
        connection.execute(
            sa.text(
                """
                UPDATE app_settings
                SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
                WHERE key = 'workout_cache_revision'
                """
            )
        )


def downgrade() -> None:
    # Merged history cannot be split reliably back into gym-specific aliases.
    pass
