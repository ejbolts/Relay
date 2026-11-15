from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.exercise_aliases import canonical_exercise_name
from app.models import (
    Exercise,
    ExerciseKind,
    ExerciseMuscleContribution,
    MuscleRole,
    WorkoutCategory,
)
from app.tracker import DEFAULT_CARDIO, DEFAULT_EXERCISES, workout_cache_revision
from app.tracker_csv import infer_exercise
from app.training_metrics import DEFAULT_MUSCLE_MAPPING, muscle_credits, seed_muscle_mappings


def exercise_with_credits(name):
    return Exercise(
        name=name,
        kind=ExerciseKind.STRENGTH,
        category=WorkoutCategory.PUSH,
        muscle_group="Test muscle",
        muscle_contributions=[
            ExerciseMuscleContribution(muscle_name=muscle, role=role, contribution_factor=factor)
            for muscle, role, factor in DEFAULT_MUSCLE_MAPPING[name]
        ],
    )


def test_every_builtin_strength_exercise_has_distinct_canonical_credits():
    assert set(DEFAULT_MUSCLE_MAPPING) == {name for name, *_ in DEFAULT_EXERCISES}
    for name in DEFAULT_MUSCLE_MAPPING:
        credits = muscle_credits(exercise_with_credits(name))
        assert len(credits) == len(DEFAULT_MUSCLE_MAPPING[name])
        assert all(factor in (1.0, 0.5) for _, factor in credits)
        assert any(role == MuscleRole.PRIMARY for _, role, _ in DEFAULT_MUSCLE_MAPPING[name])


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Barbell Bench Press", {"Pectorals": 1, "Triceps": 0.5, "Front delts": 0.5}),
        ("Incline Dumbbell Press", {"Pectorals": 1, "Triceps": 0.5, "Front delts": 0.5}),
        ("Overhead Press", {"Front delts": 1, "Side delts": 0.5, "Triceps": 0.5}),
        ("Dumbbell Shoulder Press", {"Front delts": 1, "Side delts": 0.5, "Triceps": 0.5}),
        (
            "Deadlift",
            {
                "Glutes": 1,
                "Hamstrings": 1,
                "Spinal erectors": 1,
                "Quadriceps": 0.5,
                "Mid / Upper Back": 0.5,
                "Forearms": 0.5,
            },
        ),
        (
            "Barbell Row",
            {
                "Mid / Upper Back": 1,
                "Lats": 1,
                "Biceps": 0.5,
                "Rear deltoids": 0.5,
                "Forearms": 0.5,
                "Spinal erectors": 0.5,
            },
        ),
        ("Single-Arm Lat Pulldown (Machine)", {"Lats": 1, "Biceps": 0.5, "Forearms": 0.5}),
        (
            "Seated Cable Row",
            {
                "Mid / Upper Back": 1,
                "Lats": 1,
                "Biceps": 0.5,
                "Rear deltoids": 0.5,
                "Forearms": 0.5,
            },
        ),
        (
            "Seated Machine Row",
            {
                "Mid / Upper Back": 1,
                "Lats": 1,
                "Biceps": 0.5,
                "Rear deltoids": 0.5,
                "Forearms": 0.5,
            },
        ),
        ("Machine Bicep Preacher Curl", {"Biceps": 1, "Forearms": 0.5}),
        ("Single-Arm Preacher Curl", {"Biceps": 1, "Forearms": 0.5}),
        ("Seated Leg Curl", {"Hamstrings": 1, "Calves": 0.5}),
        ("Lying Leg Curl", {"Hamstrings": 1, "Calves": 0.5}),
        ("Plank", {"Core": 1}),
        ("Hanging Leg Raise", {"Core": 1, "Hip flexors": 1}),
        ("Machine Neck Flexion", {"Neck flexors": 1}),
        ("Plate Neck Flexion", {"Neck flexors": 1}),
        ("Band Neck Flexion", {"Neck flexors": 1}),
        ("Machine Lateral Neck Flexion", {"Lateral neck flexors": 1}),
        ("Plate Lateral Neck Flexion", {"Lateral neck flexors": 1}),
        ("Band Lateral Neck Flexion", {"Lateral neck flexors": 1}),
        ("Machine Neck Extension", {"Neck extensors": 1}),
        ("Plate Neck Extension", {"Neck extensors": 1}),
        ("Band Neck Extension", {"Neck extensors": 1}),
    ],
)
def test_reviewed_direct_and_indirect_credits(name, expected):
    assert dict(muscle_credits(exercise_with_credits(name))) == expected


@pytest.mark.parametrize("name", [name for name, *_ in DEFAULT_CARDIO])
def test_cardio_never_receives_strength_set_credits(name):
    exercise = Exercise(
        name=name,
        category=WorkoutCategory.CARDIO,
        kind=ExerciseKind.CARDIO,
        muscle_group="Cardio",
    )
    assert muscle_credits(exercise) == []


def test_legacy_upper_back_label_is_combined_without_double_counting():
    exercise = exercise_with_credits("Barbell Row")
    exercise.muscle_contributions.append(
        ExerciseMuscleContribution(
            muscle_name="Upper back", role=MuscleRole.SECONDARY, contribution_factor=0.5
        )
    )
    credits = dict(muscle_credits(exercise))
    assert "Upper back" not in credits
    assert credits["Mid / Upper Back"] == 1


def test_weekly_and_volume_apis_share_fractional_working_set_totals(client):
    exercises = {item["name"]: item for item in client.get("/api/exercises").json()}
    response = client.post(
        "/api/workouts",
        json={
            "name": "Muscle-credit audit",
            "workout_date": date.today().isoformat(),
            "category": "full_body",
            "movements": [
                {
                    "exercise_id": exercises[name]["id"],
                    "sets": [
                        {"reps": 8, "weight_kg": 40, "completed": True},
                        {"reps": 8, "weight_kg": 20, "completed": True, "warmup": True},
                        {"reps": 8, "weight_kg": 40, "completed": False},
                        {"reps": 0, "weight_kg": 40, "completed": True, "failed": True},
                    ],
                }
                for name in (
                    "Barbell Bench Press",
                    "Incline Dumbbell Press",
                    "Single-Arm Lat Pulldown (Machine)",
                    "Seated Machine Row",
                    "Seated Leg Curl",
                    "Machine Bicep Preacher Curl",
                )
            ],
        },
    )
    assert response.status_code == 201
    weekly = client.get("/api/dashboard").json()["weekly_sets"]
    expected = {
        "Pectorals": 2,
        "Triceps": 1,
        "Front delts": 1,
        "Lats": 2,
        "Biceps": 2,
        "Forearms": 1.5,
        "Mid / Upper Back": 1,
        "Rear deltoids": 0.5,
        "Hamstrings": 1,
        "Calves": 0.5,
    }
    assert weekly["raw_sets"] == 6
    assert {item["muscle_group"]: item["raw_sets"] for item in weekly["muscle_groups"]} == expected
    volume = client.get("/api/muscle-volume").json()
    assert {item["muscle_name"]: item["set_total"] for item in volume} == expected


def test_default_resync_invalidates_only_changed_account_and_preserves_custom(client, other_client):
    with SessionLocal() as db:
        exercises = list(
            db.scalars(select(Exercise).options(selectinload(Exercise.muscle_contributions)))
        )
        for exercise in exercises:
            if exercise.name == "Incline Dumbbell Press":
                front = next(
                    c for c in exercise.muscle_contributions if c.muscle_name == "Front delts"
                )
                front.role = MuscleRole.PRIMARY
                front.contribution_factor = 1
            if exercise.user_id == client.user["id"] and exercise.name == "Barbell Bench Press":
                exercise.is_custom = True
                exercise.muscle_contributions[0].contribution_factor = 0.3
                custom_id = exercise.id
        db.commit()
        before = workout_cache_revision(db, client.user["id"])
        other_before = workout_cache_revision(db, other_client.user["id"])
        seed_muscle_mappings(db, client.user["id"])
        after = workout_cache_revision(db, client.user["id"])
        assert after != before
        assert workout_cache_revision(db, other_client.user["id"]) == other_before
        assert db.get(Exercise, custom_id).muscle_contributions[0].contribution_factor == 0.3
        seed_muscle_mappings(db, client.user["id"])
        assert workout_cache_revision(db, client.user["id"]) == after
    own = {item["name"]: item for item in client.get("/api/exercises").json()}
    other = {item["name"]: item for item in other_client.get("/api/exercises").json()}
    for account, expected in [(own, 0.5), (other, 1)]:
        contributions = account["Incline Dumbbell Press"]["muscle_contributions"]
        assert (
            next(c for c in contributions if c["muscle_name"] == "Front delts")[
                "contribution_factor"
            ]
            == expected
        )


@pytest.mark.parametrize(
    ("name", "muscle_group"),
    [
        ("Neck Curl", "Neck flexors"),
        ("Lying Neck Flexion", "Neck flexors"),
        ("Side Neck Curl", "Lateral neck flexors"),
        ("Lateral Neck Flexion (Band)", "Lateral neck flexors"),
        ("Reverse Neck Curl", "Neck extensors"),
        ("4-Way Neck Extension", "Neck extensors"),
    ],
)
def test_imported_neck_exercises_infer_the_moving_muscle_group(name, muscle_group):
    assert infer_exercise(name) == (
        WorkoutCategory.UPPER,
        ExerciseKind.STRENGTH,
        muscle_group,
        None,
    )


def test_neck_aliases_resolve_to_builtin_plate_exercises():
    assert canonical_exercise_name("neck curl") == "Plate Neck Flexion"
    assert canonical_exercise_name("Side Neck Curl") == "Plate Lateral Neck Flexion"
    assert canonical_exercise_name("Reverse  Neck Curl") == "Plate Neck Extension"
