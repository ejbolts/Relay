import json
import sqlite3
from contextlib import closing

import pytest
from test_sharing import share
from test_tracker import upload_machine_photo, workout_payload

from app.account_backups import BACKUP_DATABASE, backup_folder, create_account_snapshot
from app.config import get_settings
from app.database import SessionLocal
from app.models import User


def machines(client):
    exercise = client.get("/api/exercises").json()[0]["id"]
    first = upload_machine_photo(client, exercise, "Home press", "blue")
    second = upload_machine_photo(client, exercise, "Same press", "red")
    return exercise, first, second


def merge(client, exercise, first, second, **overrides):
    return client.post(
        f"/api/exercises/{exercise}/machine-photos/merge",
        json={
            "photo_ids": [first["id"], second["id"]],
            "keep_photo_id": first["id"],
            "caption": "Combined press",
            **overrides,
        },
    )


def save_workout(client, exercise, ids, seat):
    payload = workout_payload(exercise)
    payload["movements"][0]["machine_photo_ids"] = ids
    payload["movements"][0]["machine_settings"] = [{"name": "Seat", "value": seat}]
    response = client.post("/api/workouts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_merge_keeps_images_history_presets_and_stale_drafts(client):
    exercise, first, second = machines(client)
    settings_path = f"/api/exercises/{exercise}/machine-settings"
    for photo, seat in ((first, "5"), (second, "9")):
        assert (
            client.put(
                settings_path,
                params={"machine_photo_id": photo["id"]},
                json={"settings": [{"name": "Seat", "value": seat}]},
            ).status_code
            == 200
        )
    first_workout = save_workout(client, exercise, [first["id"]], "4")
    second_workout = save_workout(client, exercise, [second["id"]], "8")
    both = save_workout(client, exercise, [first["id"], second["id"]], "6")
    before_revision = client.get("/api/workouts/revision").json()
    original_bytes = {
        photo["id"]: client.get(photo["full_url"]).content for photo in (first, second)
    }
    response = merge(client, exercise, first, second)
    assert response.status_code == 200, response.text
    merged = response.json()
    assert merged["id"] == first["id"]
    assert merged["caption"] == "Combined press"
    assert merged["workout_count"] == 3
    assert {image["id"] for image in merged["images"]} == {first["id"], second["id"]}
    for image in merged["images"]:
        assert client.get(image["full_url"]).content == original_bytes[image["id"]]
    assert client.get("/api/machine-photos").json() == [merged]
    assert client.get(f"/api/exercises/{exercise}/machine-photos").json() == [merged]
    assert client.get("/api/workouts/revision").json() != before_revision
    for workout, seat in ((first_workout, "4"), (second_workout, "8"), (both, "6")):
        saved = client.get(f"/api/workouts/{workout['id']}").json()["movements"][0]
        assert len(saved["machine_photos"]) == 1
        assert saved["machine_photos"][0]["id"] == first["id"]
        assert saved["machine_settings"] == [{"name": "Seat", "value": seat}]
    for photo in (first, second):
        assert len(client.get(f"/api/machine-photos/{photo['id']}/workouts").json()) == 3
        assert client.get(settings_path, params={"machine_photo_id": photo["id"]}).json() == {
            "settings": [{"name": "Seat", "value": "5"}]
        }
    # Another tab or a recovered draft may still submit the old IDs together.
    stale = save_workout(client, exercise, [second["id"], first["id"]], "7")
    assert [p["id"] for p in stale["movements"][0]["machine_photos"]] == [first["id"]]
    assert stale["movements"][0]["machine_settings"] == [{"name": "Seat", "value": "7"}]
    assert (
        client.get(f"/api/exercises/{exercise}/machine-photos/last-used").json()[0]["id"]
        == first["id"]
    )


def test_groups_can_merge_again_and_keep_all_members_in_backup(client):
    exercise, first, second = machines(client)
    third = upload_machine_photo(client, exercise, "Another angle", "green")
    assert merge(client, exercise, first, second).status_code == 200
    response = merge(client, exercise, third, first)
    assert response.status_code == 200, response.text
    grouped = response.json()
    assert grouped["id"] == third["id"]
    assert {p["id"] for p in grouped["images"]} == {first["id"], second["id"], third["id"]}
    assert len(client.get("/api/machine-photos").json()) == 1
    stale = save_workout(client, exercise, [second["id"]], "3")
    assert stale["movements"][0]["machine_photos"][0]["id"] == third["id"]
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        snapshot = create_account_snapshot(db, get_settings(), user)
        folder = backup_folder(get_settings(), user.id, snapshot.id)
    with closing(sqlite3.connect(folder / BACKUP_DATABASE)) as saved:
        rows = saved.execute("SELECT id, merged_into_id FROM machine_photos").fetchall()
        assert dict(rows) == {
            first["id"]: third["id"],
            second["id"]: third["id"],
            third["id"]: None,
        }
        assert saved.execute("PRAGMA foreign_key_check").fetchall() == []
    manifest = json.loads((folder / "manifest.json").read_text())
    assert len([item for item in manifest["files"] if "machine-photos" in str(item)]) == 6


def test_merge_rejects_foreign_and_wrong_exercise_photos_atomically(client, other_client):
    exercise, first, second = machines(client)
    foreign_exercise, foreign, _ = machines(other_client)
    assert merge(other_client, exercise, first, second).status_code == 404
    assert merge(client, exercise, first, foreign).status_code == 404
    own_other_exercise = client.get("/api/exercises").json()[1]["id"]
    wrong = upload_machine_photo(client, own_other_exercise, "Other exercise", "green")
    assert merge(client, exercise, first, wrong).status_code == 404
    assert merge(client, exercise, first, second, keep_photo_id=foreign["id"]).status_code == 422
    assert merge(client, exercise, first, second, caption=" ").status_code == 422
    assert merge(client, exercise, first, first).status_code == 422
    assert len(client.get(f"/api/exercises/{exercise}/machine-photos").json()) == 2
    assert len(other_client.get(f"/api/exercises/{foreign_exercise}/machine-photos").json()) == 2
    assert client.get(first["full_url"]).status_code == 200


def test_failed_merge_rolls_back_names_groups_and_workout_links(client, monkeypatch):
    exercise, first, second = machines(client)
    workout = save_workout(client, exercise, [second["id"]], "5")

    def fail(*args):
        raise RuntimeError("simulated write failure")

    monkeypatch.setattr("app.tracker.bump_workout_cache_revision", fail)
    with pytest.raises(RuntimeError, match="simulated write failure"):
        merge(client, exercise, first, second)
    photos = client.get(f"/api/exercises/{exercise}/machine-photos").json()
    assert {p["caption"] for p in photos} == {first["caption"], second["caption"]}
    assert all(len(p["images"]) == 1 for p in photos)
    saved = client.get(f"/api/workouts/{workout['id']}").json()
    assert saved["movements"][0]["machine_photos"][0]["id"] == second["id"]


def test_stale_merge_conflicts_do_not_rename_or_cycle_a_group(client):
    exercise, first, second = machines(client)
    third = upload_machine_photo(client, exercise, "Third machine", "green")
    assert merge(client, exercise, first, second).status_code == 200
    for keep in (second, third):
        response = merge(client, exercise, second, third, keep_photo_id=keep["id"])
        assert response.status_code == 409
    photos = client.get(f"/api/exercises/{exercise}/machine-photos").json()
    assert {p["caption"] for p in photos} == {"Combined press", "Third machine"}
    assert sorted(len(p["images"]) for p in photos) == [1, 2]


def test_group_deletion_protects_history_then_deletes_all_group_files(client):
    exercise, first, second = machines(client)
    workout = save_workout(client, exercise, [second["id"]], "5")
    assert merge(client, exercise, first, second).status_code == 200
    assert client.delete(f"/api/machine-photos/{first['id']}").status_code == 409
    assert client.delete(f"/api/machine-photos/{second['id']}").status_code == 409
    assert client.delete(f"/api/workouts/{workout['id']}").status_code == 204
    assert client.delete(f"/api/machine-photos/{first['id']}").status_code == 204
    assert client.get("/api/machine-photos").json() == []
    assert list(get_settings().machine_photos_dir.iterdir()) == []


def test_shared_group_images_respect_owner_sharing_and_access(client, other_client):
    exercise, first, second = machines(client)
    save_workout(client, exercise, [second["id"]], "5")
    assert merge(client, exercise, first, second).status_code == 200
    share(client, share_machine_photos=True)
    share(other_client)
    base = f"/api/sharing/profiles/{client.user['id']}"
    shared = other_client.get(f"{base}/workouts").json()["workouts"][0]
    photo = shared["movements"][0]["machine_photos"][0]
    assert len(photo["images"]) == 2
    for image in photo["images"]:
        assert image["full_url"].startswith(base)
        assert other_client.get(image["full_url"]).status_code == 200
        assert other_client.get(f"/api/machine-photos/{image['id']}/image").status_code == 404
    share(client, share_machine_photos=False)
    for image in photo["images"]:
        assert other_client.get(image["full_url"]).status_code == 404
