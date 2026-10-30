"""Account-owned calendar-day cycles, independent of completed workout order."""

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import WorkoutCategory
from .tracker_schemas import TrainingSplit, WorkoutRecommendationRead
from .training_metrics import get_setting
from .workout_types import workout_type_catalog

TRAINING_SPLIT_KEY = "training_split"


def saved_training_split(db: Session, user_id: str) -> TrainingSplit | None:
    stored = get_setting(db, user_id, TRAINING_SPLIT_KEY, "")
    if stored:
        try:
            return TrainingSplit.model_validate_json(stored)
        except ValueError:
            pass
    return None


def validate_split_types(db: Session, user_id: str, split: TrainingSplit) -> None:
    types = {item.id: item for item in workout_type_catalog(db, user_id)}
    for step in split.steps:
        if step.workout_type_id is None:
            continue
        workout_type = types.get(step.workout_type_id)
        if workout_type is None or (split.enabled and workout_type.archived):
            raise HTTPException(422, "Choose an active workout type for every workout day.")


def split_recommendation(
    db: Session, user_id: str, today: date
) -> WorkoutRecommendationRead | None:
    split = saved_training_split(db, user_id)
    if split is None or not split.enabled:
        return None
    scheduled_date = max(today, split.start_date)
    index = (scheduled_date - split.start_date).days % len(split.steps)
    type_id = split.steps[index].workout_type_id
    is_rest = type_id is None
    workout_type = next(
        (item for item in workout_type_catalog(db, user_id) if item.id == type_id), None
    )
    unavailable = not is_rest and (workout_type is None or workout_type.archived)
    category = (
        WorkoutCategory(workout_type.id)
        if workout_type is not None and not workout_type.is_custom
        else WorkoutCategory.OTHER
    )
    if unavailable:
        name = "Update your split"
        reason = "A workout type in your split was removed. Restore it or change this day."
    elif is_rest:
        name = "Rest day"
        reason = f"Rest day in {split.name}."
    else:
        name = f"{workout_type.name} workout"
        reason = f"Day {index + 1} of your {len(split.steps)}-day {split.name} cycle."
    routine_day = None
    if split.routine_id and not is_rest and not unavailable:
        from .routines import read_routine, routine_content

        content = routine_content(db, user_id, split.routine_id)
        if index < len(content.days) and content.days[index].workout_type_id == type_id:
            routine_day = read_routine(db, user_id, split.routine_id, content).days[index]
    return WorkoutRecommendationRead(
        category=category,
        session_name=name,
        rotation_next=category,
        reason=reason,
        muscle_frequency=[],
        workout_type=workout_type,
        is_rest_day=is_rest,
        needs_split_update=unavailable,
        scheduled_date=scheduled_date,
        split_name=split.name,
        routine_day=routine_day,
    )
