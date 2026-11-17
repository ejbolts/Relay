import json

import pytest
from test_account_backups import rows, snapshot

from app.account_backups import BACKUP_DATABASE, backup_folder
from app.config import get_settings


def test_body_sizes_persist_replace_sort_and_isolate_accounts(client, other_client):
    assert client.get("/api/body-sizes").json() == []
    revision = client.get("/api/workouts/revision").json()
    first = client.put(
        "/api/body-sizes",
        json={"measurement_date": "2026-10-20", "waist_cm": 82, "left_arm_cm": 36},
    )
    assert first.status_code == 200
    assert client.get("/api/workouts/revision").json() != revision
    assert other_client.get("/api/body-sizes").json() == []
    client.put("/api/body-sizes", json={"measurement_date": "2026-10-25", "chest_cm": 104})
    updated = client.put(
        "/api/body-sizes", json={"measurement_date": "2026-10-20", "waist_cm": 81.5}
    )
    assert updated.json()["left_arm_cm"] is None
    rows = client.get("/api/body-sizes").json()
    assert [row["measurement_date"] for row in rows] == ["2026-10-25", "2026-10-20"]
    assert rows[1]["waist_cm"] == 81.5
    assert other_client.delete("/api/body-sizes/2026-10-20").status_code == 404
    assert len(client.get("/api/body-sizes").json()) == 2
    revision = client.get("/api/workouts/revision").json()
    assert client.delete("/api/body-sizes/2026-10-20").status_code == 204
    assert client.get("/api/workouts/revision").json() != revision
    assert len(client.get("/api/body-sizes").json()) == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"measurement_date": "invalid", "waist_cm": 80},
        {"measurement_date": "2026-10-20"},
        {"measurement_date": "2026-10-20", "waist_cm": 0},
        {"measurement_date": "2026-10-20", "waist_cm": -1},
        {"measurement_date": "2026-10-20", "waist_cm": 301},
        {"measurement_date": "2026-10-20", "unknown_cm": 40},
    ],
)
def test_body_sizes_validation_keeps_saved_data(client, payload):
    client.put("/api/body-sizes", json={"measurement_date": "2026-10-20", "waist_cm": 80})
    assert client.put("/api/body-sizes", json=payload).status_code == 422
    assert client.get("/api/body-sizes").json()[0]["waist_cm"] == 80


def test_body_sizes_are_included_only_in_the_owners_backup(client, other_client):
    payload = {"measurement_date": "2026-10-20", "waist_cm": 81}
    assert client.put("/api/body-sizes", json=payload).status_code == 200
    backup = snapshot("owner")
    folder = backup_folder(get_settings(), client.user["id"], backup.id)
    stored = rows(
        folder / BACKUP_DATABASE, "SELECT value FROM user_settings WHERE key LIKE 'body_sizes:%'"
    )
    assert len(stored) == 1
    assert json.loads(stored[0][0])["waist_cm"] == 81
    other = snapshot("other")
    other_folder = backup_folder(get_settings(), other_client.user["id"], other.id)
    assert (
        rows(
            other_folder / BACKUP_DATABASE,
            "SELECT value FROM user_settings WHERE key LIKE 'body_sizes:%'",
        )
        == []
    )
