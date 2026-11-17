"""Home compares sets per muscle with earlier weeks sent alongside the current week."""

from __future__ import annotations

from datetime import date, timedelta

from app.models import (
    Exercise,
    ExerciseKind,
    SetType,
    TrainingWorkout,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSet,
)
from app.tracker import WEEKLY_SETS_HISTORY_WEEKS, weekly_sets
from app.training_metrics import start_of_week


def curl_workout(day: date, sets: int) -> TrainingWorkout:
    exercise = Exercise(
        id="curl",
        name="Custom curl",
        kind=ExerciseKind.STRENGTH,
        category=WorkoutCategory.PULL,
        muscle_group="Biceps",
        muscle_contributions=[],
    )
    working = WorkoutSet(
        completed=True, reps=8, set_type=SetType.NORMAL, warmup=False, failed=False
    )
    return TrainingWorkout(
        id=f"workout-{day.isoformat()}",
        name="Session",
        workout_date=day,
        movements=[
            WorkoutMovement(
                id=f"movement-{day.isoformat()}", exercise=exercise, sets=[working] * sets
            )
        ],
    )


def test_an_earlier_week_counts_its_whole_week_only():
    today = date(2026, 11, 4)  # Wednesday
    monday = start_of_week(today)
    workouts = [
        curl_workout(monday - timedelta(days=8), 2),  # two weeks ago, Sunday
        curl_workout(monday - timedelta(days=7), 3),  # last week, Monday
        curl_workout(monday - timedelta(days=1), 4),  # last week, Sunday
        curl_workout(monday, 5),  # this week
    ]

    last_week = weekly_sets(workouts, today, "monday", weeks_ago=1)
    assert last_week.week_start == monday - timedelta(days=7)
    assert last_week.week_end == monday - timedelta(days=1)
    [biceps] = last_week.muscle_groups
    assert biceps.raw_sets == 7
    assert [item.set_credits for item in biceps.contributions] == [3, 4]

    [this_week] = weekly_sets(workouts, today, "monday").muscle_groups
    assert this_week.raw_sets == 5


def test_an_earlier_week_lists_recently_trained_muscles_with_no_sets_that_week():
    today = date(2026, 11, 4)
    monday = start_of_week(today)
    workouts = [curl_workout(monday - timedelta(days=10), 3)]

    [biceps] = weekly_sets(workouts, today, "monday", weeks_ago=1).muscle_groups
    assert biceps.raw_sets == 0
    assert weekly_sets(workouts, today, "monday", weeks_ago=6).muscle_groups == []


def log(client, day: date, exercise_id: str, sets: int):
    response = client.post(
        "/api/workouts",
        json={
            "name": "Arms",
            "workout_date": day.isoformat(),
            "category": "pull",
            "movements": [
                {"exercise_id": exercise_id, "sets": [{"weight_kg": 20, "reps": 10}] * sets}
            ],
        },
    )
    assert response.status_code == 201, response.text


def test_dashboard_sends_earlier_weeks_newest_first_whatever_the_calendar_window(client):
    today = date.today()
    monday = start_of_week(today)
    curl = next(
        item for item in client.get("/api/exercises").json() if item["name"] == "Barbell Curl"
    )
    log(client, today, curl["id"], 2)
    log(client, monday - timedelta(days=7), curl["id"], 3)
    oldest_monday = monday - timedelta(weeks=WEEKLY_SETS_HISTORY_WEEKS)
    log(client, oldest_monday, curl["id"], 4)

    full = client.get("/api/dashboard").json()
    windowed = client.get(
        "/api/dashboard", params={"calendar_start": (today - timedelta(days=3)).isoformat()}
    ).json()

    history = full["weekly_sets_history"]
    assert [week["week_start"] for week in history] == [
        (monday - timedelta(weeks=weeks)).isoformat()
        for weeks in range(1, WEEKLY_SETS_HISTORY_WEEKS + 1)
    ]

    def biceps(week):
        return next(
            (
                item["raw_sets"]
                for item in week["muscle_groups"]
                if item["muscle_group"] == "Biceps"
            ),
            0,
        )

    assert biceps(full["weekly_sets"]) == 2
    assert biceps(history[0]) == 3
    assert biceps(history[-1]) == 4
    assert windowed["weekly_sets_history"] == history
