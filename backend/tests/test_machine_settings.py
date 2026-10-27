import json
import sqlite3
from contextlib import closing

import pytest
from test_sharing import befriend, share
from test_tracker import workout_payload

from app.account_backups import BACKUP_DATABASE, backup_folder, create_account_snapshot
from app.config import get_settings
from app.database import SessionLocal
from app.models import User


def exercise_id(client):
    return client.get("/api/exercises").json()[0]["id"]


def test_custom_settings_round_trip_and_account_isolation(client, other_client):
    exercise = exercise_id(client)
    path = f"/api/exercises/{exercise}/machine-settings"
    assert client.get(path).json() == {"settings": []}
    payload = {
        "settings": [
            {"name": " Seat height ", "value": " 5 "},
            {"name": "Start position", "value": "B"},
        ]
    }
    saved = client.put(path, json=payload)
    assert saved.status_code == 200
    assert saved.json()["settings"][0] == {"name": "Seat height", "value": "5"}
    assert client.get(path).json() == saved.json()
    assert other_client.get(path).status_code == 404
    assert other_client.put(path, json=payload).status_code == 404
    other_path = f"/api/exercises/{exercise_id(other_client)}/machine-settings"
    assert other_client.get(other_path).json() == {"settings": []}
    assert client.put(path, json={"settings": []}).json() == {"settings": []}
    assert client.get(path).json() == {"settings": []}


@pytest.mark.parametrize(
    "setting",
    [
        {"name": " ", "value": "5"},
        {"name": "Seat", "value": ""},
        {"name": "x" * 41, "value": "5"},
        {"name": "Seat", "value": "x" * 31},
        {"name": "Seat", "value": 5},
    ],
)
def test_invalid_settings_preserve_saved_values(client, setting):
    path = f"/api/exercises/{exercise_id(client)}/machine-settings"
    saved = {"settings": [{"name": "Seat", "value": "5"}]}
    assert client.put(path, json=saved).status_code == 200
    assert client.put(path, json={"settings": [setting]}).status_code == 422
    assert client.get(path).json() == saved


def test_settings_require_sign_in(anonymous_client):
    path = "/api/exercises/unknown/machine-settings"
    assert anonymous_client.get(path).status_code == 401
    assert anonymous_client.put(path, json={"settings": []}).status_code == 401


def test_row_limit(client):
    path = f"/api/exercises/{exercise_id(client)}/machine-settings"
    assert (
        client.put(path, json={"settings": [{"name": "Seat", "value": "5"}] * 21}).status_code
        == 422
    )


def test_workout_snapshot_and_backups_keep_settings(client):
    exercise = exercise_id(client)
    path = f"/api/exercises/{exercise}/machine-settings"
    original = [{"name": "Seat", "value": "5"}, {"name": "Angle", "value": "45°"}]
    assert client.put(path, json={"settings": original}).status_code == 200
    payload = workout_payload(exercise)
    payload["movements"][0]["machine_settings"] = original
    response = client.post("/api/workouts", json=payload)
    assert response.status_code == 201, response.text
    workout_id = response.json()["id"]
    changed = [{"name": "Seat", "value": "B"}]
    client.put(path, json={"settings": changed})
    read = client.get(f"/api/workouts/{workout_id}").json()
    assert read["movements"][0]["machine_settings"] == original
    assert client.put(f"/api/workouts/{workout_id}", json=payload).status_code == 200
    assert client.get(path).json()["settings"] == changed
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        backup = create_account_snapshot(db, get_settings(), user)
    database = backup_folder(get_settings(), user.id, backup.id) / BACKUP_DATABASE
    with closing(sqlite3.connect(database)) as connection:
        snapshot = connection.execute("SELECT machine_settings FROM workout_movements").fetchone()
        defaults = connection.execute(
            "SELECT value FROM user_settings WHERE key = ?", (f"machine_settings:{exercise}",)
        ).fetchone()
    assert json.loads(snapshot[0]) == original
    assert json.loads(defaults[0])["settings"] == changed


def test_shared_workouts_only_include_settings_when_notes_are_shared(client, other_client):
    payload = workout_payload(exercise_id(client))
    original = [{"name": "Seat", "value": "5"}]
    payload["movements"][0]["machine_settings"] = original
    assert client.post("/api/workouts", json=payload).status_code == 201
    befriend(client, other_client)
    path = f"/api/sharing/profiles/{client.user['id']}/workouts"
    share(client, share_notes=False)
    assert other_client.get(path).json()["workouts"][0]["movements"][0]["machine_settings"] == []
    share(client, share_notes=True)
    assert (
        other_client.get(path).json()["workouts"][0]["movements"][0]["machine_settings"] == original
    )
