from __future__ import annotations

from datetime import date, timedelta

from app.training_time import past_year_start

NO_IMPORTS = {
    "imported_workout_minutes": 0,
    "imported_workout_count": 0,
    "imported_cardio_minutes": 0,
    "imported_cardio_count": 0,
    "imported_total_minutes": 0,
}


def exercise_id(client, name: str) -> str:
    return next(item["id"] for item in client.get("/api/exercises").json() if item["name"] == name)


def save_workout(
    client, duration_minutes: int | None, movements: list[dict], workout_date: date | None = None
) -> dict:
    response = client.post(
        "/api/workouts",
        json={
            "name": "Session",
            "workout_date": (workout_date or date.today()).isoformat(),
            "category": "push",
            "notes": None,
            "duration_minutes": duration_minutes,
            "movements": movements,
        },
    )
    assert response.status_code == 201
    return response.json()


def strength(client) -> dict:
    return {
        "exercise_id": exercise_id(client, "Barbell Bench Press"),
        "notes": None,
        "sets": [{"reps": 5, "weight_kg": 80, "completed": True}],
    }


def cycling(client, seconds: int) -> dict:
    return {
        "exercise_id": exercise_id(client, "Cycling (Indoor)"),
        "notes": None,
        "sets": [{"duration_seconds": seconds, "completed": True}],
    }


def test_training_time_starts_empty(client):
    assert client.get("/api/training-time").json() == {
        "workout_minutes": 0,
        "workout_count": 0,
        "cardio_minutes": 0,
        "cardio_count": 0,
        "total_minutes": 0,
        **NO_IMPORTS,
    }


def test_combined_time_counts_cardio_inside_a_workout_once(client, other_client):
    # 60-minute strength workout including a 40-minute ride.
    save_workout(client, 60, [strength(client), cycling(client, 2_400)])
    # Untimed strength workout: its 30-minute ride still counts towards the combined total.
    save_workout(client, None, [strength(client), cycling(client, 1_800)])
    # Cardio form session with an exercise creates its own cardio-only workout.
    treadmill = exercise_id(client, "Incline Treadmill Walking")
    for payload in (
        {"exercise_id": treadmill, "activity_type": "Incline Treadmill Walking"},
        {"activity_type": "Rowing"},
    ):
        assert (
            client.post(
                "/api/cardio",
                json={
                    "session_date": date.today().isoformat(),
                    "duration_minutes": 25,
                    "intensity": None,
                    "zone": None,
                    "qualifies_zone2": False,
                    "notes": None,
                    **payload,
                },
            ).status_code
            == 201
        )
    save_workout(other_client, 90, [strength(other_client)])

    assert client.get("/api/training-time").json() == {
        "workout_minutes": 60,
        "workout_count": 2,
        "cardio_minutes": 40 + 30 + 25 + 25,
        "cardio_count": 4,
        "total_minutes": 60 + 30 + 25 + 25,
        **NO_IMPORTS,
    }


def test_training_time_excludes_sample_workouts(client):
    from app.database import SessionLocal
    from app.tracker_seed import seed_sample_workouts

    with SessionLocal() as db:
        assert seed_sample_workouts(db, client.user["id"]) > 0
    assert client.get("/api/workouts").json()

    assert client.get("/api/training-time").json()["total_minutes"] == 0


def test_past_year_starts_on_the_same_day_last_year():
    assert past_year_start(date(2026, 10, 24)) == date(2025, 10, 24)
    assert past_year_start(date(2028, 2, 29)) == date(2027, 2, 28)


def test_profile_reports_all_time_and_past_year_totals(client):
    today = date.today()
    save_workout(client, 60, [strength(client), cycling(client, 1_200)])
    save_workout(client, 45, [strength(client)], workout_date=past_year_start(today))
    save_workout(
        client,
        90,
        [strength(client), cycling(client, 600)],
        workout_date=today - timedelta(days=800),
    )
    response = client.post(
        "/api/cardio",
        json={
            "session_date": (past_year_start(today) - timedelta(days=1)).isoformat(),
            "duration_minutes": 30,
            "intensity": None,
            "zone": None,
            "qualifies_zone2": False,
            "notes": None,
            "activity_type": "Rowing",
        },
    )
    assert response.status_code == 201

    profile = client.get(f"/api/sharing/profiles/{client.user['id']}").json()
    assert profile["training_time"] == {
        "workout_minutes": 60 + 45 + 90,
        "workout_count": 3,
        "cardio_minutes": 20 + 10 + 30,
        "cardio_count": 3,
        "total_minutes": 60 + 45 + 90 + 30,
        **NO_IMPORTS,
    }
    # The workout on the boundary day counts; older workouts and cardio do not.
    assert profile["training_time_past_year"] == {
        "workout_minutes": 60 + 45,
        "workout_count": 2,
        "cardio_minutes": 20,
        "cardio_count": 1,
        "total_minutes": 60 + 45,
        **NO_IMPORTS,
    }


def test_imported_share_of_each_total(client):
    today = date.today()
    header = "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Seconds\n"
    rows = [
        f"{today - timedelta(days=40)} 08:30:00,Push,1h 5m,Bench Press,1,80,5,0",
        f"{today - timedelta(days=5)} 08:30:00,Ride,50m,Bench Press,1,80,5,0",
        f"{today - timedelta(days=5)} 08:30:00,Ride,50m,Cycling (Indoor),1,0,0,1200",
    ]
    imported = client.post(
        "/api/workouts/import",
        files={"file": ("strong.csv", (header + "\n".join(rows)).encode(), "text/csv")},
        data={"source": "strong"},
    )
    assert imported.status_code == 201, imported.text
    # Logged in Relay: a 60-minute workout with a 30-minute ride, and a cardio session.
    save_workout(client, 60, [strength(client), cycling(client, 1_800)])
    response = client.post(
        "/api/cardio",
        json={
            "session_date": today.isoformat(),
            "duration_minutes": 25,
            "intensity": None,
            "zone": None,
            "qualifies_zone2": False,
            "notes": None,
            "activity_type": "Rowing",
        },
    )
    assert response.status_code == 201

    assert client.get("/api/training-time").json() == {
        "workout_minutes": 65 + 50 + 60,
        "workout_count": 3,
        "cardio_minutes": 20 + 30 + 25,
        "cardio_count": 3,
        "total_minutes": 65 + 50 + 60 + 25,
        "imported_workout_minutes": 65 + 50,
        "imported_workout_count": 2,
        "imported_cardio_minutes": 20,
        "imported_cardio_count": 1,
        "imported_total_minutes": 65 + 50,
    }
    profile = client.get(f"/api/sharing/profiles/{client.user['id']}").json()
    assert (profile["workout_count"], profile["imported_workout_count"]) == (3, 2)
    assert (profile["recent_workout_count"], profile["imported_recent_workout_count"]) == (2, 1)
    # Past year leaves out nothing here; deleting an imported workout drops it from both.
    assert profile["training_time_past_year"]["imported_workout_count"] == 2
    oldest = min(client.get("/api/workouts").json(), key=lambda item: item["workout_date"])
    assert client.delete(f"/api/workouts/{oldest['id']}").status_code == 204
    profile = client.get(f"/api/sharing/profiles/{client.user['id']}").json()
    assert (profile["workout_count"], profile["imported_workout_count"]) == (2, 1)
    assert profile["training_time"]["imported_workout_minutes"] == 50
