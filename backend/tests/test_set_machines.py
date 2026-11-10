from copy import deepcopy

import pytest
from test_machine_photo_merge import machines, merge
from test_sharing import share
from test_tracker import upload_machine_photo, workout_payload


def payload_for(exercise, first, second):
    payload = workout_payload(exercise)
    movement = payload["movements"][0]
    movement["machine_photo_ids"] = [first["id"], second["id"]]
    movement["sets"] = [
        {"weight_kg": 60, "reps": 10, "machine_photo_id": first["id"]},
        {"weight_kg": 120, "reps": 8, "machine_photo_id": second["id"]},
    ]
    return payload


def test_mixed_sets_save_read_edit_and_separate_progress(client):
    exercise, first, second = machines(client)
    payload = payload_for(exercise, first, second)
    created = client.post("/api/workouts", json=payload)
    assert created.status_code == 201, created.text
    workout = created.json()
    saved = client.get(f"/api/workouts/{workout['id']}").json()
    assert [s["machine_photo_id"] for s in saved["movements"][0]["sets"]] == [
        first["id"],
        second["id"],
    ]
    progress = client.get(f"/api/progress/{exercise}").json()
    assert {p["machine_photo_id"]: p["best_weight_kg"] for p in progress["machine_points"]} == {
        first["id"]: 60,
        second["id"]: 120,
    }
    payload["movements"][0]["sets"][0]["machine_photo_id"] = second["id"]
    # Explicit support works on feature previews before release metadata is assembled.
    updated = client.put(f"/api/workouts/{workout['id']}", json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()["movements"][0]["sets"][0]["machine_photo_id"] == second["id"]
    payload["movements"][0]["sets"][0]["machine_photo_id"] = None
    cleared = client.put(
        f"/api/workouts/{workout['id']}", json=payload, headers={"X-Relay-Version": "1.3.0"}
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["movements"][0]["sets"][0]["machine_photo_id"] is None


@pytest.mark.parametrize("version", [None, "1.2.0"])
def test_old_client_edit_keeps_assignments_and_their_pins(client, version):
    exercise, first, second = machines(client)
    payload = payload_for(exercise, first, second)
    created = client.post("/api/workouts", json=payload).json()
    old = deepcopy(payload)
    for item in old["movements"][0]["sets"]:
        item.pop("machine_photo_id")
    old["movements"][0]["machine_photo_ids"] = []
    old["movements"][0]["sets"][0]["reps"] = 9
    response = client.put(
        f"/api/workouts/{created['id']}",
        json=old,
        headers={"X-Relay-Version": version} if version else {},
    )
    assert response.status_code == 200, response.text
    saved = response.json()["movements"][0]
    assert saved["sets"][0]["reps"] == 9
    assert [s["machine_photo_id"] for s in saved["sets"]] == [first["id"], second["id"]]
    assert {p["id"] for p in saved["machine_photos"]} == {first["id"], second["id"]}


def test_rejects_unpinned_wrong_exercise_and_foreign_machines(client, other_client):
    exercise, first, second = machines(client)
    other_exercise = client.get("/api/exercises").json()[1]["id"]
    wrong = upload_machine_photo(client, other_exercise, "Wrong exercise", "green")
    foreign_exercise = other_client.get("/api/exercises").json()[0]["id"]
    foreign = upload_machine_photo(other_client, foreign_exercise, "Private", "blue")
    for invalid in (second["id"], wrong["id"], foreign["id"], "missing"):
        payload = payload_for(exercise, first, second)
        payload["movements"][0]["machine_photo_ids"] = [first["id"]]
        payload["movements"][0]["sets"][0]["machine_photo_id"] = invalid
        assert client.post("/api/workouts", json=payload).status_code == 422


def test_merge_remaps_sets_and_stale_save_then_delete_clears_only_removed_machine(client):
    exercise, first, second = machines(client)
    payload = payload_for(exercise, first, second)
    created = client.post("/api/workouts", json=payload).json()
    assert merge(client, exercise, first, second).status_code == 200
    saved = client.get(f"/api/workouts/{created['id']}").json()
    assert {s["machine_photo_id"] for s in saved["movements"][0]["sets"]} == {first["id"]}
    stale = client.post("/api/workouts", json=payload)
    assert stale.status_code == 201, stale.text
    assert {s["machine_photo_id"] for s in stale.json()["movements"][0]["sets"]} == {first["id"]}
    assert (
        client.delete(
            f"/api/machine-photos/{first['id']}", params={"detach_from_workouts": True}
        ).status_code
        == 204
    )
    saved = client.get(f"/api/workouts/{created['id']}").json()
    assert all(s["machine_photo_id"] is None for s in saved["movements"][0]["sets"])


def test_machine_assignments_follow_photo_sharing_permissions(client, other_client):
    exercise, first, second = machines(client)
    client.post("/api/workouts", json=payload_for(exercise, first, second))
    share(client, share_machine_photos=False)
    base = f"/api/sharing/profiles/{client.user['id']}/workouts"
    saved = other_client.get(base).json()["workouts"][0]
    assert all(s["machine_photo_id"] is None for s in saved["movements"][0]["sets"])
    share(client, share_machine_photos=True)
    saved = other_client.get(base).json()["workouts"][0]
    assert [s["machine_photo_id"] for s in saved["movements"][0]["sets"]] == [
        first["id"],
        second["id"],
    ]
