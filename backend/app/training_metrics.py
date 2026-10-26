"""Authoritative training calculations shared by APIs and history rebuilds.

Rules:
* Epley estimated 1RM = weight * (1 + reps / 30), for 1-30 reps.
* Warm-ups never count as working volume or PRs. Drop sets do count.
* A failed set counts toward muscle volume when at least one rep was completed,
  but is PR eligible only when its configured target reps were completed.
* Primary and secondary muscle contributions default to 1.0 and 0.5.
* Weight PRs beat the exercise's heaviest completed working set. Volume PRs beat
  its best reps at the same weight. First attempts establish a baseline.
* PRs compare canonical kilograms rounded to four decimals, independently of
  display units. Estimated 1RM remains a progress metric, not a PR trigger.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from math import floor
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from .models import (
    Exercise,
    ExerciseKind,
    ExerciseMuscleContribution,
    MuscleRole,
    PersonalRecord,
    PersonalRecordType,
    SetType,
    TrainingWorkout,
    UserSetting,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSet,
)

KG_TO_LB = 2.2046226218
EPLEY_FORMULA = "Epley: weight × (1 + reps ÷ 30), reps 1–30"

# Exercise-specific bookkeeping estimates: direct work 1.0, meaningful indirect work 0.5.
# See docs/EXERCISE-MUSCLE-CREDITS.md for the full audit, assumptions and references.
# These are not measured fractions of hypertrophy or every muscle activated during a lift.
DEFAULT_MUSCLE_MAPPING: dict[str, tuple[tuple[str, MuscleRole, float], ...]] = {
    "Barbell Bench Press": (
        ("Pectorals", MuscleRole.PRIMARY, 1.0),
        ("Triceps", MuscleRole.SECONDARY, 0.5),
        ("Front delts", MuscleRole.SECONDARY, 0.5),
    ),
    "Incline Dumbbell Press": (
        ("Pectorals", MuscleRole.PRIMARY, 1.0),
        ("Front delts", MuscleRole.SECONDARY, 0.5),
        ("Triceps", MuscleRole.SECONDARY, 0.5),
    ),
    "Overhead Press": (
        ("Front delts", MuscleRole.PRIMARY, 1.0),
        ("Side delts", MuscleRole.SECONDARY, 0.5),
        ("Triceps", MuscleRole.SECONDARY, 0.5),
    ),
    "Dumbbell Shoulder Press": (
        ("Front delts", MuscleRole.PRIMARY, 1.0),
        ("Side delts", MuscleRole.SECONDARY, 0.5),
        ("Triceps", MuscleRole.SECONDARY, 0.5),
    ),
    "Lateral Raise": (
        ("Side delts", MuscleRole.PRIMARY, 1.0),
        ("Upper traps", MuscleRole.SECONDARY, 0.5),
    ),
    "Cable Fly": (
        ("Pectorals", MuscleRole.PRIMARY, 1.0),
        ("Front delts", MuscleRole.SECONDARY, 0.5),
    ),
    "Pec Deck": (("Pectorals", MuscleRole.PRIMARY, 1.0),),
    "Triceps Pushdown": (("Triceps", MuscleRole.PRIMARY, 1.0),),
    "Single-Arm Cable Triceps Pushdown": (("Triceps", MuscleRole.PRIMARY, 1.0),),
    "Triceps Machine Extension": (("Triceps", MuscleRole.PRIMARY, 1.0),),
    "Dips": (
        ("Pectorals", MuscleRole.PRIMARY, 1.0),
        ("Triceps", MuscleRole.PRIMARY, 1.0),
        ("Front delts", MuscleRole.SECONDARY, 0.5),
    ),
    "Deadlift": (
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Hamstrings", MuscleRole.PRIMARY, 1.0),
        ("Spinal erectors", MuscleRole.PRIMARY, 1.0),
        ("Quadriceps", MuscleRole.SECONDARY, 0.5),
        ("Mid / Upper Back", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Barbell Row": (
        ("Mid / Upper Back", MuscleRole.PRIMARY, 1.0),
        ("Lats", MuscleRole.PRIMARY, 1.0),
        ("Biceps", MuscleRole.SECONDARY, 0.5),
        ("Rear deltoids", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
        ("Spinal erectors", MuscleRole.SECONDARY, 0.5),
    ),
    "Pull-up": (
        ("Lats", MuscleRole.PRIMARY, 1.0),
        ("Biceps", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Lat Pulldown": (
        ("Lats", MuscleRole.PRIMARY, 1.0),
        ("Biceps", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Single-Arm Lat Pulldown (Machine)": (
        ("Lats", MuscleRole.PRIMARY, 1.0),
        ("Biceps", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Seated Cable Row": (
        ("Mid / Upper Back", MuscleRole.PRIMARY, 1.0),
        ("Lats", MuscleRole.PRIMARY, 1.0),
        ("Biceps", MuscleRole.SECONDARY, 0.5),
        ("Rear deltoids", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Seated Machine Row": (
        ("Mid / Upper Back", MuscleRole.PRIMARY, 1.0),
        ("Lats", MuscleRole.PRIMARY, 1.0),
        ("Biceps", MuscleRole.SECONDARY, 0.5),
        ("Rear deltoids", MuscleRole.SECONDARY, 0.5),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Face Pull": (
        ("Rear deltoids", MuscleRole.PRIMARY, 1.0),
        ("Mid / Upper Back", MuscleRole.SECONDARY, 0.5),
    ),
    "Cable Shoulder Extensions": (("Rear deltoids", MuscleRole.PRIMARY, 1.0),),
    "Barbell Curl": (("Biceps", MuscleRole.PRIMARY, 1.0), ("Forearms", MuscleRole.SECONDARY, 0.5)),
    "Machine Bicep Preacher Curl": (
        ("Biceps", MuscleRole.PRIMARY, 1.0),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Single-Arm Preacher Curl": (
        ("Biceps", MuscleRole.PRIMARY, 1.0),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Hammer Curl": (
        ("Biceps", MuscleRole.PRIMARY, 1.0),
        ("Forearms", MuscleRole.SECONDARY, 0.5),
    ),
    "Back Squat": (
        ("Quadriceps", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Adductors", MuscleRole.SECONDARY, 0.5),
    ),
    "Front Squat": (
        ("Quadriceps", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.SECONDARY, 0.5),
        ("Adductors", MuscleRole.SECONDARY, 0.5),
    ),
    "Romanian Deadlift": (
        ("Hamstrings", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Spinal erectors", MuscleRole.SECONDARY, 0.5),
    ),
    "Leg Press": (
        ("Quadriceps", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Adductors", MuscleRole.SECONDARY, 0.5),
    ),
    "Single Leg Press": (
        ("Quadriceps", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Adductors", MuscleRole.SECONDARY, 0.5),
    ),
    "Bulgarian Split Squat": (
        ("Quadriceps", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Adductors", MuscleRole.SECONDARY, 0.5),
    ),
    "Leg Extension": (("Quadriceps", MuscleRole.PRIMARY, 1.0),),
    "Seated Leg Curl": (
        ("Hamstrings", MuscleRole.PRIMARY, 1.0),
        ("Calves", MuscleRole.SECONDARY, 0.5),
    ),
    "Lying Leg Curl": (
        ("Hamstrings", MuscleRole.PRIMARY, 1.0),
        ("Calves", MuscleRole.SECONDARY, 0.5),
    ),
    "Hip Thrust": (
        ("Glutes", MuscleRole.PRIMARY, 1.0),
        ("Hamstrings", MuscleRole.SECONDARY, 0.5),
        ("Adductors", MuscleRole.SECONDARY, 0.5),
    ),
    "Standing Calf Raise": (("Calves", MuscleRole.PRIMARY, 1.0),),
    "Back Extension Machine": (
        ("Spinal erectors", MuscleRole.PRIMARY, 1.0),
        ("Glutes", MuscleRole.SECONDARY, 0.5),
        ("Hamstrings", MuscleRole.PRIMARY, 1.0),
    ),
    "Seated Ab Crunch Machine": (("Core", MuscleRole.PRIMARY, 1.0),),
    "Plank": (("Core", MuscleRole.PRIMARY, 1.0),),
    "Hanging Leg Raise": (
        ("Core", MuscleRole.PRIMARY, 1.0),
        ("Hip flexors", MuscleRole.PRIMARY, 1.0),
    ),
}

MUSCLE_GROUP_ALIASES = {
    "Upper back": "Mid / Upper Back",
    "Upper pectorals": "Pectorals",
    "Anterior deltoids": "Front delts",
    "Lateral deltoids": "Side delts",
    "Upper trapezius": "Upper traps",
}
HIDDEN_MUSCLE_GROUPS = {"External rotators", "Brachialis"}


def get_setting(db: Session, user_id: str, key: str, default: str) -> str:
    setting = db.get(UserSetting, (user_id, key))
    return setting.value if setting else default


def set_setting(db: Session, user_id: str, key: str, value: str) -> None:
    setting = db.get(UserSetting, (user_id, key))
    if setting:
        setting.value = value
    else:
        db.add(UserSetting(user_id=user_id, key=key, value=value))


def preferred_weight_unit(db: Session, user_id: str) -> str:
    return "lb" if get_setting(db, user_id, "preferred_weight_unit", "kg") == "lb" else "kg"


def normalized_weight(weight_kg: float, unit: str) -> float:
    return round(weight_kg * KG_TO_LB if unit == "lb" else weight_kg, 1)


def estimated_one_rep_max(weight_kg: float, reps: int) -> float:
    if reps < 1 or reps > 30:
        return 0.0
    return weight_kg * (1 + reps / 30)


def is_warmup(item: WorkoutSet) -> bool:
    return item.set_type == SetType.WARMUP or item.warmup


def is_working_set(item: WorkoutSet) -> bool:
    return bool(
        item.completed and not is_warmup(item) and (not item.failed or (item.reps or 0) > 0)
    )


def is_pr_eligible(item: WorkoutSet) -> bool:
    if not item.completed or is_warmup(item):
        return False
    if item.failed:
        return item.target_reps is not None and (item.reps or 0) >= item.target_reps
    return True


def muscle_credits(
    exercise: Exercise, *, include_partial: bool | None = None
) -> list[tuple[str, float]]:
    if exercise.kind == ExerciseKind.CARDIO or exercise.category == WorkoutCategory.CARDIO:
        return []
    if exercise.muscle_contributions:
        credits: dict[str, float] = {}
        for item in exercise.muscle_contributions:
            if item.muscle_name in HIDDEN_MUSCLE_GROUPS:
                continue
            muscle_name = MUSCLE_GROUP_ALIASES.get(item.muscle_name, item.muscle_name)
            credits[muscle_name] = max(credits.get(muscle_name, 0), item.contribution_factor)
        if include_partial is None:
            include_partial = getattr(exercise, "partial_sets_enabled", True) is not False
        return [(name, sets) for name, sets in credits.items() if sets >= 1 or include_partial]
    # Custom exercises retain the user's explicit muscle field until they edit detailed credits.
    muscle_name = exercise.muscle_group.strip()
    if not muscle_name or muscle_name in HIDDEN_MUSCLE_GROUPS:
        return []
    return [(MUSCLE_GROUP_ALIASES.get(muscle_name, muscle_name), 1.0)]


def muscle_volume(workouts: list[TrainingWorkout], start: date, end: date) -> dict[str, float]:
    totals: dict[str, float] = defaultdict(float)
    for workout in workouts:
        if not start <= workout.workout_date <= end:
            continue
        for movement in workout.movements:
            credits = muscle_credits(movement.exercise)
            for item in movement.sets:
                if is_working_set(item):
                    for muscle, contribution in credits:
                        totals[muscle] += contribution
    return dict(totals)


def seed_muscle_mappings(db: Session, user_id: str) -> None:
    exercises = {
        item.name: item
        for item in db.scalars(
            select(Exercise)
            .where(Exercise.user_id == user_id)
            .options(selectinload(Exercise.muscle_contributions))
        )
    }
    changed = False
    for exercise_name, mappings in DEFAULT_MUSCLE_MAPPING.items():
        exercise = exercises.get(exercise_name)
        if not exercise or exercise.is_custom:
            continue
        expected_muscles = {muscle for muscle, _, _ in mappings}
        for contribution in list(exercise.muscle_contributions):
            if contribution.muscle_name not in expected_muscles:
                exercise.muscle_contributions.remove(contribution)
                changed = True
        existing = {
            contribution.muscle_name: contribution for contribution in exercise.muscle_contributions
        }
        for muscle, role, factor in mappings:
            contribution = existing.get(muscle)
            if contribution:
                if contribution.role != role or contribution.contribution_factor != factor:
                    contribution.role = role
                    contribution.contribution_factor = factor
                    changed = True
            else:
                exercise.muscle_contributions.append(
                    ExerciseMuscleContribution(
                        muscle_name=muscle, role=role, contribution_factor=factor
                    )
                )
                changed = True
    if changed:
        # Workout snapshots contain these credits; invalidate old snapshots after a default update.
        set_setting(db, user_id, "workout_cache_revision", str(uuid4()))
        db.commit()


def workout_query(user_id: str):
    return (
        select(TrainingWorkout)
        .where(TrainingWorkout.user_id == user_id)
        .options(
            selectinload(TrainingWorkout.movements)
            .selectinload(WorkoutMovement.exercise)
            .selectinload(Exercise.muscle_contributions),
            selectinload(TrainingWorkout.movements).selectinload(WorkoutMovement.sets),
        )
    )


def rebuild_personal_records(db: Session, user_id: str) -> None:
    """Rebuild one user's derived milestone rows after any of their workout mutations."""
    db.execute(delete(PersonalRecord).where(PersonalRecord.user_id == user_id))
    unit = preferred_weight_unit(db, user_id)
    workouts = list(
        db.scalars(
            workout_query(user_id).order_by(
                TrainingWorkout.workout_date, TrainingWorkout.created_at
            )
        )
    )
    state: dict[str, dict[str, object]] = defaultdict(lambda: {"weight": -1.0, "reps": {}})
    for workout in workouts:
        for movement in sorted(workout.movements, key=lambda item: item.order_index):
            if movement.exercise.kind != ExerciseKind.STRENGTH:
                continue
            current = state[movement.exercise_id]
            for item in sorted(movement.sets, key=lambda set_item: set_item.order_index):
                if (
                    not is_pr_eligible(item)
                    or item.weight_kg is None
                    or item.reps is None
                    or item.reps <= 0
                ):
                    continue
                weight = floor(item.weight_kg * 10_000 + 0.5) / 10_000
                display_weight = normalized_weight(item.weight_kg, unit)
                if float(current["weight"]) >= 0 and weight > float(current["weight"]):
                    db.add(
                        _pr(
                            workout,
                            movement,
                            item,
                            PersonalRecordType.WEIGHT,
                            display_weight,
                            unit,
                            display_weight,
                        )
                    )
                current["weight"] = max(float(current["weight"]), weight)
                if item.reps is not None:
                    rep_bests = current["reps"]
                    assert isinstance(rep_bests, dict)
                    previous_reps = rep_bests.get(weight)
                    if previous_reps is not None and item.reps > int(previous_reps):
                        db.add(
                            _pr(
                                workout,
                                movement,
                                item,
                                PersonalRecordType.REPS_AT_WEIGHT,
                                float(item.reps),
                                "reps",
                                display_weight,
                            )
                        )
                    rep_bests[weight] = max(int(previous_reps or 0), item.reps)
    db.flush()


def _pr(
    workout: TrainingWorkout,
    movement: WorkoutMovement,
    item: WorkoutSet,
    record_type: PersonalRecordType,
    value: float,
    unit: str,
    weight: float | None,
    formula: str | None = None,
) -> PersonalRecord:
    return PersonalRecord(
        user_id=workout.user_id,
        exercise_id=movement.exercise_id,
        workout_id=workout.id,
        set_id=item.id,
        achieved_date=workout.workout_date,
        record_type=record_type,
        value=value,
        unit=unit,
        normalized_weight=weight,
        formula=formula,
    )


def start_of_week(day: date, preference: str = "monday") -> date:
    wanted = {"monday": 0, "sunday": 6, "saturday": 5}.get(preference.casefold(), 0)
    return day - timedelta(days=(day.weekday() - wanted) % 7)
