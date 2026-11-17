"""Merge duplicate strength exercises while preserving their history."""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0023_merge_duplicate_exercises"
down_revision = "0022_workout_set_cardio_metrics"
branch_labels = None
depends_on = None


EXERCISE_MERGES = (
    (
        "Barbell Bench Press",
        "PUSH",
        "Chest",
        "Barbell",
        ("Bench Press",),
    ),
    (
        "Incline Dumbbell Press",
        "PUSH",
        "Chest",
        "Dumbbell",
        ("Incline Dumbbell Bench Press",),
    ),
    ("Pec Deck", "PUSH", "Chest", "Machine", ("Machine Chest Fly",)),
    (
        "Machine Chest Press",
        "PUSH",
        "Chest",
        "Machine",
        ("Chest Press", "Machine bench press"),
    ),
    ("Pull-up", "PULL", "Lats", "Bodyweight", ("Pull Ups",)),
    (
        "Single-Arm Cable Lat Pulldown",
        "PULL",
        "Lats",
        "Cable",
        ("One Arm Lat Pulldown", "One Arm Pulldown"),
    ),
    (
        "Single-Arm Cable Biceps Curl",
        "PULL",
        "Biceps",
        "Cable",
        ("Single arm cable bicep curl", "One Arm Cable Bicep Curl"),
    ),
    (
        "Single-Arm Preacher Curl",
        "PULL",
        "Biceps",
        "Dumbbell",
        ("One Arm Dumbbell Preacher Curl",),
    ),
    (
        "Standing Calf Raise",
        "LOWER",
        "Calves",
        "Machine",
        ("Machine Calf Raise",),
    ),
    (
        "Back Extension Machine",
        "LOWER",
        "Lower Back",
        "Machine",
        ("Back Extension",),
    ),
    (
        "Seated Ab Crunch Machine",
        "FULL_BODY",
        "Core",
        "Machine",
        ("Machine Seated Crunch",),
    ),
    ("Barbell Row", "PULL", "Mid / Upper Back", "Barbell", ("Bent Over Row",)),
    (
        "Seated Machine Row",
        "PULL",
        "Mid / Upper Back",
        "Machine",
        ("Machine Row",),
    ),
    ("Back Squat", "LOWER", "Quads", "Barbell", ("Squat",)),
    (
        "Bulgarian Split Squat",
        "LOWER",
        "Quads",
        "Dumbbell",
        ("Dumbbell Bulgarian Split Squat",),
    ),
    (
        "Lateral Raise",
        "PUSH",
        "Shoulders",
        "Dumbbell",
        ("Dumbbell Lateral Raise", "Seated lateral raise"),
    ),
    (
        "Dumbbell Shoulder Press",
        "PUSH",
        "Shoulders",
        "Dumbbell",
        ("Seated Dumbbell Shoulder Press",),
    ),
    ("Overhead Press", "PUSH", "Shoulders", "Barbell", ("Military Press",)),
    (
        "Single-Arm Cable Triceps Pushdown",
        "PUSH",
        "Triceps",
        "Cable",
        ("Single Arm Tricep Pushdown (Cable)", "One Arm Tricep Rope Pushdown"),
    ),
    ("Triceps Pushdown", "PUSH", "Triceps", "Cable", ("Tricep Pushdown",)),
    (
        "Straight-Arm Cable Pulldown",
        "PULL",
        "Lats",
        "Cable",
        ("Straight Arm Pulldown", "Straight Bar Pull Down", "Rope Straight Arm Pulldown"),
    ),
    (
        "Single-Arm Cable Pullover",
        "PULL",
        "Lats",
        "Cable",
        ("Single Arm Cable Pull Over", "One Arm Side Straight Arm Pulldown"),
    ),
    ("Dumbbell Curl", "PULL", "Biceps", "Dumbbell", ("Seated Dumbbell Curl",)),
    ("Face Pull", "PULL", "Rear Delts", "Cable", ("Cable Crossover Face Pull",)),
)


def exercise_rows(connection: sa.Connection, name: str):
    return connection.execute(
        sa.text(
            "SELECT id, name, is_custom, is_favorite FROM exercises "
            "WHERE lower(name) = lower(:name) ORDER BY created_at, id"
        ),
        {"name": name},
    ).all()


def merge_exercise_group(
    connection: sa.Connection,
    canonical_name: str,
    category: str,
    muscle_group: str,
    equipment: str,
    aliases: tuple[str, ...],
) -> bool:
    canonical_rows = exercise_rows(connection, canonical_name)
    canonical = canonical_rows[0] if canonical_rows else None
    alias_rows = []
    seen_ids = {canonical.id} if canonical is not None else set()
    for alias_name in aliases:
        for row in exercise_rows(connection, alias_name):
            if row.id not in seen_ids:
                alias_rows.append(row)
                seen_ids.add(row.id)

    if canonical is None and alias_rows:
        canonical = alias_rows.pop(0)
        connection.execute(
            sa.text("UPDATE exercises SET name = :name WHERE id = :id"),
            {"id": canonical.id, "name": canonical_name},
        )
    if canonical is None:
        return False

    favorite = bool(canonical.is_favorite) or any(bool(row.is_favorite) for row in alias_rows)
    connection.execute(
        sa.text(
            """
            UPDATE exercises
            SET category = :category, kind = 'STRENGTH', muscle_group = :muscle_group,
                equipment = :equipment, is_favorite = :favorite
            WHERE id = :id
            """
        ),
        {
            "id": canonical.id,
            "category": category,
            "muscle_group": muscle_group,
            "equipment": equipment,
            "favorite": favorite,
        },
    )

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
                "UPDATE cardio_sessions SET source_exercise_id = :canonical_id "
                "WHERE source_exercise_id = :alias_id"
            ),
            {"canonical_id": canonical.id, "alias_id": alias.id},
        )
        connection.execute(sa.text("DELETE FROM exercises WHERE id = :id"), {"id": alias.id})

    return bool(alias_rows) or canonical.name != canonical_name


def upgrade() -> None:
    connection = op.get_bind()
    changed = False
    for canonical_name, category, muscle_group, equipment, aliases in EXERCISE_MERGES:
        changed = (
            merge_exercise_group(
                connection,
                canonical_name,
                category,
                muscle_group,
                equipment,
                aliases,
            )
            or changed
        )
    if changed:
        connection.execute(
            sa.text(
                "UPDATE app_settings SET value = :revision WHERE key = 'workout_cache_revision'"
            ),
            {"revision": str(uuid.uuid4())},
        )


def downgrade() -> None:
    # Merged history cannot be separated back into its former aliases reliably.
    pass
