"""Account-owned split cycles, pinned to calendar days or following logged workouts."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import groupby

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import TrainingWorkout, WorkoutCategory
from .tracker_schemas import (
    SplitMissedDay,
    SplitProgression,
    SplitShift,
    TrainingSplit,
    TrainingSplitRead,
    WorkoutRecommendationRead,
)
from .training_metrics import get_setting, set_setting
from .workout_types import workout_type_catalog

TRAINING_SPLIT_KEY = "training_split"
TRAINING_SPLIT_SHIFTS_KEY = "training_split_shifts"
# Missed split days are reported for this long, enough for every month the calendar opens with.
MISSED_DAYS_LOOKBACK = timedelta(days=366)


def saved_training_split(db: Session, user_id: str) -> TrainingSplit | None:
    stored = get_setting(db, user_id, TRAINING_SPLIT_KEY, "")
    if stored:
        try:
            return TrainingSplit.model_validate_json(stored)
        except ValueError:
            pass
    return None


class StoredShifts(BaseModel):
    # The schedule the shifts were made for. A new start date, schedule or day order makes their
    # steps meaningless, so they are ignored rather than migrated.
    start_date: date
    progression: SplitProgression
    steps: list[str | None]
    shifts: list[SplitShift] = []


def _schedule(split: TrainingSplit) -> tuple[date, SplitProgression, list[str | None]]:
    return split.start_date, split.progression, [step.workout_type_id for step in split.steps]


def saved_shifts(db: Session, user_id: str, split: TrainingSplit) -> list[SplitShift]:
    """The split's skips, oldest first, if they were made for this schedule."""
    stored = get_setting(db, user_id, TRAINING_SPLIT_SHIFTS_KEY, "")
    if not stored:
        return []
    try:
        record = StoredShifts.model_validate_json(stored)
    except ValueError:
        return []
    if (record.start_date, record.progression, record.steps) != _schedule(split):
        return []
    return sorted(
        (shift for shift in record.shifts if shift.step < len(split.steps)),
        key=lambda shift: shift.from_date,
    )


def calendar_step(split: TrainingSplit, shifts: Sequence[SplitShift], day: date) -> int:
    """A calendar split's step on ``day``: counted from the latest shift by then, else the start."""
    anchor = next((shift for shift in reversed(shifts) if shift.from_date <= day), None)
    if anchor is None:
        return (day - split.start_date).days % len(split.steps)
    return (anchor.step + (day - anchor.from_date).days) % len(split.steps)


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
    # Past days whose planned workout was not done, with that workout's type.
    missed: tuple[tuple[date, str], ...] = ()


def follow_progress(
    split: TrainingSplit,
    logged: list[tuple[date, str]],
    today: date,
    shifts: Sequence[SplitShift] = (),
) -> SplitProgress:
    """Replay logged workouts through a split that only advances when its workouts are done.

    Each logged workout moves the split past the next day of that type. A day with no split
    workout completes a planned rest, or else saves one rest that the next planned rest absorbs.
    At most one rest is ever saved, so a further day without the planned workout is missed.
    A shift puts the split on its step at the start of its day, before that day's workouts.
    """
    steps = [step.workout_type_id for step in split.steps]
    size = len(steps)
    index, saved = 0, False
    missed: list[tuple[date, str]] = []
    shift_on = {shift.from_date: shift for shift in shifts}

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
        if (shift := shift_on.get(day)) is not None:
            index, saved = shift.step, shift.rest_saved
        for type_id in by_day.get(day, []):
            offset = next((n for n in range(size) if steps[(index + n) % size] == type_id), None)
            if offset is None:
                continue
            index = arrive((index + offset + 1) % size)
            progressed = True
        if day < today and not progressed:
            planned = steps[index]
            if planned is None:
                index = (index + 1) % size
            elif saved:
                missed.append((day, planned))
            else:
                saved = True
        day += timedelta(days=1)
    # A day skipped after today's workout is logged takes effect tomorrow, where it is saved.
    if progressed and (shift := shift_on.get(today + timedelta(days=1))) is not None:
        index, saved = shift.step, shift.rest_saved
    return SplitProgress(
        index, saved, today + timedelta(days=1) if progressed else today, tuple(missed)
    )


def calendar_missed_days(
    split: TrainingSplit,
    logged: list[tuple[date, str]],
    start: date,
    today: date,
    shifts: Sequence[SplitShift] = (),
) -> list[tuple[date, str]]:
    """Days from ``start`` to yesterday that a calendar split gave a workout type not logged."""
    done = set(logged)
    missed = []
    day = max(start, split.start_date)
    while day < today:
        planned = split.steps[calendar_step(split, shifts, day)].workout_type_id
        if planned is not None and (day, planned) not in done:
            missed.append((day, planned))
        day += timedelta(days=1)
    return missed


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
    db: Session,
    user_id: str,
    split: TrainingSplit,
    today: date,
    shifts: Sequence[SplitShift] = (),
) -> SplitProgress | None:
    if split.progression != "workouts":
        return None
    if today < split.start_date:
        return SplitProgress(0, False, split.start_date)
    logged = logged_split_workouts(db, user_id, split.start_date, today)
    return follow_progress(split, logged, today, shifts)


def split_read(
    db: Session, user_id: str, split: TrainingSplit | None, today: date
) -> TrainingSplitRead | None:
    if split is None:
        return None
    shifts = saved_shifts(db, user_id, split)
    progress = split_progress(db, user_id, split, today, shifts)
    since = today - MISSED_DAYS_LOOKBACK
    if not split.enabled:
        missed: Sequence[tuple[date, str]] = ()
    elif progress:
        missed = progress.missed
    else:
        missed = calendar_missed_days(
            split, logged_split_workouts(db, user_id, since, today), since, today, shifts
        )
    return TrainingSplitRead(
        **split.model_dump(),
        next_step=progress.step if progress else None,
        rest_saved=progress.rest_saved if progress else False,
        next_date=progress.next_date if progress else None,
        missed_days=[
            SplitMissedDay(workout_date=day, workout_type_id=type_id)
            for day, type_id in missed
            if day >= since
        ],
        shift=shifts[-1] if shifts else None,
    )


def shift_split(
    db: Session, user_id: str, step: int, rest_saved: bool, today: date
) -> TrainingSplit:
    """Save that the active split's next day is ``step``: a skip or its Undo.

    A calendar split moves from today. A workout-following split moves from its next day, which
    is tomorrow once today's workout is logged. One shift is kept per day, the latest winning.
    """
    split = saved_training_split(db, user_id)
    if split is None or not split.enabled:
        raise HTTPException(422, "Turn on a split first.")
    if step >= len(split.steps):
        raise HTTPException(422, "Choose a day in your split.")
    if today < split.start_date:
        raise HTTPException(422, "Your split hasn't started yet.")
    shifts = saved_shifts(db, user_id, split)
    if split.progression == "workouts":
        progress = split_progress(db, user_id, split, today, shifts)
        from_date = progress.next_date if progress else today
    else:
        from_date, rest_saved = today, False
    kept = [shift for shift in shifts if shift.from_date != from_date]
    kept.append(SplitShift(from_date=from_date, step=step, rest_saved=rest_saved))
    kept.sort(key=lambda shift: shift.from_date)
    # Older shifts only map days beyond the missed-day lookback, except the last one before it.
    cutoff = today - MISSED_DAYS_LOOKBACK
    older = [shift for shift in kept if shift.from_date < cutoff]
    kept = older[-1:] + [shift for shift in kept if shift.from_date >= cutoff]
    start_date, progression, steps = _schedule(split)
    record = StoredShifts(start_date=start_date, progression=progression, steps=steps, shifts=kept)
    set_setting(db, user_id, TRAINING_SPLIT_SHIFTS_KEY, record.model_dump_json())
    return split


def split_recommendation(
    db: Session, user_id: str, today: date
) -> WorkoutRecommendationRead | None:
    split = saved_training_split(db, user_id)
    if split is None or not split.enabled:
        return None
    scheduled_date = max(today, split.start_date)
    shifts = saved_shifts(db, user_id, split)
    progress = split_progress(db, user_id, split, today, shifts)
    index = progress.step if progress else calendar_step(split, shifts, scheduled_date)
    recommendation = _split_day(db, user_id, split, index, scheduled_date, progress)
    if recommendation.is_rest_day:
        # What starting a workout on the rest day trains: the next training day of the cycle.
        for ahead in range(1, len(split.steps)):
            if split.steps[(index + ahead) % len(split.steps)].workout_type_id is None:
                continue
            following = _split_day(
                db,
                user_id,
                split,
                (index + ahead) % len(split.steps),
                scheduled_date + timedelta(days=ahead),
                None,
            )
            if not following.needs_split_update:
                recommendation.next_training_day = following
            break
    return recommendation


def _split_day(
    db: Session,
    user_id: str,
    split: TrainingSplit,
    index: int,
    scheduled_date: date,
    progress: SplitProgress | None,
) -> WorkoutRecommendationRead:
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
