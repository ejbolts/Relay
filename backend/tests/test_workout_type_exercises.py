from test_exercise_merge import custom, merge, official

from app.database import SessionLocal
from app.models import UserSetting

BASE = "/api/workout-type-exercises"


def movements(*exercises):
    return {
        "movements": [
            {
                "exercise_id": exercise["id"],
                "sets": [{"reps": 8, "weight_kg": 50, "rest_seconds": 120}] * 3,
            }
            for exercise in exercises
        ]
    }


def test_types_hold_their_own_exercises_per_account(client, other_client):
    bench = official(client)
    arms = client.post("/api/workout-types", json={"name": "Arms", "color": "#a855f7"}).json()
    assert client.get(BASE).json() == []
    response = client.put(f"{BASE}/{arms['id']}", json=movements(bench))
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["workout_type_id"] == arms["id"]
    assert saved["movements"][0]["exercise"]["name"] == "Barbell Bench Press"
    assert len(saved["movements"][0]["sets"]) == 3
    push = client.put(f"{BASE}/push", json=movements(bench)).json()
    assert push["workout_type_id"] == "push"
    listed = client.get(BASE)
    assert listed.headers["cache-control"] == "no-store"
    assert {item["workout_type_id"] for item in listed.json()} == {arms["id"], "push"}
    # Other accounts cannot see, write to or use another account's types and exercises.
    assert other_client.get(BASE).json() == []
    assert other_client.put(f"{BASE}/{arms['id']}", json=movements(bench)).status_code == 404
    assert other_client.put(f"{BASE}/push", json=movements(bench)).status_code == 422
    assert client.put(f"{BASE}/unknown", json=movements(bench)).status_code == 404
    # Saving an empty list clears the type.
    assert client.put(f"{BASE}/push", json={"movements": []}).json()["movements"] == []
    assert [item["workout_type_id"] for item in client.get(BASE).json()] == [arms["id"]]
    with SessionLocal() as db:
        assert db.get(UserSetting, (client.user["id"], "type_exercises:push")) is None


def test_saved_exercises_follow_exercise_merges(client):
    source, target = custom(client), official(client)
    assert client.put(f"{BASE}/upper", json=movements(source)).status_code == 200
    assert merge(client, source, target).status_code == 200
    saved = client.get(BASE).json()[0]
    assert saved["movements"][0]["exercise_id"] == target["id"]
    # An older app still holding the merged id is redirected to the surviving exercise.
    response = client.put(f"{BASE}/lower", json=movements(source))
    assert response.status_code == 200, response.text
    assert response.json()["movements"][0]["exercise_id"] == target["id"]


def test_limits_match_a_split_day(client):
    bench = official(client)
    assert client.put(f"{BASE}/upper", json=movements(*[bench] * 21)).status_code == 422
    too_many_sets = {"movements": [{"exercise_id": bench["id"], "sets": [{"reps": 5}] * 51}]}
    assert client.put(f"{BASE}/upper", json=too_many_sets).status_code == 422
