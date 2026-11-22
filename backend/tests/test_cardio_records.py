from __future__ import annotations

import pytest

from app.cardio_records import (
    CYCLING_DISTANCES,
    OTHER_DISTANCES,
    ROWING_DISTANCES,
    RUNNING_DISTANCES,
    SWIMMING_DISTANCES,
    pace_distances,
)


def exercise(client, name):
    return next(item for item in client.get("/api/exercises").json() if item["name"] == name)


def log(client, name, sets, day):
    response = client.post(
        "/api/workouts",
        json={
            "name": f"{name} session",
            "workout_date": day,
            "category": "cardio",
            "movements": [{"exercise_id": exercise(client, name)["id"], "sets": sets}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def records(client, workout, **params):
    response = client.get("/api/personal-records", params={"workout_id": workout["id"], **params})
    assert response.status_code == 200, response.text
    return sorted(
        (row["record_type"], row["normalized_weight"], row["value"], row["unit"])
        for row in response.json()
    )


@pytest.mark.parametrize(
    ("name", "distances"),
    [
        ("Running", RUNNING_DISTANCES),
        ("Incline Treadmill Walking", RUNNING_DISTANCES),
        ("Rowing", ROWING_DISTANCES),
        ("Cycling (Indoor)", CYCLING_DISTANCES),
        ("Spin bike", CYCLING_DISTANCES),
        ("Open water swim", SWIMMING_DISTANCES),
        ("Elliptical", OTHER_DISTANCES),
    ],
)
def test_pace_distances_suit_the_sport(name, distances):
    assert pace_distances(name) == distances


def test_running_earns_distance_time_and_pace_records_after_a_baseline(client):
    first = log(client, "Running", [{"duration_seconds": 1800, "distance_km": 5}], "2026-01-01")
    # The first run is the baseline for every record.
    assert records(client, first) == []
    longer = log(client, "Running", [{"duration_seconds": 2160, "distance_km": 7.2}], "2026-01-03")
    # 7.2 km in 36:00 covers 1 km in 5:00 and 5 km in 25:00, but not 10 km.
    assert records(client, longer) == [
        ("distance", None, 7.2, "km"),
        ("duration", None, 2160, "seconds"),
        ("pace", 1.0, 300, "seconds"),
        ("pace", 5.0, 1500, "seconds"),
    ]
    short = log(client, "Running", [{"duration_seconds": 840, "distance_km": 3}], "2026-01-05")
    # A faster short run beats the 1 km time only; its distance and time are below the bests.
    assert records(client, short) == [("pace", 1.0, 280, "seconds")]
    tied = log(client, "Running", [{"duration_seconds": 2160, "distance_km": 7.2}], "2026-01-07")
    assert records(client, tied) == []


def test_each_exercise_keeps_its_own_records(client):
    log(client, "Running", [{"duration_seconds": 3600, "distance_km": 12}], "2026-01-01")
    # Rowing's first session is its own baseline, however it compares with running.
    row = log(client, "Rowing", [{"duration_seconds": 576, "distance_km": 2.4}], "2026-01-02")
    assert records(client, row) == []
    faster = log(client, "Rowing", [{"duration_seconds": 470, "distance_km": 2}], "2026-01-03")
    assert records(client, faster) == [
        ("pace", 0.5, 117.5, "seconds"),
        ("pace", 2.0, 470, "seconds"),
    ]
    # An exercise without distance can still earn a time record.
    log(client, "Stair Climber", [{"duration_seconds": 600}], "2026-01-02")
    climb = log(client, "Stair Climber", [{"duration_seconds": 900}], "2026-01-03")
    assert records(client, climb) == [("duration", None, 900, "seconds")]


def test_warmups_and_unfinished_sets_neither_set_nor_beat_a_baseline(client):
    log(
        client,
        "Running",
        [
            {"duration_seconds": 3600, "distance_km": 15, "completed": False},
            {"duration_seconds": 3600, "distance_km": 15, "set_type": "warmup"},
            {"duration_seconds": 1500, "distance_km": 5},
        ],
        "2026-01-01",
    )
    better = log(client, "Running", [{"duration_seconds": 1800, "distance_km": 6}], "2026-01-02")
    assert [row[0] for row in records(client, better)] == ["distance", "duration"]


def test_cardio_records_count_once_and_carry_no_bodyweight(client):
    client.post("/api/body-measurements", json={"measurement_date": "2026-01-01", "weight_kg": 80})
    log(client, "Running", [{"duration_seconds": 1800, "distance_km": 5}], "2026-01-01")
    workout = log(client, "Running", [{"duration_seconds": 2400, "distance_km": 8}], "2026-01-02")
    rows = client.get("/api/personal-records", params={"workout_id": workout["id"]}).json()
    assert len(rows) == 4
    assert {row["bodyweight_kg"] for row in rows} == {None}
    assert client.get(f"/api/sharing/profiles/{client.user['id']}").json()["record_count"] == 1


def test_cardio_baselines_and_fresh_start_records(client):
    log(client, "Running", [{"duration_seconds": 2400, "distance_km": 8}], "2026-01-01")
    assert client.post(
        "/api/training-blocks/fresh-starts", json={"start_date": "2026-03-01"}
    ).is_success
    log(client, "Running", [{"duration_seconds": 1800, "distance_km": 5}], "2026-03-01")
    since = log(client, "Running", [{"duration_seconds": 1750, "distance_km": 5}], "2026-03-02")
    scoped = client.get(
        "/api/personal-records",
        params={"workout_id": since["id"], "include_fresh_start": True},
    ).json()
    # Each pace distance is its own achievement, named by its broadest scope.
    assert sorted((row["scope"], row["normalized_weight"], row["value"]) for row in scoped) == [
        ("fresh_start", 1.0, 350),
        ("fresh_start", 5.0, 1750),
    ]
    assert len({row["id"] for row in scoped}) == 2

    running = exercise(client, "Running")["id"]
    baseline = next(
        row
        for row in client.get(
            "/api/exercise-history-baselines", params={"before": "2026-04-01"}
        ).json()
        if row["exercise_id"] == running
    )
    assert baseline["best_distance_km"] == 8
    assert baseline["best_duration_seconds"] == 2400
    assert baseline["best_times"] == [
        {"distance_km": 1.0, "seconds": 300},
        {"distance_km": 5.0, "seconds": 1500},
    ]
    assert baseline["best_weight_kg"] is None
    assert [
        (row["start_date"], row["best_distance_km"], row["best_times"])
        for row in baseline["fresh_start_bests"]
    ] == [
        (
            "2026-03-01",
            5,
            [{"distance_km": 1.0, "seconds": 350}, {"distance_km": 5.0, "seconds": 1750}],
        )
    ]
