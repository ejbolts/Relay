import json
import sqlite3
from contextlib import closing
from datetime import date

import pytest

from app.account_backups import BACKUP_DATABASE, backup_folder, create_account_snapshot
from app.config import get_settings
from app.database import SessionLocal
from app.models import User
from app.training_metrics import set_setting
from app.training_split import TRAINING_SPLIT_KEY


def split_payload(*types, **overrides):
    return {
        "name": "My split",
        "enabled": True,
        "start_date": "2026-10-26",
        "steps": [{"workout_type_id": item} for item in types],
        **overrides,
    }


def save_split(client, *types, **overrides):
    response = client.put("/api/training-split", json=split_payload(*types, **overrides))
    assert response.status_code == 200, response.text
    return response.json()


def recommended(client, on_date="2026-10-26"):
    response = client.get("/api/dashboard", params={"on_date": on_date})
    assert response.status_code == 200, response.text
    return response.json()["recommendation"]


def test_split_is_optional_persistent_account_owned_and_invalidates_cached_training(
    client, other_client
):
    assert client.get("/api/training-split").json() is None
    assert recommended(client)["split_name"] is None
    revision = client.get("/api/workouts/revision").json()["revision"]
    saved = save_split(client, "upper", "lower", None, name="  Upper / Lower  ")
    assert saved["name"] == "Upper / Lower"
    assert client.get("/api/training-split").json() == saved
    assert client.get("/api/workouts/revision").json()["revision"] != revision
    assert other_client.get("/api/training-split").json() is None
    assert recommended(other_client)["split_name"] is None
    assert recommended(client)["category"] == "upper"
    assert recommended(client)["workout_type"]["name"] == "Upper body"


@pytest.mark.parametrize(
    ("types", "expected"),
    [
        (["upper", "lower", None], ["upper", "lower", None, "upper", "lower", None, "upper"]),
        (["push", "pull", "lower", None], ["push", "pull", "lower", None, "push", "pull", "lower"]),
        (
            ["full_body", None],
            ["full_body", None, "full_body", None, "full_body", None, "full_body"],
        ),
        (["cardio", None], ["cardio", None, "cardio", None, "cardio", None, "cardio"]),
    ],
)
def test_templates_repeat_by_calendar_day_including_rest(client, types, expected):
    save_split(client, *types)
    for offset, type_id in enumerate(expected):
        item = recommended(
            client, date.fromordinal(date(2026, 10, 26).toordinal() + offset).isoformat()
        )
        assert item["is_rest_day"] is (type_id is None)
        assert item["needs_split_update"] is False
        assert (item["workout_type"]["id"] if item["workout_type"] else None) == type_id
        assert item["muscle_frequency"] == []


def test_every_other_day_continues_across_weeks_and_skipped_dates(client):
    save_split(client, "full_body", None)
    assert recommended(client, "2026-11-02")["is_rest_day"] is True
    assert recommended(client, "2026-11-03")["category"] == "full_body"
    assert recommended(client, "2027-01-01")["is_rest_day"] is True


def test_future_start_shows_first_scheduled_day_and_uses_the_requested_local_date(client):
    save_split(client, "pull", None, start_date="2026-11-01")
    before = recommended(client, "2026-10-31")
    assert before["category"] == "pull"
    assert before["scheduled_date"] == "2026-11-01"
    assert recommended(client, "2026-11-02")["is_rest_day"] is True


def test_history_does_not_advance_or_reorder_a_saved_calendar_split(client):
    save_split(client, "upper", "lower", None)
    exercise = client.get("/api/exercises").json()[0]
    saved = client.post(
        "/api/workouts",
        json={
            "name": "Extra workout",
            "workout_date": "2026-10-26",
            "category": "push",
            "movements": [{"exercise_id": exercise["id"], "sets": [{"weight_kg": 40, "reps": 8}]}],
        },
    )
    assert saved.status_code == 201, saved.text
    assert recommended(client)["category"] == "upper"
    assert recommended(client, "2026-10-27")["category"] == "lower"


def test_custom_types_keep_identity_and_follow_account_owned_names_and_colours(
    client, other_client
):
    custom = client.post(
        "/api/workout-types", json={"name": "Full body A", "color": "#123456"}
    ).json()
    foreign = other_client.post(
        "/api/workout-types", json={"name": "Full body A", "color": "#abcdef"}
    ).json()
    save_split(client, custom["id"], None)
    item = recommended(client)
    assert item["category"] == "other"
    assert item["workout_type"]["id"] == custom["id"]
    assert item["workout_type"]["color"] == "#123456"
    client.patch(f"/api/workout-types/{custom['id']}", json={"name": "Session A"})
    assert recommended(client)["session_name"] == "Session A workout"
    rejected = client.put("/api/training-split", json=split_payload(foreign["id"], None))
    assert rejected.status_code == 422
    assert client.get("/api/training-split").json()["steps"][0]["workout_type_id"] == custom["id"]


@pytest.mark.parametrize("custom", [False, True])
def test_removed_types_require_an_update_and_can_be_restored_or_disabled(client, custom):
    type_id = (
        client.post("/api/workout-types", json={"name": "Arms", "color": "#123456"}).json()["id"]
        if custom
        else "upper"
    )
    save_split(client, type_id, None)
    assert client.delete(f"/api/workout-types/{type_id}").status_code == 204
    item = recommended(client)
    assert item["needs_split_update"] is True
    assert item["session_name"] == "Update your split"
    assert client.put("/api/training-split", json=split_payload(type_id, None)).status_code == 422
    assert recommended(client, "2026-10-27")["is_rest_day"] is True
    save_split(client, type_id, None, enabled=False)
    assert recommended(client)["split_name"] is None
    assert client.get("/api/training-split").json()["enabled"] is False
    client.patch(f"/api/workout-types/{type_id}", json={"archived": False})
    save_split(client, type_id, None)
    assert recommended(client)["needs_split_update"] is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": "   "},
        {"name": "x" * 41},
        {"start_date": "invalid"},
        {"steps": []},
        {"steps": [{"workout_type_id": None}]},
        {"steps": [{"workout_type_id": "upper"}] * 29},
        {"steps": [{"workout_type_id": ""}]},
        {"steps": [{"workout_type_id": "not-owned"}]},
    ],
)
def test_invalid_splits_are_rejected_without_overwriting_saved_data(client, overrides):
    saved = save_split(client, "push", None)
    response = client.put("/api/training-split", json=split_payload("upper", **overrides))
    assert response.status_code == 422, response.text
    assert client.get("/api/training-split").json() == saved


def test_corrupt_stored_settings_do_not_break_dashboard_or_split_editor(client):
    with SessionLocal() as db:
        set_setting(db, client.user["id"], TRAINING_SPLIT_KEY, '{"steps": []}')
        db.commit()
    assert client.get("/api/training-split").json() is None
    assert recommended(client)["split_name"] is None


def test_split_endpoints_require_authentication(anonymous_client):
    assert anonymous_client.get("/api/training-split").status_code == 401
    assert (
        anonymous_client.put("/api/training-split", json=split_payload("push")).status_code == 401
    )


def test_account_snapshot_preserves_only_the_owners_split_and_custom_types(client, other_client):
    custom = client.post(
        "/api/workout-types", json={"name": "Full body A", "color": "#123456"}
    ).json()
    saved = save_split(client, custom["id"], None)
    save_split(other_client, "cardio", None, name="Someone else's cycle")
    settings = get_settings()
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        backup = create_account_snapshot(db, settings, user)
    database = backup_folder(settings, client.user["id"], backup.id) / BACKUP_DATABASE
    with closing(sqlite3.connect(database)) as connection:
        rows = connection.execute(
            "SELECT user_id, value FROM user_settings WHERE key = ?", (TRAINING_SPLIT_KEY,)
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == client.user["id"]
        assert json.loads(rows[0][1]) == saved
        assert connection.execute("SELECT id FROM workout_types").fetchall() == [(custom["id"],)]
