from __future__ import annotations

import importlib.util
import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_PASSWORD
from sqlalchemy import create_engine, select, text

from app import client_versions
from app.auth import utc_now
from app.client_versions import CLIENT_VERSION_HEADER, is_older, normalized_version
from app.database import SessionLocal
from app.models import UserSession

REPO = Path(__file__).resolve().parents[2]


def exercise_id(client, name="Barbell Bench Press"):
    return next(e["id"] for e in client.get("/api/exercises").json() if e["name"] == name)


def three_exercises(client):
    first, second, third = [e["id"] for e in client.get("/api/exercises").json()][:3]
    return first, second, third


def workout_payload(lift, **workout):
    return {
        "name": "Sample lift",
        "workout_date": str(date.today()),
        "category": "push",
        "movements": [{"exercise_id": lift, "sets": [{"weight_kg": 60, "reps": 10}]}],
        **workout,
    }


def as_version(version):
    return {CLIENT_VERSION_HEADER: version} if version else {}


def test_versions_compare_numerically_and_missing_ones_count_as_older():
    assert normalized_version(" 1.10.0 ") == "1.10.0"
    assert normalized_version("1.2") is None
    assert normalized_version("1.2.0-beta") is None
    assert normalized_version("<script>") is None
    assert is_older("1.9.9", "1.10.0")
    assert not is_older("1.10.0", "1.10.0")
    assert not is_older("2.0.0", "1.10.0")
    assert is_older(None, "0.0.1")
    assert is_older("not a version", "0.0.1")
    with pytest.raises(ValueError):
        is_older("1.0.0", "next")


def test_minimum_never_exceeds_the_release_the_server_ships():
    release = json.loads((REPO / "frontend/release.json").read_text(encoding="utf-8"))
    minimum = client_versions.MIN_WRITE_CLIENT_VERSION
    assert minimum is None or not is_older(release["version"], minimum)
    for level, fields in client_versions.FIELDS_ADDED_IN.items():
        for field, since in fields.items():
            # Feature branches register additive fields before the release coordinator
            # assembles the next announcement. Unlike a write minimum, a future field
            # version safely preserves data for every currently deployed client.
            assert normalized_version(since) == since, (level, field)


def test_saves_are_open_to_every_release_while_no_minimum_is_set(client):
    assert client_versions.MIN_WRITE_CLIENT_VERSION is None
    lift = exercise_id(client)
    assert client.post("/api/workouts", json=workout_payload(lift)).status_code == 201


def test_older_releases_can_read_and_sign_in_but_not_save(client, monkeypatch):
    lift = exercise_id(client)
    monkeypatch.setattr(client_versions, "MIN_WRITE_CLIENT_VERSION", "1.3.0")
    for version in (None, "1.2.9", "garbage"):
        response = client.post(
            "/api/workouts", json=workout_payload(lift), headers=as_version(version)
        )
        assert response.status_code == 426
        assert response.json()["error"]["code"] == "client_outdated"
    assert client.get("/api/workouts", headers=as_version("1.0.0")).status_code == 200
    saved = client.post("/api/workouts", json=workout_payload(lift), headers=as_version("1.3.0"))
    assert saved.status_code == 201
    assert client.post("/api/auth/logout").status_code == 204


def test_sessions_record_their_release_for_the_admin_screen(client, other_client):
    client.get("/api/exercises", headers=as_version("1.2.0"))
    client.get("/api/exercises", headers=as_version("not-a-version"))
    other_client.get("/api/exercises")
    with SessionLocal() as db:
        versions = {
            session.user_id: session.client_version for session in db.scalars(select(UserSession))
        }
    assert versions == {client.user["id"]: "1.2.0", other_client.user["id"]: None}

    status = client.get("/api/admin/status", headers=as_version("1.2.1")).json()
    assert status["minimum_write_version"] is None
    usage = [(row["version"], row["users"], row["sessions"]) for row in status["client_versions"]]
    assert usage == [("1.2.1", 1, 1), (None, 1, 1)]


def test_admin_user_versions_group_devices_and_follow_updates_and_sign_out(client, other_client):
    now = utc_now()
    with SessionLocal() as db:
        for index, (version, expires_at, last_seen_at) in enumerate(
            [
                ("1.9.0", now + timedelta(days=1), now),
                ("1.10.0", now + timedelta(days=1), now),
                # An idle but still signed-in device belongs in the account's device total.
                ("1.10.0", now + timedelta(days=1), now - timedelta(days=31)),
                ("1.8.0", now - timedelta(seconds=1), now),
            ]
        ):
            db.add(
                UserSession(
                    user_id=other_client.user["id"],
                    token_hash=f"sample-version-session-{index}",
                    client_version=version,
                    expires_at=expires_at,
                    last_seen_at=last_seen_at,
                )
            )
        db.commit()

    def accounts():
        response = client.get("/api/admin/users", headers=as_version("1.12.0"))
        assert response.status_code == 200
        return {row["id"]: row for row in response.json()}

    users = accounts()
    assert users[client.user["id"]]["client_versions"] == [{"version": "1.12.0", "devices": 1}]
    other = users[other_client.user["id"]]
    assert other["signed_in_devices"] == 4
    assert other["client_versions"] == [
        {"version": "1.10.0", "devices": 2},
        {"version": "1.9.0", "devices": 1},
        {"version": None, "devices": 1},
    ]
    # A refreshed app reports its loaded version through the existing request header.
    assert other_client.get("/api/exercises", headers=as_version("1.11.0")).status_code == 200
    assert accounts()[other_client.user["id"]]["client_versions"] == [
        {"version": "1.11.0", "devices": 1},
        {"version": "1.10.0", "devices": 2},
        {"version": "1.9.0", "devices": 1},
    ]
    assert other_client.post("/api/auth/logout").status_code == 204
    other = accounts()[other_client.user["id"]]
    # Relay's sign-out ends every sign-in for the account.
    assert other["signed_in_devices"] == 0
    assert other["client_versions"] == []
    assert (
        other_client.post(
            "/api/auth/login", json={"username": "other", "password": TEST_PASSWORD}
        ).status_code
        == 200
    )
    assert accounts()[other_client.user["id"]]["signed_in_devices"] == 1
    disabled = client.patch(f"/api/admin/users/{other_client.user['id']}", json={"disabled": True})
    assert disabled.status_code == 200
    assert disabled.json()["signed_in_devices"] == 0
    assert disabled.json()["client_versions"] == []
    assert accounts()[other_client.user["id"]]["client_versions"] == []


@pytest.fixture
def notes_and_rpe_added_later(monkeypatch):
    monkeypatch.setattr(
        client_versions,
        "FIELDS_ADDED_IN",
        {"workout": {"notes": "1.3.0"}, "movement": {"notes": "1.3.0"}, "set": {"rpe": "1.3.0"}},
    )


def saved_with_extras(client, lift, other_lift):
    sets = [{"weight_kg": 60, "reps": 10, "rpe": 8}, {"weight_kg": 65, "reps": 8, "rpe": 9}]
    response = client.post(
        "/api/workouts",
        json=workout_payload(
            lift,
            notes="Felt strong",
            movements=[
                {"exercise_id": lift, "notes": "Pause reps", "sets": sets},
                {"exercise_id": other_lift, "notes": "Slow", "sets": [{"reps": 12, "rpe": 7}]},
            ],
        ),
    )
    assert response.status_code == 201, response.text
    return response.json()


def edited_by_older_release(client, workout, movements, version):
    response = client.put(
        f"/api/workouts/{workout['id']}",
        json=workout_payload(movements[0]["exercise_id"], movements=movements),
        headers=as_version(version),
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.usefixtures("notes_and_rpe_added_later")
@pytest.mark.parametrize("version", [None, "1.2.0"])
def test_older_releases_keep_fields_they_do_not_know_about(client, version):
    lift, other_lift, new_lift = three_exercises(client)
    saved = saved_with_extras(client, lift, other_lift)
    updated = edited_by_older_release(
        client,
        saved,
        [
            {"exercise_id": lift, "sets": [{"weight_kg": 62.5, "reps": 10}, {"reps": 6}, {}]},
            {"exercise_id": new_lift, "sets": [{"reps": 5}]},
        ],
        version,
    )
    assert updated["notes"] == "Felt strong"
    first, second = updated["movements"]
    assert first["notes"] == "Pause reps"
    assert [(item["weight_kg"], item["reps"], item["rpe"]) for item in first["sets"]] == [
        (62.5, 10, 8),
        (None, 6, 9),
        (None, None, None),
    ]
    # A different exercise at this position is new to the record.
    assert second["notes"] is None
    assert second["sets"][0]["rpe"] is None


@pytest.mark.usefixtures("notes_and_rpe_added_later")
def test_releases_that_know_a_field_can_clear_it(client):
    lift, other_lift, _ = three_exercises(client)
    saved = saved_with_extras(client, lift, other_lift)
    updated = edited_by_older_release(
        client, saved, [{"exercise_id": lift, "sets": [{"weight_kg": 60, "reps": 10}]}], "1.3.0"
    )
    assert updated["notes"] is None
    assert updated["movements"][0]["notes"] is None
    assert updated["movements"][0]["sets"][0]["rpe"] is None


def load_migration(name, operations):
    path = REPO / f"backend/migrations/versions/{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    migration.op = operations
    return migration


def test_session_version_migration_keeps_sign_ins_and_downgrades():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE user_sessions (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36))")
        )
        connection.execute(text("INSERT INTO user_sessions VALUES ('s', 'u')"))
        migration = load_migration(
            "0051_session_client_version", Operations(MigrationContext.configure(connection))
        )
        migration.upgrade()
        assert connection.execute(text("SELECT * FROM user_sessions")).all() == [("s", "u", None)]
        migration.downgrade()
        assert connection.execute(text("SELECT * FROM user_sessions")).all() == [("s", "u")]
