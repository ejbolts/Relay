"""Exercises saved to a workout type, so starting that type fills them in without a split."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .accounts import no_store
from .auth import CurrentUser, get_current_user
from .database import get_db
from .exercise_merge import exercise_aliases
from .models import Exercise, UserSetting
from .tracker import bump_workout_cache_revision
from .tracker_schemas import (
    ExerciseRead,
    RoutineMovementRead,
    WorkoutTypeExercises,
    WorkoutTypeExercisesRead,
)
from .training_metrics import set_setting
from .workout_types import workout_type_catalog

PREFIX = "type_exercises:"
Db = Annotated[Session, Depends(get_db)]
router = APIRouter(
    prefix="/api/workout-type-exercises",
    tags=["workout types"],
    dependencies=[Depends(no_store), Depends(get_current_user)],
)


def read_saved(
    db: Session, user_id: str, type_id: str, content: WorkoutTypeExercises
) -> WorkoutTypeExercisesRead:
    aliases = exercise_aliases(db, user_id)
    exercises = {
        item.id: item for item in db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    }
    movements = []
    for movement in content.movements:
        exercise = exercises.get(aliases.get(movement.exercise_id, movement.exercise_id))
        # A deleted exercise drops out rather than breaking the whole list.
        if exercise is None:
            continue
        movements.append(
            RoutineMovementRead(
                **movement.model_dump(exclude={"exercise_id"}),
                exercise_id=exercise.id,
                exercise=ExerciseRead.model_validate(exercise).model_copy(
                    update={"is_favorite": False}
                ),
            )
        )
    return WorkoutTypeExercisesRead(workout_type_id=type_id, movements=movements)


@router.get("", response_model=list[WorkoutTypeExercisesRead])
def list_type_exercises(db: Db, user: CurrentUser):
    known = {item.id for item in workout_type_catalog(db, user.id)}
    rows = db.scalars(
        select(UserSetting)
        .where(UserSetting.user_id == user.id, UserSetting.key.startswith(PREFIX))
        .order_by(UserSetting.key)
    )
    result = []
    for row in rows:
        type_id = row.key[len(PREFIX) :]
        if type_id in known:
            content = WorkoutTypeExercises.model_validate_json(row.value)
            result.append(read_saved(db, user.id, type_id, content))
    return result


@router.put(
    "/{type_id}",
    response_model=WorkoutTypeExercisesRead,
    dependencies=[Depends(limit_save_rate)],
)
def save_type_exercises(type_id: str, payload: WorkoutTypeExercises, db: Db, user: CurrentUser):
    if type_id not in {item.id for item in workout_type_catalog(db, user.id)}:
        raise HTTPException(404, "Workout type was not found.")
    aliases = exercise_aliases(db, user.id)
    owned = set(db.scalars(select(Exercise.id).where(Exercise.user_id == user.id)))
    for movement in payload.movements:
        movement.exercise_id = aliases.get(movement.exercise_id, movement.exercise_id)
        if movement.exercise_id not in owned:
            raise HTTPException(422, "Choose exercises from your own library.")
    key = PREFIX + type_id
    if payload.movements:
        set_setting(db, user.id, key, payload.model_dump_json())
    else:
        row = db.get(UserSetting, (user.id, key))
        if row is not None:
            db.delete(row)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    return read_saved(db, user.id, type_id, payload)
