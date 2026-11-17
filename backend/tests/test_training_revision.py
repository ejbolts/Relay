"""The per-account revision signals every training edit to other signed-in devices."""

from datetime import date, timedelta

from fastapi.testclient import TestClient


def revision(client):
    response = client.get("/api/workouts/revision")
    assert response.status_code == 200
    return response.json()["revision"]


def test_workout_changes_reach_another_session_without_affecting_other_accounts(
    client, other_client
):
    desktop = TestClient(client.app)
    desktop.cookies.update(client.cookies)
    before = revision(desktop)
    other_before = revision(other_client)
    exercise = client.get("/api/exercises").json()[0]
    payload = {
        "name": "Phone workout",
        "workout_date": date.today().isoformat(),
        "category": "push",
        "movements": [{"exercise_id": exercise["id"], "sets": [{"reps": 8, "completed": True}]}],
    }
    try:
        created = client.post("/api/workouts", json=payload)
        assert created.status_code == 201
        workout_id = created.json()["id"]
        for method, body in [
            ("create", None),
            ("put", {**payload, "name": "Updated on phone"}),
            ("delete", None),
        ]:
            if method != "create":
                response = getattr(client, method)(
                    f"/api/workouts/{workout_id}", **({"json": body} if body else {})
                )
                assert response.status_code in (200, 204)
            current = revision(desktop)
            assert current != before
            snapshot = desktop.get("/api/workouts/snapshot").json()
            assert snapshot["revision"] == current
            assert [item["name"] for item in snapshot["workouts"]] == (
                []
                if method == "delete"
                else ["Updated on phone" if method == "put" else "Phone workout"]
            )
            assert revision(other_client) == other_before
            before = current
    finally:
        desktop.close()


def test_bodyweight_and_goals_signal_remote_refresh(client, other_client):
    other_before = revision(other_client)
    before = revision(client)
    for weight in (80, 81):
        response = client.post(
            "/api/body-measurements",
            json={"measurement_date": date.today().isoformat(), "weight_kg": weight},
        )
        assert response.status_code == 200
        assert revision(client) != before
        before = revision(client)
    response = client.delete(f"/api/body-measurements/{response.json()['id']}")
    assert response.status_code == 204
    assert revision(client) != before
    before = revision(client)
    goal = {
        "start_date": date.today().isoformat(),
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
        "start_weight_kg": 80,
        "target_weight_kg": 75,
        "active": True,
    }
    response = client.post("/api/body-weight-goals", json=goal)
    assert response.status_code == 201
    goal_id = response.json()["id"]
    assert revision(client) != before
    before = revision(client)
    assert (
        client.put(
            f"/api/body-weight-goals/{goal_id}", json={**goal, "target_weight_kg": 76}
        ).status_code
        == 200
    )
    assert revision(client) != before
    before = revision(client)
    assert client.delete(f"/api/body-weight-goals/{goal_id}").status_code == 204
    assert revision(client) != before
    assert revision(other_client) == other_before


def test_standalone_cardio_and_metrics_signal_remote_refresh(client):
    before = revision(client)
    payload = {
        "session_date": date.today().isoformat(),
        "activity_type": "Walk",
        "duration_minutes": 30,
        "zone": "Zone 2",
        "qualifies_zone2": True,
    }
    response = client.post("/api/cardio", json=payload)
    assert response.status_code == 201
    session_id = response.json()["id"]
    assert revision(client) != before
    for method, path, body in [
        ("put", f"/api/cardio/{session_id}", {**payload, "duration_minutes": 35}),
        ("patch", f"/api/cardio/{session_id}/calories", {"calories_kcal": 200}),
        ("patch", f"/api/cardio/{session_id}/metrics", {"distance_km": 3}),
        ("delete", f"/api/cardio/{session_id}", None),
    ]:
        before = revision(client)
        response = getattr(client, method)(path, **({"json": body} if body else {}))
        assert response.status_code in (200, 204)
        assert revision(client) != before


def test_bodyweight_import_signals_new_and_updated_entries(client):
    content = f"Date,Weight (kg)\n{date.today().isoformat()},80\n".encode()
    before = revision(client)
    for expected in (1, 0):
        response = client.post(
            "/api/body-measurements/import", files={"file": ("sample.csv", content, "text/csv")}
        )
        assert response.status_code == 201
        assert response.json()["measurements_created"] == expected
        assert response.json()["measurements_updated"] == 1 - expected
        assert revision(client) != before
        before = revision(client)
