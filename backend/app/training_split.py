"""Account-owned split cycles, pinned to calendar days or following logged workouts."""

from dataclasses import dataclass
from datetime import date, timedelta
from itertools import groupby

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import TrainingWorkout, WorkoutCategory
from .tracker_schemas import TrainingSplit, TrainingSplitRead, WorkoutRecommendationRead
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


@dataclass(frozen=True)
class SplitProgress:
    step: int
    rest_saved: bool
    # The first day the next step can happen: tomorrow once today's workout is logged.
    next_date: date


def follow_progress(
    split: TrainingSplit, logged: list[tuple[date, str]], today: date
) -> SplitProgress:
    """Replay logged workouts through a split that only advances when its workouts are done.

    Each logged workout moves the split past the next day of that type. A day with no split
    workout completes a planned rest, or else saves one rest that the next planned rest absorbs.
    At most one rest is ever saved.
    """
    steps = [step.workout_type_id for step in split.steps]
    size = len(steps)
    index, saved = 0, False

    def arrive(position: int) -> int:
        nonlocal saved
        if steps[position] is None and saved:
            saved = False
            return (position + 1) % size
        return position

    by_day = {
        day: [type_id for _, type_id in items] for day, items in groupby(logged, lambda x: x[0])
    }
    day = split.start_date
    progressed = False
    while day <= today:
        progressed = False
        for type_id in by_day.get(day, []):
            offset = next((n for n in range(size) if steps[(index + n) % size] == type_id), None)
            if offset is None:
                continue
            index = arrive((index + offset + 1) % size)
            progressed = True
        if day < today and not progressed:
            if steps[index] is None:
                index = (index + 1) % size
            else:
                saved = True
        day += timedelta(days=1)
    return SplitProgress(index, saved, today + timedelta(days=1) if progressed else today)


def logged_split_workouts(
    db: Session, user_id: str, start: date, end: date
) -> list[tuple[date, str]]:
    rows = db.execute(
        select(
            TrainingWorkout.workout_date,
            TrainingWorkout.workout_type_id,
            TrainingWorkout.category,
        )
        .where(
            TrainingWorkout.user_id == user_id,
            TrainingWorkout.is_sample.is_(False),
            TrainingWorkout.workout_date >= start,
            TrainingWorkout.workout_date <= end,
        )
        .order_by(
            TrainingWorkout.workout_date,
            TrainingWorkout.start_time,
            TrainingWorkout.created_at,
        )
    )
    return [(day, type_id or category.value) for day, type_id, category in rows]


def split_progress(
    db: Session, user_id: str, split: TrainingSplit, today: date
) -> SplitProgress | None:
    if split.progression != "workouts":
        return None
    if today < split.start_date:
        return SplitProgress(0, False, split.start_date)
    logged = logged_split_workouts(db, user_id, split.start_date, today)
    return follow_progress(split, logged, today)


def split_read(
    db: Session, user_id: str, split: TrainingSplit | None, today: date
) -> TrainingSplitRead | None:
    if split is None:
        return None
    progress = split_progress(db, user_id, split, today)
    return TrainingSplitRead(
        **split.model_dump(),
        next_step=progress.step if progress else None,
        rest_saved=progress.rest_saved if progress else False,
        next_date=progress.next_date if progress else None,
    )


def split_recommendation(
    db: Session, user_id: str, today: date
) -> WorkoutRecommendationRead | None:
    split = saved_training_split(db, user_id)
    if split is None or not split.enabled:
        return None
    scheduled_date = max(today, split.start_date)
    progress = split_progress(db, user_id, split, today)
    index = (
        progress.step if progress else (scheduled_date - split.start_date).days % len(split.steps)
    )
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
        if progress and progress.rest_saved:
            reason += " Your next rest day is skipped because you've already rested."
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
