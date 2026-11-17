from datetime import date, timedelta

import pytest

from app.models import (
    Exercise,
    ExerciseKind,
    SetType,
    TrainingWorkout,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSet,
)
from app.tracker import weekly_sets


def log_workout(client, names, *, title="Upper body", sets=None):
    exercises = {item["name"]: item["id"] for item in client.get("/api/exercises").json()}
    response = client.post(
        "/api/workouts",
        json={
            "name": title,
            "workout_date": date.today().isoformat(),
            "category": "upper",
            "movements": [
                {
                    "exercise_id": exercises[name],
                    "sets": sets or [{"reps": 8, "weight_kg": 30, "completed": True}] * count,
                }
                for name, count in names
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_contributions_reconcile_direct_and_assistance_credits_with_exact_workout_links(client):
    workout = log_workout(
        client, [("Barbell Curl", 3), ("Lat Pulldown", 4), ("Seated Cable Row", 2)]
    )
    groups = client.get("/api/dashboard").json()["weekly_sets"]["muscle_groups"]
    for group in groups:
        assert (
            round(sum(item["set_credits"] for item in group["contributions"]), 1)
            == group["raw_sets"]
        )
    biceps = next(group for group in groups if group["muscle_group"] == "Biceps")
    assert biceps["raw_sets"] == 6
    assert [
        (item["working_sets"], item["credit_per_set"], item["set_credits"])
        for item in biceps["contributions"]
    ] == [(3, 1, 3), (4, 0.5, 2), (2, 0.5, 1)]
    for item, movement in zip(biceps["contributions"], workout["movements"], strict=True):
        assert item["workout_id"] == workout["id"]
        assert item["workout_name"] == "Upper body"
        assert item["workout_date"] == date.today().isoformat()
        assert item["movement_id"] == movement["id"]
        assert item["exercise_id"] == movement["exercise"]["id"]
        assert item["exercise_name"] == movement["exercise"]["name"]


def test_contributions_exclude_nonworking_sets_and_other_accounts_and_keep_repeated_sessions(
    client, other_client
):
    workout = log_workout(
        client,
        [("Barbell Curl", 1)],
        sets=[
            {"reps": 8, "weight_kg": 30, "completed": True, "rpe": 6},
            {"reps": 8, "weight_kg": 20, "completed": True, "warmup": True},
            {"reps": 8, "weight_kg": 30, "completed": False},
            {"reps": 0, "weight_kg": 30, "completed": True, "failed": True},
            {"reps": 3, "weight_kg": 30, "completed": True, "failed": True},
        ],
    )
    second = log_workout(client, [("Barbell Curl", 2)], title="Later upper body")
    other = log_workout(other_client, [("Barbell Curl", 5)], title="Other account")
    biceps = next(
        group
        for group in client.get("/api/dashboard").json()["weekly_sets"]["muscle_groups"]
        if group["muscle_group"] == "Biceps"
    )
    assert biceps["raw_sets"] == 4
    assert [item["working_sets"] for item in biceps["contributions"]] == [2, 2]
    assert {item["movement_id"] for item in biceps["contributions"]} == {
        item["id"] for session in [workout, second] for item in session["movements"]
    }
    assert {item["workout_id"] for item in biceps["contributions"]} == {workout["id"], second["id"]}
    assert all(item["workout_id"] != other["id"] for item in biceps["contributions"])


@pytest.mark.parametrize(
    ("week_start", "expected"), [("monday", [0]), ("sunday", [-1, 0]), ("saturday", [-2, -1, 0])]
)
def test_contributions_use_the_account_week_boundary_and_exclude_future_workouts(
    week_start, expected
):
    today = date(2026, 10, 19)
    exercise = Exercise(
        id="curl",
        name="Custom curl",
        kind=ExerciseKind.STRENGTH,
        category=WorkoutCategory.PULL,
        muscle_group="Biceps",
        muscle_contributions=[],
    )
    workouts = [
        TrainingWorkout(
            id=f"workout-{offset}",
            name="Session",
            workout_date=today + timedelta(days=offset),
            movements=[
                WorkoutMovement(
                    id=f"movement-{offset}",
                    exercise=exercise,
                    sets=[
                        WorkoutSet(
                            completed=True,
                            reps=8,
                            set_type=SetType.NORMAL,
                            warmup=False,
                            failed=False,
                        )
                    ],
                )
            ],
        )
        for offset in [-8, -2, -1, 0, 1]
    ]
    [biceps] = weekly_sets(workouts, today, week_start).muscle_groups
    assert [item.workout_id for item in biceps.contributions] == [
        f"workout-{offset}" for offset in expected
    ]
    assert (
        sum(item.set_credits for item in biceps.contributions) == biceps.raw_sets == len(expected)
    )
