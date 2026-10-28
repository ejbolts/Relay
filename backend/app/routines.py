"""Saved routines and independent copies, scoped to the profile's existing audience."""

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .accounts import no_store
from .auth import CurrentUser, get_current_user
from .database import get_db
from .models import Exercise, ExerciseMuscleContribution, UserSetting, WorkoutType
from .sharing import viewable_member
from .tracker import bump_workout_cache_revision, workouts_between
from .tracker_schemas import (
    ExerciseRead,
    RoutineActivation,
    RoutineDay,
    RoutineDayRead,
    RoutineInput,
    RoutineMovement,
    RoutineMovementRead,
    RoutineRead,
    RoutineSet,
    TrainingSplit,
    WorkoutTypeRead,
)
from .training_metrics import set_setting
from .training_split import TRAINING_SPLIT_KEY, saved_training_split
from .workout_types import MAX_CUSTOM_TYPES, workout_type_catalog

PREFIX = "routine:"
MAX_ROUTINES = 20
Db = Annotated[Session, Depends(get_db)]
router = APIRouter(
    prefix="/api/routines",
    tags=["routines"],
    dependencies=[Depends(no_store), Depends(get_current_user), Depends(limit_save_rate)],
)


def routine_rows(db: Session, user_id: str) -> list[UserSetting]:
    return list(
        db.scalars(
            select(UserSetting)
            .where(UserSetting.user_id == user_id, UserSetting.key.startswith(PREFIX))
            .order_by(UserSetting.key)
        )
    )


def routine_content(db: Session, user_id: str, routine_id: str) -> RoutineInput:
    row = db.get(UserSetting, (user_id, PREFIX + routine_id))
    if row is None:
        raise HTTPException(404, "Routine not found.")
    return RoutineInput.model_validate_json(row.value)


def read_routine(db: Session, user_id: str, routine_id: str, content: RoutineInput) -> RoutineRead:
    types = {item.id: item for item in workout_type_catalog(db, user_id)}
    exercises = {
        item.id: item for item in db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    }
    return RoutineRead(
        **content.model_dump(exclude={"days"}),
        id=routine_id,
        days=[
            RoutineDayRead(
                workout_type_id=day.workout_type_id,
                workout_type=types.get(day.workout_type_id),
                movements=[
                    RoutineMovementRead(
                        **movement.model_dump(),
                        exercise=ExerciseRead.model_validate(
                            exercises[movement.exercise_id]
                        ).model_copy(update={"is_favorite": False}),
                    )
                    for movement in day.movements
                ],
            )
            for day in content.days
        ],
    )


def validate_content(db: Session, user_id: str, content: RoutineInput) -> None:
    types = {item.id: item for item in workout_type_catalog(db, user_id)}
    ids = set(db.scalars(select(Exercise.id).where(Exercise.user_id == user_id)))
    for day in content.days:
        if day.workout_type_id is not None and (
            day.workout_type_id not in types or types[day.workout_type_id].archived
        ):
            raise HTTPException(422, "Choose an active workout type for every workout day.")
        if any(movement.exercise_id not in ids for movement in day.movements):
            raise HTTPException(422, "Choose exercises from your own library.")


def save_routine(
    db: Session, user_id: str, content: RoutineInput, routine_id: str | None = None
) -> RoutineRead:
    if routine_id is None:
        if len(routine_rows(db, user_id)) >= MAX_ROUTINES:
            raise HTTPException(422, "You can save up to 20 routines.")
        routine_id = str(uuid4())
    validate_content(db, user_id, content)
    set_setting(db, user_id, PREFIX + routine_id, content.model_dump_json())
    active = saved_training_split(db, user_id)
    if active and active.routine_id == routine_id:
        active.name = content.name
        active.steps = TrainingSplit(
            name=content.name,
            start_date=active.start_date,
            steps=[{"workout_type_id": day.workout_type_id} for day in content.days],
        ).steps
        set_setting(db, user_id, TRAINING_SPLIT_KEY, active.model_dump_json())
    bump_workout_cache_revision(db, user_id)
    db.commit()
    return read_routine(db, user_id, routine_id, content)


@router.get("", response_model=list[RoutineRead])
def list_routines(db: Db, user: CurrentUser):
    return [
        read_routine(
            db, user.id, row.key[len(PREFIX) :], RoutineInput.model_validate_json(row.value)
        )
        for row in routine_rows(db, user.id)
    ]


@router.get("/profile/{user_id}", response_model=list[RoutineRead])
def profile_routines(user_id: str, db: Db, user: CurrentUser):
    viewable_member(db, user, user_id)
    result = []
    for row in routine_rows(db, user_id):
        content = RoutineInput.model_validate_json(row.value)
        if content.shared:
            result.append(read_routine(db, user_id, row.key[len(PREFIX) :], content))
    return result


@router.post("", response_model=RoutineRead, status_code=201)
def create_routine(payload: RoutineInput, db: Db, user: CurrentUser):
    return save_routine(db, user.id, payload)


@router.post("/from-split", response_model=RoutineRead, status_code=201)
def capture_split(db: Db, user: CurrentUser):
    split = saved_training_split(db, user.id)
    if split is None:
        raise HTTPException(422, "Save a training split first.")
    workouts = workouts_between(db, user.id)
    days = []
    for step in split.steps:
        type_id = step.workout_type_id
        source = (
            next(
                (
                    workout
                    for workout in workouts
                    if (
                        (workout.workout_type_id or workout.category.value) == type_id
                        and not workout.is_sample
                    )
                ),
                None,
            )
            if type_id
            else None
        )
        days.append(
            RoutineDay(
                workout_type_id=type_id,
                movements=[
                    RoutineMovement(
                        exercise_id=movement.exercise_id,
                        sets=[
                            RoutineSet.model_validate(item, from_attributes=True)
                            for item in movement.sets
                            if item.completed
                        ],
                    )
                    for movement in source.movements
                    if any(item.completed for item in movement.sets)
                ]
                if source
                else [],
            )
        )
    return save_routine(db, user.id, RoutineInput(name=split.name, days=days))


@router.put("/{routine_id}", response_model=RoutineRead)
def update_routine(routine_id: str, payload: RoutineInput, db: Db, user: CurrentUser):
    routine_content(db, user.id, routine_id)
    return save_routine(db, user.id, payload, routine_id)


@router.delete("/{routine_id}", status_code=204)
def delete_routine(routine_id: str, db: Db, user: CurrentUser):
    routine_content(db, user.id, routine_id)
    db.delete(db.get(UserSetting, (user.id, PREFIX + routine_id)))
    split = saved_training_split(db, user.id)
    if split and split.routine_id == routine_id:
        split.routine_id = None
        set_setting(db, user.id, TRAINING_SPLIT_KEY, split.model_dump_json())
    bump_workout_cache_revision(db, user.id)
    db.commit()


@router.post("/{routine_id}/use", response_model=TrainingSplit)
def use_routine(routine_id: str, payload: RoutineActivation, db: Db, user: CurrentUser):
    content = routine_content(db, user.id, routine_id)
    validate_content(db, user.id, content)
    if any(day.workout_type_id and not day.movements for day in content.days):
        raise HTTPException(422, "Add exercises to every workout day before using this routine.")
    split = TrainingSplit(
        name=content.name,
        start_date=payload.start_date,
        routine_id=routine_id,
        steps=[{"workout_type_id": day.workout_type_id} for day in content.days],
    )
    set_setting(db, user.id, TRAINING_SPLIT_KEY, split.model_dump_json())
    bump_workout_cache_revision(db, user.id)
    db.commit()
    return split


@router.post("/profile/{user_id}/{routine_id}/copy", response_model=RoutineRead, status_code=201)
def copy_routine(user_id: str, routine_id: str, db: Db, user: CurrentUser):
    viewable_member(db, user, user_id)
    source = routine_content(db, user_id, routine_id)
    if not source.shared:
        raise HTTPException(404, "Routine not found.")
    if len(routine_rows(db, user.id)) >= MAX_ROUTINES:
        raise HTTPException(422, "You can save up to 20 routines.")
    copied = source.model_copy(deep=True)
    copied.shared = False
    own_types = workout_type_catalog(db, user.id)
    source_types = {item.id: item for item in workout_type_catalog(db, user_id)}
    type_map = {}
    for day in copied.days:
        if day.workout_type_id is None:
            continue
        original = source_types[day.workout_type_id]
        match = next(
            (
                item
                for item in own_types
                if item.name.casefold() == original.name.casefold() and not item.archived
            ),
            None,
        )
        if original.id not in type_map:
            if match is None:
                if sum(item.is_custom for item in own_types) >= MAX_CUSTOM_TYPES:
                    raise HTTPException(
                        422, "Remove a custom workout type before copying this routine."
                    )
                name = original.name
                index = 2
                while any(item.name.casefold() == name.casefold() for item in own_types):
                    name = f"{original.name[:32]} ({index})"
                    index += 1
                created = WorkoutType(user_id=user.id, name=name, color=original.color)
                db.add(created)
                db.flush()
                match = WorkoutTypeRead.model_validate(created)
                own_types.append(match)
            type_map[original.id] = match.id
        day.workout_type_id = type_map[original.id]
    own_exercises = list(db.scalars(select(Exercise).where(Exercise.user_id == user.id)))
    exercise_map = {}
    for day in copied.days:
        for movement in day.movements:
            original_id = movement.exercise_id
            if original_id not in exercise_map:
                original = db.scalar(
                    select(Exercise).where(Exercise.id == original_id, Exercise.user_id == user_id)
                )
                if original is None:
                    raise HTTPException(404, "An exercise in this routine is unavailable.")
                match = next(
                    (
                        item
                        for item in own_exercises
                        if item.name.casefold() == original.name.casefold()
                        and item.kind == original.kind
                    ),
                    None,
                )
                if match is None:
                    name = original.name
                    index = 2
                    while any(item.name.casefold() == name.casefold() for item in own_exercises):
                        name = f"{original.name[:150]} ({index})"
                        index += 1
                    match = Exercise(
                        user_id=user.id,
                        name=name,
                        category=original.category,
                        kind=original.kind,
                        muscle_group=original.muscle_group,
                        equipment=original.equipment,
                        is_custom=True,
                        is_favorite=False,
                        muscle_contributions=[
                            ExerciseMuscleContribution(
                                muscle_name=item.muscle_name,
                                role=item.role,
                                contribution_factor=item.contribution_factor,
                            )
                            for item in original.muscle_contributions
                        ],
                    )
                    db.add(match)
                    db.flush()
                    own_exercises.append(match)
                exercise_map[original_id] = match.id
            movement.exercise_id = exercise_map[original_id]
    return save_routine(db, user.id, copied)
