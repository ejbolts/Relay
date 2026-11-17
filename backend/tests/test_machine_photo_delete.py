from __future__ import annotations

from copy import deepcopy

from test_tracker import upload_machine_photo, workout_payload

from app.config import get_settings
from app.database import SessionLocal
from app.models import MachinePhoto


def test_confirmed_photo_deletion_detaches_workouts_without_changing_sets(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["name"] == "Leg Press"
    )
    photo = upload_machine_photo(client, exercise["id"], "Old machine", "#245589")
    keep = upload_machine_photo(client, exercise["id"], "Current machine", "#52984d")
    originals = []
    for reps in (8, 10):
        payload = workout_payload(exercise["id"])
        payload["movements"][0]["machine_photo_ids"] = [photo["id"], keep["id"]]
        payload["movements"][0]["sets"][0]["reps"] = reps
        response = client.post("/api/workouts", json=payload)
        assert response.status_code == 201
        originals.append(client.get(f"/api/workouts/{response.json()['id']}").json())
    records = client.get("/api/personal-records").json()
    revision = client.get("/api/workouts/revision").json()
    with SessionLocal() as db:
        stored = db.get(MachinePhoto, photo["id"])
        root = get_settings().machine_photos_dir
        paths = [root / stored.full_filename, root / stored.thumbnail_filename]
    assert all(path.is_file() for path in paths)

    # Existing API clients must still explicitly opt into detaching saved references.
    assert client.delete(f"/api/machine-photos/{photo['id']}").status_code == 409
    response = client.delete(
        f"/api/machine-photos/{photo['id']}", params={"detach_from_workouts": True}
    )
    assert response.status_code == 204
    for original in originals:
        expected = deepcopy(original)
        expected["movements"][0]["machine_photos"] = [
            item for item in original["movements"][0]["machine_photos"] if item["id"] == keep["id"]
        ]
        assert client.get(f"/api/workouts/{original['id']}").json() == expected
    assert client.get("/api/personal-records").json() == records
    assert client.get("/api/workouts/revision").json() != revision
    assert not any(path.exists() for path in paths)
    assert client.get(photo["full_url"]).status_code == 404
    assert client.get(keep["full_url"]).status_code == 200
    assert [item["id"] for item in client.get("/api/machine-photos").json()] == [keep["id"]]


def test_confirmed_deletion_cannot_remove_another_accounts_photo(client, other_client):
    exercise = client.get("/api/exercises").json()[0]
    photo = upload_machine_photo(client, exercise["id"], "Owned machine", "#245589")
    payload = workout_payload(exercise["id"])
    payload["movements"][0]["machine_photo_ids"] = [photo["id"]]
    workout = client.post("/api/workouts", json=payload).json()
    workout = client.get(f"/api/workouts/{workout['id']}").json()
    revision = client.get("/api/workouts/revision").json()
    response = other_client.delete(
        f"/api/machine-photos/{photo['id']}", params={"detach_from_workouts": True}
    )
    assert response.status_code == 404
    assert client.get(f"/api/workouts/{workout['id']}").json() == workout
    assert client.get(photo["full_url"]).status_code == 200
    assert client.get("/api/workouts/revision").json() == revision
