"""Training time totals shared by account and viewable member profiles."""

from collections import defaultdict
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import CardioSession, Exercise, ExerciseKind, TrainingWorkout, WorkoutMovement
from .tracker_schemas import TrainingTimeRead


def past_year_start(today: date) -> date:
    """The same calendar day a year earlier; 29 February falls back to the 28th."""
    try:
        return today.replace(year=today.year - 1)
    except ValueError:
        return today.replace(year=today.year - 1, day=28)


def training_time_totals(db: Session, user_id: str, since: date | None = None) -> TrainingTimeRead:
    """Exclude sample records and count cardio inside each workout once in Combined.

    ``since`` limits the totals to workouts and cardio sessions dated on or after it.
    """
    has_strength = (
        select(WorkoutMovement.id)
        .join(Exercise, WorkoutMovement.exercise_id == Exercise.id)
        .where(
            WorkoutMovement.workout_id == TrainingWorkout.id,
            Exercise.kind != ExerciseKind.CARDIO,
        )
        .exists()
    )
    workout_query = select(
        TrainingWorkout.id, TrainingWorkout.duration_minutes, has_strength
    ).where(TrainingWorkout.user_id == user_id, TrainingWorkout.is_sample.is_(False))
    session_query = (
        select(CardioSession.source_workout_id, CardioSession.duration_minutes)
        .outerjoin(TrainingWorkout, CardioSession.source_workout_id == TrainingWorkout.id)
        .where(
            CardioSession.user_id == user_id,
            or_(TrainingWorkout.id.is_(None), TrainingWorkout.is_sample.is_(False)),
        )
    )
    if since is not None:
        workout_query = workout_query.where(TrainingWorkout.workout_date >= since)
        session_query = session_query.where(CardioSession.session_date >= since)
    workouts = db.execute(workout_query).all()
    sessions = db.execute(session_query).all()
    cardio_by_workout: defaultdict[str | None, int] = defaultdict(int)
    for workout_id, minutes in sessions:
        cardio_by_workout[workout_id] += minutes
    strength = [minutes or 0 for _, minutes, strength_workout in workouts if strength_workout]
    return TrainingTimeRead(
        workout_minutes=sum(strength),
        workout_count=len(strength),
        cardio_minutes=sum(minutes for _, minutes in sessions),
        cardio_count=len(sessions),
        total_minutes=cardio_by_workout[None]
        + sum(
            max(minutes or 0, cardio_by_workout[workout_id]) for workout_id, minutes, _ in workouts
        ),
    )
