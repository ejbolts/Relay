from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    BodyMeasurement,
    Exercise,
    TrainingWorkout,
    UserSetting,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSet,
)

SAMPLE_SEED_KEY = "sample_data_seeded"


def seed_sample_workouts(db: Session, user_id: str) -> int:
    """Seed an evaluation week once per user, never mixing samples into an existing log."""
    if db.get(UserSetting, (user_id, SAMPLE_SEED_KEY)):
        return 0
    if db.scalar(select(func.count(TrainingWorkout.id)).where(TrainingWorkout.user_id == user_id)):
        db.add(UserSetting(user_id=user_id, key=SAMPLE_SEED_KEY, value="skipped_existing_workouts"))
        db.commit()
        return 0
    exercises = {
        item.name: item for item in db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    }
    today = date.today()
    specs = (
        (
            4,
            "Sample push session",
            WorkoutCategory.PUSH,
            (
                ("Barbell Bench Press", ((60, 10, 6.5), (75, 8, 7.5), (82.5, 6, 8.5))),
                ("Incline Dumbbell Press", ((24, 10, 7), (28, 9, 8), (30, 7, 9))),
                ("Lateral Raise", ((8, 15, 7), (10, 12, 8), (10, 11, 8.5))),
                ("Triceps Pushdown", ((36, 12, 7), (41, 10, 8), (41, 9, 9))),
            ),
        ),
        (
            3,
            "Sample lower session",
            WorkoutCategory.LOWER,
            (
                ("Back Squat", ((70, 10, 6.5), (90, 8, 7.5), (100, 6, 8.5))),
                ("Romanian Deadlift", ((65, 10, 7), (80, 8, 8), (85, 7, 8.5))),
                ("Leg Press", ((120, 12, 7), (150, 10, 8), (170, 8, 9))),
                ("Leg Extension", ((45, 12, 7), (55, 11, 8), (55, 10, 8.5))),
            ),
        ),
        (
            2,
            "Sample pull session",
            WorkoutCategory.PULL,
            (
                ("Lat Pulldown", ((55, 12, 6.5), (70, 10, 7.5), (78, 8, 8.5))),
                ("Seated Cable Row", ((55, 12, 7), (68, 10, 8), (73, 8, 8.5))),
                ("Face Pull", ((23, 15, 7), (27, 13, 8), (27, 12, 8.5))),
                ("Hammer Curl", ((12, 12, 7), (16, 10, 8), (18, 8, 9))),
            ),
        ),
        (
            1,
            "Sample upper session",
            WorkoutCategory.UPPER,
            (
                ("Barbell Bench Press", ((62.5, 10, 6.5), (77.5, 8, 7.5), (85, 6, 8.5))),
                ("Barbell Row", ((55, 10, 7), (67.5, 8, 8), (72.5, 7, 8.5))),
                ("Overhead Press", ((35, 10, 7), (42.5, 8, 8), (45, 6, 9))),
                ("Pull-up", ((0, 8, 7), (0, 8, 8), (0, 7, 9))),
            ),
        ),
    )
    for days_ago, name, category, movements in specs:
        workout = TrainingWorkout(
            user_id=user_id,
            name=name,
            workout_date=today - timedelta(days=days_ago),
            category=category,
            notes="Sample data for evaluating the workout tracker.",
            duration_minutes=62,
            is_sample=True,
        )
        for movement_index, (exercise_name, sets) in enumerate(movements):
            exercise = exercises[exercise_name]
            movement = WorkoutMovement(exercise=exercise, order_index=movement_index)
            for set_index, (weight, reps, rpe) in enumerate(sets):
                movement.sets.append(
                    WorkoutSet(
                        order_index=set_index,
                        weight_kg=weight,
                        reps=reps,
                        rpe=rpe,
                        rest_seconds=120 if set_index == 0 else 180,
                        bodyweight_kg=83.5,
                        warmup=set_index == 0,
                        completed=True,
                    )
                )
            workout.movements.append(movement)
        db.add(workout)

    cardio = TrainingWorkout(
        user_id=user_id,
        name="Sample conditioning",
        workout_date=today - timedelta(days=1),
        category=WorkoutCategory.CARDIO,
        notes="Easy aerobic finish to complete the sample week.",
        duration_minutes=32,
        is_sample=True,
    )
    running = WorkoutMovement(exercise=exercises["Running"], order_index=0)
    running.sets.append(
        WorkoutSet(
            order_index=0,
            duration_seconds=1_800,
            distance_km=4.8,
            bodyweight_kg=83.3,
            completed=True,
        )
    )
    cardio.movements.append(running)
    db.add(cardio)
    db.add(UserSetting(user_id=user_id, key=SAMPLE_SEED_KEY, value=today.isoformat()))
    db.commit()
    return 5


def seed_sample_body_measurements(db: Session, user_id: str) -> int:
    if db.scalar(select(func.count(BodyMeasurement.id)).where(BodyMeasurement.user_id == user_id)):
        return 0
    if not db.scalar(
        select(func.count(TrainingWorkout.id)).where(
            TrainingWorkout.user_id == user_id, TrainingWorkout.is_sample.is_(True)
        )
    ):
        return 0
    today = date.today()
    for days_ago, weight, body_fat in ((4, 83.8, 17.6), (2, 83.5, 17.3), (1, 83.3, 17.1)):
        db.add(
            BodyMeasurement(
                user_id=user_id,
                measurement_date=today - timedelta(days=days_ago),
                weight_kg=weight,
                body_fat_pct=body_fat,
                notes="Sample body-composition entry.",
                is_sample=True,
            )
        )
    db.commit()
    return 3
