from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from test_cardio_energy import cardio_payload
from test_tracker import workout_payload

from app import tracker


def saved_workout(client) -> tuple[dict, dict]:
    exercise_id = next(
        item["id"] for item in client.get("/api/exercises").json() if item["kind"] == "strength"
    )
    payload = workout_payload(exercise_id)
    response = client.post("/api/workouts", json=payload)
    assert response.status_code == 201
    return payload, response.json()


def test_new_workouts_start_at_revision_one_and_ignore_a_base_revision(client):
    payload, workout = saved_workout(client)
    assert workout["revision"] == 1
    other = client.post("/api/workouts", json={**payload, "base_revision": 7})
    assert other.status_code == 201
    assert other.json()["revision"] == 1


def test_save_from_the_loaded_revision_advances_it(client):
    payload, workout = saved_workout(client)
    response = client.put(
        f"/api/workouts/{workout['id']}",
        json={**payload, "notes": "Edited once", "base_revision": 1},
    )
    assert response.status_code == 200
    assert response.json()["revision"] == 2
    assert response.json()["notes"] == "Edited once"
    again = client.put(
        f"/api/workouts/{workout['id']}",
        json={**payload, "notes": "Edited twice", "base_revision": 2},
    )
    assert again.status_code == 200
    assert again.json()["revision"] == 3


def test_stale_save_is_refused_and_changes_nothing(client):
    payload, workout = saved_workout(client)
    path = f"/api/workouts/{workout['id']}"
    newer = client.put(path, json={**payload, "notes": "Saved on the laptop", "base_revision": 1})
    assert newer.status_code == 200
    cache_revision = client.get("/api/workouts/revision").json()

    stale = {**payload, "notes": "Stale phone copy", "duration_minutes": 5, "base_revision": 1}
    stale["movements"] = [{**payload["movements"][0], "sets": payload["movements"][0]["sets"][:1]}]
    refused = client.put(path, json=stale)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "workout_conflict"

    kept = client.get(path).json()
    assert kept == newer.json()
    assert kept["notes"] == "Saved on the laptop"
    assert len(kept["movements"][0]["sets"]) == 2
    assert client.get("/api/workouts/revision").json() == cache_revision


def test_keeping_the_stale_version_works_from_the_latest_revision(client):
    payload, workout = saved_workout(client)
    path = f"/api/workouts/{workout['id']}"
    client.put(path, json={**payload, "notes": "Saved on the laptop", "base_revision": 1})
    latest = client.get(path).json()
    kept = client.put(
        path, json={**payload, "notes": "Phone copy kept", "base_revision": latest["revision"]}
    )
    assert kept.status_code == 200
    assert kept.json()["notes"] == "Phone copy kept"
    assert kept.json()["revision"] == 3


def test_save_without_a_base_revision_still_replaces_the_workout(client):
    """Apps released before revisions keep saving as they always did."""
    payload, workout = saved_workout(client)
    path = f"/api/workouts/{workout['id']}"
    client.put(path, json={**payload, "notes": "Newer", "base_revision": 1})
    older_app = client.put(path, json={**payload, "notes": "Older app"})
    assert older_app.status_code == 200
    assert older_app.json()["notes"] == "Older app"
    assert older_app.json()["revision"] == 3


def test_two_saves_from_the_same_revision_cannot_both_win(client, monkeypatch):
    payload, workout = saved_workout(client)
    path = f"/api/workouts/{workout['id']}"
    both_loaded = Barrier(2)
    advance = tracker.advance_workout_revision

    def wait_until_both_loaded(*args, **kwargs):
        both_loaded.wait(timeout=10)
        advance(*args, **kwargs)

    monkeypatch.setattr(tracker, "advance_workout_revision", wait_until_both_loaded)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda note: client.put(path, json={**payload, "notes": note, "base_revision": 1}),
                ["First device", "Second device"],
            )
        )
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    saved = client.get(path).json()
    assert saved["revision"] == 2
    assert saved["notes"] == winner["notes"]


def test_cardio_metric_edits_advance_the_workout_they_rewrite(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["kind"] == "cardio"
    )
    session = client.post(
        "/api/cardio", json=cardio_payload(exercise_id=exercise["id"], distance_km=5)
    ).json()
    path = f"/api/workouts/{session['source_workout_id']}"
    opened = client.get(path).json()
    assert opened["revision"] == 1
    assert (
        client.patch(f"/api/cardio/{session['id']}/metrics", json={"distance_km": 8}).status_code
        == 200
    )
    changed = client.get(path).json()
    assert changed["revision"] == 2
    assert changed["movements"][0]["sets"][0]["distance_km"] == 8

    stale = {
        "name": opened["name"],
        "workout_date": opened["workout_date"],
        "category": opened["category"],
        "notes": None,
        "duration_minutes": opened["duration_minutes"],
        "base_revision": opened["revision"],
        "movements": [
            {
                "exercise_id": exercise["id"],
                "notes": None,
                "sets": [{"duration_seconds": 1_800, "distance_km": 5, "completed": True}],
            }
        ],
    }
    assert client.put(path, json=stale).status_code == 409
    assert client.get(path).json()["movements"][0]["sets"][0]["distance_km"] == 8


def test_other_accounts_cannot_probe_a_workout_revision(client, other_client):
    payload, workout = saved_workout(client)
    response = other_client.put(
        f"/api/workouts/{workout['id']}", json={**payload, "base_revision": 1}
    )
    assert response.status_code == 404
    assert client.get(f"/api/workouts/{workout['id']}").json()["revision"] == 1
