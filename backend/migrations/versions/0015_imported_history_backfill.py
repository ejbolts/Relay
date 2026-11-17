"""Align imported workout categories and bodyweight history.

Revision ID: 0015_imported_history_backfill
Revises: 0014_workout_cardio_sessions
"""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from statistics import median

import sqlalchemy as sa
from alembic import op

revision = "0015_imported_history_backfill"
down_revision = "0014_workout_cardio_sessions"
branch_labels = None
depends_on = None

IMPORTED_WORKOUT_NOTE = "Imported from CSV."
IMPORTED_BODYWEIGHT_NOTE = "Imported from workout CSV."


def infer_exercise(name: str) -> tuple[str, str, str]:
    lowered = name.casefold()
    if any(
        phrase in lowered
        for phrase in ("crunch", "sit up", "sit-up", "knee raise", "leg raise", "plank")
    ):
        return "FULL_BODY", "STRENGTH", "Core"
    if (
        re.search(
            r"\b(treadmill|run|running|jog|jogging|walk|walking|cycling|bike|bicycle|cardio|rowing)\b",
            lowered,
        )
        or "stair climber" in lowered
    ):
        return "CARDIO", "CARDIO", "Cardio"
    if any(word in lowered for word in ("reverse fly", "face pull", "rear delt")):
        return "PULL", "STRENGTH", "Rear Delts"
    if any(
        word in lowered
        for word in (
            "pulldown",
            "pull down",
            "pull-up",
            "pullup",
            "pull up",
            "chin-up",
            "chin up",
            "pullover",
            "pull over",
        )
    ):
        return "PULL", "STRENGTH", "Lats"
    if "row" in lowered:
        return "PULL", "STRENGTH", "Mid / Upper Back"
    if any(word in lowered for word in ("curl", "bicep", "grip squeezer")):
        return "PULL", "STRENGTH", "Biceps"
    if "tricep" in lowered:
        return "PUSH", "STRENGTH", "Triceps"
    if any(word in lowered for word in ("romanian deadlift", "leg curl", "hamstring")):
        return "LOWER", "STRENGTH", "Hamstrings"
    if any(word in lowered for word in ("hip thrust", "hip adduction", "hip abduction", "glute")):
        return "LOWER", "STRENGTH", "Glutes"
    if "back extension" in lowered:
        return "LOWER", "STRENGTH", "Lower Back"
    if "calf" in lowered:
        return "LOWER", "STRENGTH", "Calves"
    if any(word in lowered for word in ("squat", "leg press", "leg extension", "lunge")):
        return "LOWER", "STRENGTH", "Quads"
    if any(
        word in lowered
        for word in ("shoulder", "overhead press", "military press", "lateral raise")
    ):
        return "PUSH", "STRENGTH", "Shoulders"
    if any(
        word in lowered
        for word in (
            "bench",
            "chest",
            "pec ",
            "dumbbell fly",
            "machine fly",
            "push up",
            "push-up",
            "dips",
            "press",
        )
    ):
        return "PUSH", "STRENGTH", "Chest"
    if "deadlift" in lowered:
        return "PULL", "STRENGTH", "Posterior chain"
    if "external rotation" in lowered:
        return "UPPER", "STRENGTH", "Shoulders"
    return "OTHER", "STRENGTH", "Other"


def infer_workout(categories: list[str]) -> str:
    counts = {
        category: categories.count(category)
        for category in ("UPPER", "LOWER", "PUSH", "PULL", "FULL_BODY", "CARDIO", "OTHER")
    }
    if counts["FULL_BODY"]:
        return "FULL_BODY"
    upper_body = counts["PUSH"] + counts["PULL"] + counts["UPPER"]
    categorized_total = upper_body + counts["LOWER"] + counts["CARDIO"]
    if not categorized_total:
        return "OTHER"
    families = (("UPPER", upper_body), ("LOWER", counts["LOWER"]), ("CARDIO", counts["CARDIO"]))
    dominant_category, dominant_count = max(families, key=lambda item: item[1])
    remaining = categorized_total - dominant_count
    if remaining and dominant_count < 2 * remaining:
        return "FULL_BODY"
    if dominant_category != "UPPER":
        return dominant_category
    if counts["PUSH"] >= 2 * (counts["PULL"] + counts["UPPER"]):
        return "PUSH"
    if counts["PULL"] >= 2 * (counts["PUSH"] + counts["UPPER"]):
        return "PULL"
    return "UPPER"


def upgrade() -> None:
    connection = op.get_bind()

    imported_exercises = connection.execute(
        sa.text(
            """
            SELECT DISTINCT e.id, e.name
            FROM exercises AS e
            JOIN workout_movements AS movement ON movement.exercise_id = e.id
            JOIN training_workouts AS workout ON workout.id = movement.workout_id
            WHERE workout.notes = :imported_note AND e.is_custom = 1
            """
        ),
        {"imported_note": IMPORTED_WORKOUT_NOTE},
    ).mappings()
    for exercise in imported_exercises:
        category, kind, muscle_group = infer_exercise(exercise["name"])
        connection.execute(
            sa.text(
                """
                UPDATE exercises
                SET category = :category, kind = :kind, muscle_group = :muscle_group
                WHERE id = :exercise_id
                """
            ),
            {
                "category": category,
                "kind": kind,
                "muscle_group": muscle_group,
                "exercise_id": exercise["id"],
            },
        )

    workout_categories: dict[str, list[str]] = defaultdict(list)
    category_rows = connection.execute(
        sa.text(
            """
            SELECT workout.id AS workout_id, exercise.category
            FROM training_workouts AS workout
            JOIN workout_movements AS movement ON movement.workout_id = workout.id
            JOIN exercises AS exercise ON exercise.id = movement.exercise_id
            WHERE workout.notes = :imported_note
            ORDER BY workout.id, movement.order_index
            """
        ),
        {"imported_note": IMPORTED_WORKOUT_NOTE},
    ).mappings()
    for row in category_rows:
        workout_categories[row["workout_id"]].append(row["category"])
    for workout_id, categories in workout_categories.items():
        connection.execute(
            sa.text("UPDATE training_workouts SET category = :category WHERE id = :workout_id"),
            {"category": infer_workout(categories), "workout_id": workout_id},
        )

    bodyweights: dict[str, list[float]] = defaultdict(list)
    bodyweight_rows = connection.execute(
        sa.text(
            """
            SELECT workout.workout_date, workout_set.bodyweight_kg
            FROM training_workouts AS workout
            JOIN workout_movements AS movement ON movement.workout_id = workout.id
            JOIN workout_sets AS workout_set ON workout_set.movement_id = movement.id
            WHERE workout.notes = :imported_note
              AND workout_set.bodyweight_kg IS NOT NULL
              AND workout_set.bodyweight_kg > 0
              AND workout_set.bodyweight_kg <= 500
            """
        ),
        {"imported_note": IMPORTED_WORKOUT_NOTE},
    ).mappings()
    for row in bodyweight_rows:
        bodyweights[str(row["workout_date"])].append(float(row["bodyweight_kg"]))

    existing = {
        str(row["measurement_date"]): row
        for row in connection.execute(
            sa.text(
                """
                SELECT id, measurement_date, notes, is_sample
                FROM body_measurements
                """
            )
        ).mappings()
    }
    now = datetime.now(UTC)
    for measurement_date, values in sorted(bodyweights.items()):
        weight_kg = round(float(median(values)), 3)
        measurement = existing.get(measurement_date)
        if measurement is None:
            connection.execute(
                sa.text(
                    """
                    INSERT INTO body_measurements (
                        id, measurement_date, weight_kg, body_fat_pct, notes,
                        is_sample, created_at
                    ) VALUES (
                        :id, :measurement_date, :weight_kg, NULL, :notes, 0, :created_at
                    )
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "measurement_date": measurement_date,
                    "weight_kg": weight_kg,
                    "notes": IMPORTED_BODYWEIGHT_NOTE,
                    "created_at": now,
                },
            )
        elif measurement["is_sample"] or measurement["notes"] == IMPORTED_BODYWEIGHT_NOTE:
            connection.execute(
                sa.text(
                    """
                    UPDATE body_measurements
                    SET weight_kg = :weight_kg,
                        body_fat_pct = CASE WHEN is_sample = 1 THEN NULL ELSE body_fat_pct END,
                        notes = :notes,
                        is_sample = 0
                    WHERE id = :measurement_id
                    """
                ),
                {
                    "weight_kg": weight_kg,
                    "notes": IMPORTED_BODYWEIGHT_NOTE,
                    "measurement_id": measurement["id"],
                },
            )


def downgrade() -> None:
    # This migration repairs user data in place; the original inferred values cannot
    # be reconstructed reliably, so downgrading intentionally leaves the repair intact.
    pass
