import pytest


def test_weekly_muscle_set_goal_defaults_persists_and_is_account_owned(client, other_client):
    preferences = client.get("/api/training-preferences").json()
    assert preferences["weekly_muscle_set_goal"] == 10
    updated = client.put(
        "/api/training-preferences", json={**preferences, "weekly_muscle_set_goal": 14}
    )
    assert updated.status_code == 200
    assert updated.json()["weekly_muscle_set_goal"] == 14
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 14
    assert other_client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 10

    # An older client updating units or the start day must not reset the saved goal.
    preferences.pop("weekly_muscle_set_goal")
    assert client.put("/api/training-preferences", json=preferences).status_code == 200
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 14


@pytest.mark.parametrize("goal", [0, -1, 1001, 2.5])
def test_weekly_muscle_set_goal_rejects_invalid_values(client, goal):
    preferences = client.get("/api/training-preferences").json()
    response = client.put(
        "/api/training-preferences", json={**preferences, "weekly_muscle_set_goal": goal}
    )
    assert response.status_code == 422
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goal"] == 10


def test_per_muscle_goals_are_owned_persist_and_survive_older_clients(client, other_client):
    preferences = client.get("/api/training-preferences").json()
    assert preferences["weekly_muscle_set_goals"] == {}
    goals = {"Pectorals": 18, "Quads": 6, "Custom muscle": 12}
    response = client.put(
        "/api/training-preferences", json={**preferences, "weekly_muscle_set_goals": goals}
    )
    assert response.status_code == 200
    assert response.json()["weekly_muscle_set_goals"] == goals
    assert client.get("/api/training-preferences").json()["weekly_muscle_set_goals"] == goals
    assert other_client.get("/api/training-preferences").json()["weekly_muscle_set_goals"] == {}

    preferences.pop("weekly_muscle_set_goals")
    preferences["weekly_muscle_set_goal"] = 8
    preferences["preferred_weight_unit"] = "lb"
    assert client.put("/api/training-preferences", json=preferences).status_code == 200
    saved = client.get("/api/training-preferences").json()
    assert saved["weekly_muscle_set_goals"] == goals
    assert saved["weekly_muscle_set_goal"] == 8
    assert saved["preferred_weight_unit"] == "lb"

    response = client.put(
        "/api/training-preferences", json={**preferences, "weekly_muscle_set_goals": {}}
    )
    assert response.status_code == 200
    assert response.json()["weekly_muscle_set_goals"] == {}


@pytest.mark.parametrize(
    "goals", [{"Quads": value} for value in (0, -1, 1001, 2.5)] + [{"": 10}, {" ": 10}]
)
def test_invalid_per_muscle_goals_do_not_change_saved_preferences(client, goals):
    preferences = client.get("/api/training-preferences").json()
    response = client.put(
        "/api/training-preferences",
        json={**preferences, "weekly_muscle_set_goal": 14, "weekly_muscle_set_goals": goals},
    )
    assert response.status_code == 422
    saved = client.get("/api/training-preferences").json()
    assert saved["weekly_muscle_set_goal"] == 10
    assert saved["weekly_muscle_set_goals"] == {}
