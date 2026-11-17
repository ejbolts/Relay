from datetime import date, timedelta


def exercise(client, name="Barbell Bench Press"):
    return next(e for e in client.get("/api/exercises").json() if e["name"] == name)


def workout(client, lift, days=0, sets=None):
    response = client.post(
        "/api/workouts",
        json={
            "name": "Sample lift",
            "workout_date": str(date.today() - timedelta(days=days)),
            "category": "push",
            "movements": [
                {
                    "exercise_id": lift["id"],
                    "sets": sets
                    or [
                        {"weight_kg": 60, "reps": 10, "completed": True},
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_library_matches_progress_and_uses_eight_calendar_weeks(client):
    lift = exercise(client)
    workout(client, lift, 100)
    workout(client, lift, 50)
    workout(client, lift, 7, [{"weight_kg": 75, "reps": 10, "completed": True}])
    [summary] = client.get("/api/progress").json()
    progress = client.get(f"/api/progress/{lift['id']}").json()
    assert summary["exercise_id"] == lift["id"]
    assert summary["session_count"] == 3
    assert summary["last_date"] == str(date.today() - timedelta(days=7))
    assert summary["latest_estimated_1rm"] == progress["points"][-1]["estimated_1rm"] == 100
    assert summary["change_kg"] == 20
    assert summary["change_percent"] == 25
    assert [p["estimated_1rm"] for p in summary["trend"]] == [80, 100]


def test_library_trend_ends_at_the_latest_session_for_lifts_not_trained_recently(client):
    lift = exercise(client)
    workout(client, lift, 200)
    workout(client, lift, 120)
    workout(client, lift, 90, [{"weight_kg": 75, "reps": 10, "completed": True}])
    [summary] = client.get("/api/progress").json()
    assert [p["date"] for p in summary["trend"]] == [
        str(date.today() - timedelta(days=days)) for days in (120, 90)
    ]
    assert [p["estimated_1rm"] for p in summary["trend"]] == [80, 100]
    assert summary["change_kg"] == 20


def test_library_excludes_future_warmups_unfinished_cardio_and_other_accounts(client, other_client):
    lift = exercise(client)
    workout(client, lift, -1)
    workout(
        client,
        lift,
        sets=[
            {"weight_kg": 300, "reps": 5, "completed": True, "warmup": True},
            {"weight_kg": 200, "reps": 5, "completed": False},
        ],
    )
    workout(
        client,
        exercise(client, "Cycling (Indoor)"),
        sets=[{"duration_seconds": 1200, "completed": True}],
    )
    workout(other_client, exercise(other_client))
    assert client.get("/api/progress").json() == []
    assert len(other_client.get("/api/progress").json()) == 1


def test_library_groups_sets_and_uses_best_eligible_estimate(client):
    lift = exercise(client)
    response = client.post(
        "/api/workouts",
        json={
            "name": "Sample lift",
            "workout_date": str(date.today()),
            "category": "push",
            "movements": [
                {
                    "exercise_id": lift["id"],
                    "sets": [
                        {"weight_kg": 60, "reps": 10, "completed": True},
                        {"weight_kg": 75, "reps": 10, "completed": True},
                        {
                            "weight_kg": 200,
                            "reps": 3,
                            "failed": True,
                            "target_reps": 5,
                            "completed": True,
                        },
                    ],
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    [summary] = client.get("/api/progress").json()
    assert summary["session_count"] == 1
    assert summary["latest_estimated_1rm"] == 100
    assert summary["change_kg"] is None
    assert len(summary["trend"]) == 1


def test_library_handles_missing_estimates_and_refreshes_after_edit_delete(client):
    lift = exercise(client)
    saved = workout(client, lift, sets=[{"weight_kg": 0, "reps": 15, "completed": True}])
    [summary] = client.get("/api/progress").json()
    assert summary["latest_estimated_1rm"] is None
    assert summary["trend"] == []
    payload = {
        "name": saved["name"],
        "workout_date": saved["workout_date"],
        "category": "push",
        "movements": [
            {"exercise_id": lift["id"], "sets": [{"weight_kg": 30, "reps": 10, "completed": True}]}
        ],
    }
    assert client.put(f"/api/workouts/{saved['id']}", json=payload).status_code == 200
    assert client.get("/api/progress").json()[0]["latest_estimated_1rm"] == 40
    assert client.delete(f"/api/workouts/{saved['id']}").status_code == 204
    assert client.get("/api/progress").json() == []


def test_library_requires_authentication(anonymous_client):
    assert anonymous_client.get("/api/progress").status_code == 401


def test_library_counts_multiple_sessions_but_bounds_trend_to_one_point_per_day(client):
    lift = exercise(client)
    workout(client, lift)
    workout(client, lift)
    [summary] = client.get("/api/progress").json()
    assert summary["session_count"] == 2
    assert len(summary["trend"]) == 1
