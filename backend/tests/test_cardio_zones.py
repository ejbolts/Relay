from datetime import date, timedelta

import pytest


def personal_preferences():
    return {
        "heart_rate_zones": [
            {"zone": index + 1, "min_bpm": low, "max_bpm": high}
            for index, (low, high) in enumerate(
                [(80, 109), (110, 139), (140, 159), (160, 179), (180, 220)]
            )
        ],
        "goals": [{"zone": 2, "minutes": 150}, {"zone": 4, "minutes": 45}],
    }


def save_preferences(client):
    response = client.put("/api/cardio-preferences", json=personal_preferences())
    assert response.status_code == 200, response.text
    return response.json()


def log_session(client, **values):
    response = client.post(
        "/api/cardio",
        json={
            "session_date": date.today().isoformat(),
            "activity_type": "Cycling",
            "duration_minutes": 30,
            "zone": "Zone 2",
            "qualifies_zone2": True,
            **values,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_defaults_persistence_account_isolation_and_revision(client, other_client):
    assert client.get("/api/cardio-preferences").json() == {
        "heart_rate_zones": [],
        "goals": [{"zone": 2, "minutes": 150}],
    }
    before = client.get("/api/workouts/revision").json()
    saved = save_preferences(client)
    assert client.get("/api/cardio-preferences").json() == saved
    assert client.get("/api/workouts/revision").json() != before
    assert other_client.get("/api/cardio-preferences").json()["heart_rate_zones"] == []
    session = log_session(client, average_heart_rate_bpm=120)
    assert (
        other_client.patch(
            f"/api/cardio/{session['id']}/metrics", json={"average_heart_rate_bpm": 170}
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "heart_rate,zone",
    [(None, None), (79, None), (110, 2), (139, 2), (140, 3), (170, 4), (221, None)],
)
def test_classification_uses_average_not_manual_zone(client, heart_rate, zone):
    save_preferences(client)
    session = log_session(client, average_heart_rate_bpm=heart_rate)
    assert session["zone"] == (f"Zone {zone}" if zone else None)
    assert session["qualifies_zone2"] == (zone == 2)


def test_unconfigured_does_not_count_and_settings_reclassify_existing_sessions(client):
    session = log_session(client, average_heart_rate_bpm=130)
    assert session["zone"] is None
    assert client.get("/api/dashboard").json()["zone2"]["completed_minutes"] == 0
    save_preferences(client)
    assert client.get("/api/cardio").json()["goal_weeks"][0]["completed_minutes"] == 30
    changed = personal_preferences()
    changed["heart_rate_zones"][1]["max_bpm"] = 129
    changed["heart_rate_zones"][2]["min_bpm"] = 130
    changed["goals"] = [{"zone": 3, "minutes": 90}]
    assert client.put("/api/cardio-preferences", json=changed).status_code == 200
    overview = client.get("/api/cardio").json()
    assert overview["sessions"][0]["zone"] == "Zone 3"
    assert overview["goal_weeks"][0]["completed_minutes"] == 30
    assert [goal["zone"] for goal in client.get("/api/dashboard").json()["cardio_goals"]] == [3]


def test_other_training_preferences_do_not_overwrite_personal_cardio_goals(client):
    saved = personal_preferences()
    saved["goals"][0]["minutes"] = 180
    assert client.put("/api/cardio-preferences", json=saved).status_code == 200
    legacy = client.get("/api/training-preferences").json()
    assert legacy["zone2_goal_minutes"] == 180
    assert (
        client.put(
            "/api/training-preferences",
            json={**legacy, "zone2_goal_minutes": 150, "week_start": "sunday"},
        ).status_code
        == 200
    )
    assert client.get("/api/cardio-preferences").json() == saved
    assert client.get("/api/cardio").json()["current_week"]["goal_minutes"] == 180


def test_multiple_goals_exclude_wrong_zones_future_and_previous_week_and_react_to_edits(client):
    save_preferences(client)
    log_session(client, average_heart_rate_bpm=120)
    session = log_session(client, average_heart_rate_bpm=170)
    log_session(client, average_heart_rate_bpm=150)
    log_session(client)
    for offset in (1, -7):
        log_session(
            client,
            average_heart_rate_bpm=120,
            session_date=(date.today() + timedelta(days=offset)).isoformat(),
        )
    dashboard = client.get("/api/dashboard").json()
    assert [goal["completed_minutes"] for goal in dashboard["cardio_goals"]] == [30, 30]
    response = client.patch(
        f"/api/cardio/{session['id']}/metrics", json={"average_heart_rate_bpm": 120}
    )
    assert response.json()["zone"] == "Zone 2"
    assert [
        goal["completed_minutes"] for goal in client.get("/api/cardio").json()["goal_weeks"]
    ] == [60, 0]
    client.patch(f"/api/cardio/{session['id']}/metrics", json={"average_heart_rate_bpm": None})
    assert client.get("/api/dashboard").json()["cardio_goals"][0]["completed_minutes"] == 30


@pytest.mark.parametrize(
    "invalid", ["overlap", "reversed", "missing", "duplicate", "zero", "fraction", "outside"]
)
def test_invalid_preferences_are_atomic(client, invalid):
    saved = save_preferences(client)
    changed = personal_preferences()
    if invalid == "overlap":
        changed["heart_rate_zones"][1]["min_bpm"] = 109
    elif invalid == "reversed":
        changed["heart_rate_zones"][1]["max_bpm"] = 100
    elif invalid == "missing":
        changed["heart_rate_zones"].pop()
    elif invalid == "duplicate":
        changed["goals"][1]["zone"] = 2
    elif invalid == "zero":
        changed["goals"][0]["minutes"] = 0
    elif invalid == "fraction":
        changed["heart_rate_zones"][1]["min_bpm"] = 110.5
    else:
        changed["heart_rate_zones"][4]["max_bpm"] = 251
    assert client.put("/api/cardio-preferences", json=changed).status_code == 422
    assert client.get("/api/cardio-preferences").json() == saved


def test_workout_weighted_average_and_metric_edit_do_not_double_count(client):
    save_preferences(client)
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["kind"] == "cardio"
    )
    response = client.post(
        "/api/workouts",
        json={
            "name": "Sample cardio",
            "category": "cardio",
            "workout_date": date.today().isoformat(),
            "movements": [
                {
                    "exercise_id": exercise["id"],
                    "sets": [
                        {
                            "duration_seconds": 1200,
                            "average_heart_rate_bpm": 120,
                            "completed": True,
                        },
                        {"duration_seconds": 600, "average_heart_rate_bpm": 150, "completed": True},
                        {
                            "duration_seconds": 3600,
                            "average_heart_rate_bpm": 200,
                            "completed": False,
                        },
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    session = client.get("/api/cardio").json()["sessions"][0]
    assert (session["average_heart_rate_bpm"], session["zone"]) == (130, "Zone 2")
    client.patch(f"/api/cardio/{session['id']}/metrics", json={"average_heart_rate_bpm": 170})
    overview = client.get("/api/cardio").json()
    assert len(overview["sessions"]) == 1
    assert [goal["completed_minutes"] for goal in overview["goal_weeks"]] == [0, 30]
    workout = client.get(f"/api/workouts/{response.json()['id']}").json()
    assert workout["movements"][0]["sets"][0]["average_heart_rate_bpm"] == 170
