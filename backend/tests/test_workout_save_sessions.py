from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from test_tracker import workout_payload

from app import tracker


def payload_for(client, session_id=None):
    exercise_id = next(
        item["id"] for item in client.get("/api/exercises").json() if item["kind"] == "strength"
    )
    payload = workout_payload(exercise_id)
    if session_id is not None:
        payload["client_session_id"] = session_id
    return payload


def test_retry_returns_saved_workout_without_overwriting_or_invalidating_cache(client):
    session_id = str(uuid4())
    payload = payload_for(client, session_id)
    first = client.post("/api/workouts", json=payload)
    assert first.status_code == 201
    assert first.json()["client_session_id"] == session_id
    saved = client.get(f"/api/workouts/{first.json()['id']}").json()
    revision = client.get("/api/workouts/revision").json()

    payload["duration_minutes"] = 180
    payload["notes"] = "Stale client must not overwrite the saved result"
    payload["movements"][0]["sets"][0]["reps"] = 1
    replay = client.post("/api/workouts", json=payload)
    assert replay.status_code == 201
    assert replay.json() == saved
    assert client.get("/api/workouts/revision").json() == revision
    assert len(client.get("/api/workouts").json()) == 1


def test_retry_recovers_a_save_committed_before_response_failure(client, monkeypatch):
    payload = payload_for(client, str(uuid4()))

    def fail_after_commit(*args, **kwargs):
        raise RuntimeError("Response lost after the save committed")

    monkeypatch.setattr(tracker, "backfill_completed_video_links", fail_after_commit)
    with pytest.raises(RuntimeError, match="Response lost"):
        client.post("/api/workouts", json=payload)
    saved = client.get("/api/workouts").json()
    assert len(saved) == 1
    revision = client.get("/api/workouts/revision").json()
    replay = client.post("/api/workouts", json={**payload, "duration_minutes": 180})
    assert replay.status_code == 201
    assert replay.json() == saved[0]
    assert client.get("/api/workouts/revision").json() == revision


def test_concurrent_saves_of_same_session_create_one_workout(client, monkeypatch):
    payload = payload_for(client, str(uuid4()))
    both_creating = Barrier(2)
    check_size = tracker.check_workout_size

    def wait_after_initial_session_lookup(*args, **kwargs):
        check_size(*args, **kwargs)
        both_creating.wait(timeout=10)

    monkeypatch.setattr(tracker, "check_workout_size", wait_after_initial_session_lookup)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/workouts", json=payload), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert all(response.json()["duration_minutes"] == 62 for response in responses)
    assert len(client.get("/api/workouts").json()) == 1


def test_session_ids_are_scoped_to_the_authenticated_account(client, other_client):
    session_id = str(uuid4())
    first = client.post("/api/workouts", json=payload_for(client, session_id))
    second = other_client.post("/api/workouts", json=payload_for(other_client, session_id))
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert [item["id"] for item in client.get("/api/workouts").json()] == [first.json()["id"]]
    assert [item["id"] for item in other_client.get("/api/workouts").json()] == [
        second.json()["id"]
    ]


def test_legacy_saves_without_session_ids_remain_independent(client):
    payload = payload_for(client)
    first = client.post("/api/workouts", json=payload)
    second = client.post("/api/workouts", json=payload)
    assert first.status_code == second.status_code == 201
    assert first.json()["client_session_id"] is None
    assert second.json()["client_session_id"] is None
    assert first.json()["id"] != second.json()["id"]


def test_editing_a_workout_cannot_replace_its_save_session(client):
    session_id = str(uuid4())
    other_session_id = str(uuid4())
    payload = payload_for(client, session_id)
    first = client.post("/api/workouts", json=payload).json()
    updated = client.put(
        f"/api/workouts/{first['id']}",
        json={**payload, "client_session_id": other_session_id, "duration_minutes": 75},
    )
    assert updated.status_code == 200
    assert updated.json()["client_session_id"] == session_id
    assert updated.json()["duration_minutes"] == 75
    assert client.post("/api/workouts", json=payload).json() == updated.json()
    other = client.post("/api/workouts", json={**payload, "client_session_id": other_session_id})
    assert other.status_code == 201
    assert other.json()["id"] != first["id"]


def test_rejected_workout_does_not_reserve_its_session(client):
    payload = payload_for(client, str(uuid4()))
    exercise_id = payload["movements"][0]["exercise_id"]
    payload["movements"][0]["exercise_id"] = "missing-exercise"
    assert client.post("/api/workouts", json=payload).status_code == 422
    assert client.get("/api/workouts").json() == []
    payload["movements"][0]["exercise_id"] = exercise_id
    assert client.post("/api/workouts", json=payload).status_code == 201


def test_session_ids_must_be_valid_uuids(client):
    assert client.post("/api/workouts", json=payload_for(client, "invalid")).status_code == 422
