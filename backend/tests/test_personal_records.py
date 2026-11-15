from __future__ import annotations

import pytest


def exercise(client, name="Barbell Bench Press"):
    return next(item for item in client.get("/api/exercises").json() if item["name"] == name)


def log(client, exercise_id, sets, day="2026-01-01", workout_id=None):
    payload = {
        "name": "PR verification",
        "workout_date": day,
        "category": "push",
        "movements": [{"exercise_id": exercise_id, "sets": sets}],
    }
    response = (
        client.put(f"/api/workouts/{workout_id}", json=payload)
        if workout_id
        else client.post("/api/workouts", json=payload)
    )
    assert response.status_code in {200, 201}, response.text
    return response.json()


def records(client, workout=None):
    response = client.get(
        "/api/personal-records", params={"workout_id": workout["id"]} if workout else {}
    )
    assert response.status_code == 200
    return response.json()


def test_relative_strength_uses_dated_bodyweight_and_survives_unit_changes(client):
    bench = exercise(client)
    client.post("/api/body-measurements", json={"measurement_date": "2026-01-01", "weight_kg": 100})
    log(client, bench["id"], [{"weight_kg": 100, "reps": 8}])
    client.post("/api/body-measurements", json={"measurement_date": "2026-01-15", "weight_kg": 80})
    workout = log(client, bench["id"], [{"weight_kg": 100, "reps": 8}], "2026-01-15")
    result = records(client, workout)
    assert [(row["record_type"], row["value"], row["bodyweight_kg"]) for row in result] == [
        ("relative_strength", 1.25, 80)
    ]
    # A future check-in must never change a historical ratio or bodyweight label.
    client.post("/api/body-measurements", json={"measurement_date": "2026-02-01", "weight_kg": 70})
    assert records(client, workout)[0]["value"] == 1.25
    assert records(client, workout)[0]["bodyweight_kg"] == 80
    baseline = client.get("/api/exercise-history-baselines", params={"before": "2026-02-01"}).json()
    assert (
        next(row for row in baseline if row["exercise_id"] == bench["id"])["best_relative_strength"]
        == 1.25
    )
    points = client.get(f"/api/progress/{bench['id']}").json()["points"]
    assert [(point["relative_strength"], point["bodyweight_kg"]) for point in points] == [
        (1, 100),
        (1.25, 80),
    ]
    client.put("/api/training-preferences", json={"preferred_weight_unit": "lb"})
    assert records(client, workout)[0]["value"] == 1.25
    assert records(client, workout)[0]["unit"] == "× BW"
    assert client.delete(f"/api/workouts/{workout['id']}").status_code == 204
    assert records(client) == []


def test_relative_strength_recorded_bodyweight_ties_and_missing_baseline(client):
    bench = exercise(client)
    # No dated weight means no relative baseline, even with a later weigh-in.
    log(client, bench["id"], [{"weight_kg": 100, "reps": 8}])
    client.post("/api/body-measurements", json={"measurement_date": "2026-01-15", "weight_kg": 90})
    first = log(
        client, bench["id"], [{"weight_kg": 100, "bodyweight_kg": 80, "reps": 8}], "2026-01-15"
    )
    assert records(client, first) == []
    tied = log(
        client, bench["id"], [{"weight_kg": 90, "bodyweight_kg": 72, "reps": 8}], "2026-01-16"
    )
    assert records(client, tied) == []
    better = log(
        client,
        bench["id"],
        [
            {"weight_kg": 90, "bodyweight_kg": 70, "reps": 8},
            {"weight_kg": 120, "bodyweight_kg": 70, "reps": 8, "warmup": True},
            {"weight_kg": 120, "bodyweight_kg": 70, "reps": 8, "failed": True},
        ],
        "2026-01-17",
    )
    relative = [row for row in records(client, better) if row["record_type"] == "relative_strength"]
    assert len(relative) == 1
    assert relative[0]["value"] == 1.2857
    assert relative[0]["bodyweight_kg"] == 70
    assert relative[0]["weight_kg"] == 90


def test_correcting_or_removing_historical_checkin_rebuilds_relative_prs(client):
    bench = exercise(client)
    client.post("/api/body-measurements", json={"measurement_date": "2026-01-01", "weight_kg": 100})
    log(client, bench["id"], [{"weight_kg": 100, "reps": 8}])
    weight = client.post(
        "/api/body-measurements", json={"measurement_date": "2026-01-15", "weight_kg": 80}
    ).json()
    workout = log(client, bench["id"], [{"weight_kg": 100, "reps": 8}], "2026-01-15")
    assert records(client, workout)[0]["value"] == 1.25
    client.post("/api/body-measurements", json={"measurement_date": "2026-01-15", "weight_kg": 110})
    assert records(client, workout) == []
    client.delete(f"/api/body-measurements/{weight['id']}")
    assert records(client, workout) == []


@pytest.mark.parametrize(
    ("weight", "reps", "extra", "expected"),
    [
        (105, 1, {}, ["weight"]),
        (100, 9, {}, ["reps_at_weight"]),
        (90, 13, {}, ["reps_at_weight"]),
        (80, 11, {}, ["reps_at_weight"]),
        (100, 8, {}, []),
        (100, 7, {}, []),
        (95, 30, {}, []),  # Higher Epley estimate, first attempt at this weight.
        (70, 20, {}, []),
        (110, 0, {}, []),
        (110, None, {}, []),
        (None, 20, {}, []),
        (110, 9, {"completed": False}, []),
        (110, 9, {"set_type": "warmup"}, []),
        (110, 9, {"warmup": True}, []),
        (110, 9, {"failed": True}, []),
        (110, 9, {"failed": True, "target_reps": 10}, []),
        (100, 9, {"failed": True, "target_reps": 9}, ["reps_at_weight"]),
        (80, 11, {"set_type": "drop"}, ["reps_at_weight"]),
        (100.04, 9, {}, ["weight"]),
        (100.000001, 9, {}, ["reps_at_weight"]),
    ],
)
def test_weight_and_volume_pr_matrix(client, weight, reps, extra, expected):
    bench = exercise(client)
    baseline = log(
        client,
        bench["id"],
        [
            {"weight_kg": 100, "reps": 8},
            {"weight_kg": 90, "reps": 12},
            {"weight_kg": 80, "reps": 10},
        ],
    )
    assert records(client, baseline) == []
    # A workout needs at least one completed set, even for the incomplete-set case.
    workout = log(
        client,
        bench["id"],
        [
            {"weight_kg": weight, "reps": reps, **extra},
            {"weight_kg": 80, "reps": 1},
        ],
        "2026-01-15",
    )
    assert [item["record_type"] for item in records(client, workout)] == expected


def test_same_workout_baseline_then_improvements_without_tied_repeats(client):
    workout = log(
        client,
        exercise(client)["id"],
        [
            {"weight_kg": 100, "reps": 8},
            {"weight_kg": 100, "reps": 9},
            {"weight_kg": 100, "reps": 9},
            {"weight_kg": 105, "reps": 1},
            {"weight_kg": 105, "reps": 1},
        ],
    )
    result = records(client, workout)
    assert {item["record_type"] for item in result} == {"weight", "reps_at_weight"}
    assert len(result) == 2
    assert {item["set_id"] for item in result} == {
        workout["movements"][0]["sets"][index]["id"] for index in [1, 3]
    }


def test_best_reps_per_weight_not_last_set_or_summed_volume(client):
    bench = exercise(client)
    log(client, bench["id"], [{"weight_kg": 100, "reps": 10}, {"weight_kg": 100, "reps": 5}])
    workout = log(client, bench["id"], [{"weight_kg": 100, "reps": 8}] * 3, "2026-01-15")
    assert records(client, workout) == []


def test_history_rebuild_after_edit_delete_and_backdated_import(client):
    bench = exercise(client)
    first = log(client, bench["id"], [{"weight_kg": 100, "reps": 8}])
    second = log(client, bench["id"], [{"weight_kg": 100, "reps": 9}], "2026-01-15")
    assert len(records(client, second)) == 1
    log(client, bench["id"], [{"weight_kg": 100, "reps": 10}], workout_id=first["id"])
    assert records(client) == []
    log(client, bench["id"], [{"weight_kg": 100, "reps": 8}], workout_id=first["id"])
    assert len(records(client, second)) == 1
    assert client.delete(f"/api/workouts/{first['id']}").status_code == 204
    assert records(client) == []  # Remaining first attempt is now the baseline.
    log(client, bench["id"], [{"weight_kg": 90, "reps": 20}], "2025-12-01")
    assert [item["record_type"] for item in records(client, second)] == ["weight"]


def test_prs_are_isolated_by_exercise_and_user(client, other_client):
    bench = exercise(client)
    log(client, bench["id"], [{"weight_kg": 100, "reps": 8}])
    other_exercise = exercise(client, "Overhead Press")
    workout = log(client, other_exercise["id"], [{"weight_kg": 110, "reps": 10}])
    assert records(client, workout) == []
    other_bench = exercise(other_client)
    other = log(other_client, other_bench["id"], [{"weight_kg": 110, "reps": 10}])
    assert records(other_client, other) == []
    assert client.get("/api/personal-records", params={"workout_id": other["id"]}).json() == []


def test_display_unit_change_does_not_change_pr_classification(client):
    bench = exercise(client)
    log(client, bench["id"], [{"weight_kg": 100.05, "reps": 8}])
    distinct = log(client, bench["id"], [{"weight_kg": 100.04, "reps": 9}], "2026-01-08")
    volume = log(client, bench["id"], [{"weight_kg": 100.05, "reps": 9}], "2026-01-15")
    assert records(client, distinct) == []
    assert [item["record_type"] for item in records(client, volume)] == ["reps_at_weight"]
    assert records(client, volume)[0]["weight_kg"] == 100.05
    assert (
        client.put(
            "/api/training-preferences",
            json={"preferred_weight_unit": "lb", "week_start": "monday", "zone2_goal_minutes": 150},
        ).status_code
        == 200
    )
    assert records(client, distinct) == []
    assert [item["record_type"] for item in records(client, volume)] == ["reps_at_weight"]


def test_bodyweight_volume_and_cardio_exclusion(client):
    bench = exercise(client)
    log(client, bench["id"], [{"weight_kg": 0, "reps": 8}])
    volume = log(client, bench["id"], [{"weight_kg": 0, "reps": 9}], "2026-01-15")
    assert [item["record_type"] for item in records(client, volume)] == ["reps_at_weight"]
    cardio = next(item for item in client.get("/api/exercises").json() if item["kind"] == "cardio")
    log(client, cardio["id"], [{"duration_seconds": 600, "distance_km": 1}])
    workout = log(
        client, cardio["id"], [{"duration_seconds": 1200, "distance_km": 2}], "2026-01-15"
    )
    assert records(client, workout) == []
