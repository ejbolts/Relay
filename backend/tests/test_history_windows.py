"""Long histories load in date windows; whole-log facts must not depend on the window."""

from __future__ import annotations

from datetime import date, timedelta


def exercise(client, name):
    return next(item for item in client.get("/api/exercises").json() if item["name"] == name)


def log(client, day, exercise_id, sets, category="push", name="Session"):
    response = client.post(
        "/api/workouts",
        json={
            "name": name,
            "workout_date": day.isoformat(),
            "category": category,
            "movements": [{"exercise_id": exercise_id, "sets": sets}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_dashboard_calendar_window_keeps_whole_log_figures(client):
    today = date.today()
    bench = exercise(client, "Barbell Bench Press")
    squat = exercise(client, "Back Squat")
    old = log(client, today - timedelta(days=400), bench["id"], [{"weight_kg": 60, "reps": 5}])
    # The latest rotation workout falls outside the window, so the dashboard looks it up.
    log(
        client,
        today - timedelta(days=200),
        squat["id"],
        [{"weight_kg": 100, "reps": 5}],
        category="lower",
    )
    log(client, today, bench["id"], [{"weight_kg": 70, "reps": 5}], category="upper")
    calendar_start = today - timedelta(days=100)

    full = client.get("/api/dashboard").json()
    windowed = client.get(
        "/api/dashboard", params={"calendar_start": calendar_start.isoformat()}
    ).json()

    assert [day["workout_date"] for day in windowed["heatmap"]] == [today.isoformat()]
    assert len(full["heatmap"]) == 3
    for key in ("current_streak", "recommendation", "weekly_sets", "workouts_this_week"):
        assert windowed[key] == full[key], key
    assert windowed["recommendation"]["rotation_next"] == "cardio"
    assert windowed["history"] == {
        "total_workouts": 3,
        "first_workout_date": old["workout_date"],
        "last_workout_date": today.isoformat(),
        "has_sample_workouts": False,
    }

    older = client.get(
        "/api/calendar",
        params={
            "start": (today - timedelta(days=500)).isoformat(),
            "end": (calendar_start - timedelta(days=1)).isoformat(),
        },
    )
    assert older.status_code == 200
    assert older.json() == full["heatmap"][:2]


def test_workout_snapshot_window_is_inclusive_and_validated(client):
    today = date.today()
    bench = exercise(client, "Barbell Bench Press")
    days = [today - timedelta(days=offset) for offset in (0, 10, 20)]
    for day in days:
        log(client, day, bench["id"], [{"weight_kg": 60, "reps": 5}])

    snapshot = client.get(
        "/api/workouts/snapshot",
        params={"start": days[2].isoformat(), "end": days[1].isoformat()},
    ).json()
    assert [item["workout_date"] for item in snapshot["workouts"]] == [
        days[1].isoformat(),
        days[2].isoformat(),
    ]
    assert snapshot["revision"] == client.get("/api/workouts/revision").json()["revision"]
    assert len(client.get("/api/workouts/snapshot").json()["workouts"]) == 3
    invalid = client.get(
        "/api/workouts/snapshot",
        params={"start": days[0].isoformat(), "end": days[2].isoformat()},
    )
    assert invalid.status_code == 422


def test_exercise_history_baselines_summarise_only_older_owned_sets(client, other_client):
    today = date.today()
    bench = exercise(client, "Barbell Bench Press")
    run = exercise(client, "Running")
    log(
        client,
        today - timedelta(days=300),
        bench["id"],
        [
            {"weight_kg": 100, "reps": 5},
            {"weight_kg": 90, "reps": 8},
            {"weight_kg": 140, "reps": 1, "set_type": "warmup"},
            {"weight_kg": 130, "reps": 1, "failed": True},
        ],
    )
    latest = log(
        client,
        today - timedelta(days=200),
        bench["id"],
        [
            {"weight_kg": 90, "reps": 10},
            {"weight_kg": 95, "reps": 3, "completed": False},
            {"weight_kg": 80, "reps": 12},
        ],
        name="Last bench",
    )
    log(
        client,
        today - timedelta(days=150),
        run["id"],
        [{"duration_seconds": 1200, "distance_km": 4}],
        category="cardio",
    )
    # On the window's first day: the client already holds it, so the baseline leaves it out.
    log(client, today - timedelta(days=100), bench["id"], [{"weight_kg": 120, "reps": 5}])
    other_bench = exercise(other_client, "Barbell Bench Press")
    log(
        other_client,
        today - timedelta(days=300),
        other_bench["id"],
        [{"weight_kg": 200, "reps": 1}],
    )

    response = client.get(
        "/api/exercise-history-baselines",
        params={"before": (today - timedelta(days=100)).isoformat()},
    )
    assert response.status_code == 200
    baselines = {item["exercise_id"]: item for item in response.json()}
    assert set(baselines) == {bench["id"], run["id"]}

    bench_baseline = baselines[bench["id"]]
    assert bench_baseline["best_weight_kg"] == 100
    assert bench_baseline["reps_by_weight"] == [
        {"weight_kg": 80, "reps": 12},
        {"weight_kg": 90, "reps": 10},
        {"weight_kg": 100, "reps": 5},
    ]
    assert bench_baseline["latest"]["workout_id"] == latest["id"]
    assert bench_baseline["latest"]["workout_name"] == "Last bench"
    assert [(item["weight_kg"], item["reps"]) for item in bench_baseline["latest"]["sets"]] == [
        (90, 10),
        (80, 12),
    ]

    run_baseline = baselines[run["id"]]
    assert run_baseline["best_weight_kg"] is None
    assert run_baseline["reps_by_weight"] == []
    assert run_baseline["latest"]["sets"][0]["distance_km"] == 4
