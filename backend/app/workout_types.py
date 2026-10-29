"""Account-specific workout labels, separate from exercise classification."""

from __future__ import annotations

import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import TrainingWorkout, WorkoutCategory, WorkoutType
from .tracker_schemas import TrainingWorkoutCreate, WorkoutTypeColors, WorkoutTypeRead
from .training_metrics import get_setting

COLORS_KEY = "workout_type_colors"
ARCHIVED_KEY = "archived_workout_types"
MAX_CUSTOM_TYPES = 32
DEFAULT_COLORS = WorkoutTypeColors(
    upper="#8b5cf6",
    lower="#f59e0b",
    push="#ef476f",
    pull="#3b82f6",
    full_body="#14b8a6",
    cardio="#22c55e",
    other="#94a3b8",
)
DEFAULT_NAMES = {
    "upper": "Upper body",
    "lower": "Lower body",
    "push": "Push",
    "pull": "Pull",
    "full_body": "Full body",
    "cardio": "Cardio",
    "other": "Other",
}


def type_colors(db: Session, user_id: str) -> WorkoutTypeColors:
    stored = get_setting(db, user_id, COLORS_KEY, "")
    if stored:
        try:
            return WorkoutTypeColors.model_validate_json(stored)
        except ValueError:
            pass
    return DEFAULT_COLORS


def archived_builtins(db: Session, user_id: str) -> set[str]:
    try:
        values = json.loads(get_setting(db, user_id, ARCHIVED_KEY, "[]"))
        return {value for value in values if isinstance(value, str) and value in DEFAULT_NAMES}
    except (ValueError, TypeError):
        return set()


def workout_type_catalog(db: Session, user_id: str) -> list[WorkoutTypeRead]:
    colors = type_colors(db, user_id).model_dump()
    archived = archived_builtins(db, user_id)
    return [
        WorkoutTypeRead(
            id=key, name=name, color=colors[key], is_custom=False, archived=key in archived
        )
        for key, name in DEFAULT_NAMES.items()
    ] + [
        WorkoutTypeRead.model_validate(item)
        for item in db.scalars(
            select(WorkoutType).where(WorkoutType.user_id == user_id).order_by(WorkoutType.name)
        )
    ]


def ensure_unique_name(db: Session, user_id: str, name: str, excluding: str | None = None) -> None:
    if any(
        item.id != excluding and item.name.casefold() == name.casefold()
        for item in workout_type_catalog(db, user_id)
    ):
        raise HTTPException(
            409, "A workout type with this name already exists, including removed types."
        )


def assign_workout_type(
    db: Session,
    user_id: str,
    workout: TrainingWorkout,
    payload: TrainingWorkoutCreate,
    *,
    allow_archived: bool = False,
) -> None:
    # Older clients that do not send the new field can still edit saved custom workouts.
    type_id = payload.workout_type_id
    if "workout_type_id" not in payload.model_fields_set and workout.category == payload.category:
        type_id = workout.workout_type_id
    category_id = payload.category.value
    if type_id in DEFAULT_NAMES:
        if type_id != category_id:
            raise HTTPException(422, "Workout category does not match the selected type.")
        type_id = None
    if type_id:
        custom = db.scalar(
            select(WorkoutType).where(WorkoutType.id == type_id, WorkoutType.user_id == user_id)
        )
        if custom is None:
            raise HTTPException(404, "Workout type was not found.")
        if payload.category != WorkoutCategory.OTHER:
            raise HTTPException(422, "Custom workout types use the other compatibility category.")
        if custom.archived and workout.workout_type_id != custom.id:
            raise HTTPException(
                422, "This workout type has been removed. Restore it before using it."
            )
        workout.workout_type = custom
        workout.workout_type_id = custom.id
    else:
        unchanged = (
            allow_archived
            and bool(workout.id)
            and workout.workout_type_id is None
            and workout.category == payload.category
        )
        if category_id in archived_builtins(db, user_id) and not unchanged:
            raise HTTPException(
                422, "This workout type has been removed. Restore it before using it."
            )
        workout.workout_type = None
        workout.workout_type_id = None
