from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_INVITE_CODE, TEST_PASSWORD, create_session, register_user
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text

from app.auth import ACCOUNT_LOGIN_MAX_FAILURES
from app.config import get_settings
from app.database import SessionLocal
from app.main import create_app
from app.models import Exercise, MachinePhoto, SessionStatus, WorkoutSession

ADMIN_ROUTES = (
    ("GET", "/api/admin/users"),
    ("PATCH", "/api/admin/users/anything"),
    ("POST", "/api/admin/users/anything/reset-password"),
    ("GET", "/api/admin/settings"),
    ("PATCH", "/api/admin/settings"),
    ("GET", "/api/admin/status"),
)


def login(test_client: TestClient, username: str, password: str = TEST_PASSWORD):
    return test_client.post("/api/auth/login", json={"username": username, "password": password})


def set_disabled(test_client: TestClient, user_id: str, disabled: bool):
    return test_client.patch(f"/api/admin/users/{user_id}", json={"disabled": disabled})


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
def test_admin_routes_are_refused_to_non_admins(other_client, method, path):
    response = other_client.request(method, path, json={"disabled": True})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "admin_required"


def test_user_list_reports_activity_and_usage(client, other_client):
    with SessionLocal() as db:
        exercise_id = db.scalar(
            select(Exercise.id).where(Exercise.user_id == other_client.user["id"]).limit(1)
        )
        db.add(
            MachinePhoto(
                user_id=other_client.user["id"],
                exercise_id=exercise_id,
                caption="Seat on 4",
                original_filename="leg-press.jpg",
                full_filename="photo-full.webp",
                thumbnail_filename="photo-thumbnail.webp",
                file_size=1,
                width=10,
                height=10,
            )
        )
        db.commit()
    photo_dir = get_settings().machine_photos_dir
    (photo_dir / "photo-full.webp").write_bytes(b"x" * 300)
    (photo_dir / "photo-thumbnail.webp").write_bytes(b"x" * 20)
    second_device = TestClient(client.app)
    assert login(second_device, "other").status_code == 200

    users = client.get("/api/admin/users").json()

    assert [user["username"] for user in users] == ["owner", "other"]
    owner, other = users
    assert owner["is_admin"] is True and other["is_admin"] is False
    assert other["disabled_at"] is None
    assert other["last_active_at"] is not None
    assert other["signed_in_devices"] == 2
    assert other["photos"] == 1 and other["photo_bytes"] == 320
    assert owner["photos"] == 0 and owner["photo_bytes"] == 0
    assert "password_hash" not in other


def test_disabling_an_account_signs_it_out_and_blocks_sign_in(client, other_client):
    other_id = other_client.user["id"]

    response = set_disabled(client, other_id, True)

    assert response.status_code == 200
    assert response.json()["disabled_at"] is not None
    assert response.json()["signed_in_devices"] == 0
    assert other_client.get("/api/auth/me").status_code == 401
    fresh = TestClient(client.app)
    blocked = login(fresh, "other")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "account_disabled"
    # A wrong password gets the usual answer, so the disabled state is not revealed to guessers.
    assert login(fresh, "other", "wrong password!").json()["error"]["code"] == (
        "invalid_credentials"
    )

    assert set_disabled(client, other_id, False).json()["disabled_at"] is None
    assert login(fresh, "other").status_code == 200
    assert fresh.get("/api/auth/me").status_code == 200


def test_admin_cannot_disable_themselves_or_unknown_accounts(client):
    own = set_disabled(client, client.user["id"], True)
    assert own.status_code == 409
    assert own.json()["error"]["code"] == "cannot_disable_self"
    assert client.get("/api/auth/me").status_code == 200
    assert set_disabled(client, "missing", True).status_code == 404


def test_video_switch_applies_immediately_to_everyone(client, other_client):
    assert client.get("/api/admin/settings").json()["video_uploads"] == "admin"
    assert client.get("/api/sessions").status_code == 200
    assert other_client.get("/api/sessions").status_code == 403

    off = client.patch("/api/admin/settings", json={"video_uploads": "off"})
    assert off.json()["video_uploads"] == "off"
    refused = client.get("/api/sessions")
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "video_uploads_disabled"
    assert client.get("/api/auth/me").json()["can_upload_videos"] is False

    client.patch("/api/admin/settings", json={"video_uploads": "everyone"})
    assert other_client.get("/api/sessions").status_code == 200
    assert other_client.get("/api/auth/me").json()["can_upload_videos"] is True

    client.patch("/api/admin/settings", json={"video_uploads": "admin"})
    restricted = other_client.get("/api/sessions")
    assert restricted.json()["error"]["code"] == "video_uploads_restricted"


def test_switches_override_env_and_survive_a_restart(client):
    client.patch("/api/admin/settings", json={"video_uploads": "off", "allow_registration": False})

    settings = get_settings().model_copy(update={"video_uploads": "everyone"})
    with TestClient(create_app(settings)) as restarted:
        assert login(restarted, "owner").status_code == 200
        assert restarted.get("/api/admin/settings").json() == {
            "video_uploads": "off",
            "allow_registration": False,
            "invite_code_required": True,
        }


def test_registration_switch_closes_and_reopens_sign_up(client, anonymous_client):
    client.patch("/api/admin/settings", json={"allow_registration": False})
    newcomer = TestClient(client.app)
    assert newcomer.get("/api/auth/config").json()["registration_open"] is False
    closed = newcomer.post(
        "/api/auth/register",
        json={
            "username": "late",
            "password": TEST_PASSWORD,
            "display_name": "Late",
            "invite_code": TEST_INVITE_CODE,
        },
    )
    assert closed.status_code == 403
    assert closed.json()["error"]["code"] == "registration_closed"

    client.patch("/api/admin/settings", json={"allow_registration": True})
    assert newcomer.get("/api/auth/config").json()["registration_open"] is True
    register_user(newcomer, "late", "Late")


def test_settings_reject_unknown_video_modes(client):
    response = client.patch("/api/admin/settings", json={"video_uploads": "sometimes"})
    assert response.status_code == 422


def test_status_reports_disk_storage_and_the_video_queue(client):
    session = create_session(client)
    with SessionLocal() as db:
        db.get(WorkoutSession, session["id"]).status = SessionStatus.QUEUED
        db.commit()
    settings = get_settings()
    (settings.machine_photos_dir / "loose.webp").write_bytes(b"x" * 50)
    upload_dir = settings.uploads_dir / session["id"]
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "clip.mp4").write_bytes(b"x" * 70)

    status = client.get("/api/admin/status").json()

    assert status["disk"]["total_bytes"] > 0
    assert 0 <= status["disk"]["free_bytes"] <= status["disk"]["total_bytes"]
    assert status["database_bytes"] > 0
    assert status["photos"] == 0 and status["photo_bytes"] == 50
    assert status["video_file_bytes"] == 70
    assert status["video_queue"]["queued"] == 1
    assert status["video_queue"]["normalizing"] == 0


def load_migration():
    path = Path(__file__).parents[1] / "migrations/versions/0028_admin_console.py"
    spec = importlib.util.spec_from_file_location("admin_console_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_adds_account_status_and_server_settings():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(
            text("CREATE TABLE user_sessions (user_id VARCHAR(36), last_seen_at DATETIME)")
        )
        connection.execute(text("INSERT INTO users VALUES ('active'), ('idle')"))
        connection.execute(
            text(
                "INSERT INTO user_sessions VALUES "
                "('active', '2026-10-01 08:00:00'), ('active', '2026-10-03 09:00:00')"
            )
        )

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        rows = connection.execute(
            text("SELECT id, disabled_at, last_active_at FROM users ORDER BY id")
        ).all()
        assert rows == [("active", None, "2026-10-03 09:00:00"), ("idle", None, None)]
        assert "server_settings" in inspect(connection).get_table_names()

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert columns == {"id"}
        assert "server_settings" not in inspect(connection).get_table_names()


def reset_password(test_client: TestClient, user_id: str):
    return test_client.post(f"/api/admin/users/{user_id}/reset-password")


def test_resetting_a_password_signs_the_person_out_and_gives_a_one_time_password(
    client, other_client
):
    response = reset_password(client, other_client.user["id"])

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    temporary = response.json()["temporary_password"]
    assert len(temporary) >= 10
    assert other_client.get("/api/auth/me").status_code == 401
    fresh = TestClient(client.app)
    assert login(fresh, "other").status_code == 401
    signed_in = login(fresh, "other", temporary)
    assert signed_in.status_code == 200
    assert signed_in.json()["must_change_password"] is True
    listed = {user["username"]: user for user in client.get("/api/admin/users").json()}
    assert listed["other"]["must_change_password"] is True
    assert listed["owner"]["must_change_password"] is False
    assert "temporary_password" not in listed["other"]
    # Every reset produces a different password.
    assert reset_password(client, other_client.user["id"]).json()["temporary_password"] != temporary


def test_a_temporary_password_only_allows_choosing_a_new_one(client, other_client):
    temporary = reset_password(client, other_client.user["id"]).json()["temporary_password"]
    fresh = TestClient(client.app)
    assert login(fresh, "other", temporary).status_code == 200

    # The app cannot be used, but the person can still see their state and sign out.
    blocked = fresh.get("/api/workouts")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "password_change_required"
    assert fresh.get("/api/auth/me").json()["must_change_password"] is True

    reused = fresh.put(
        "/api/profile/password",
        json={"current_password": temporary, "new_password": temporary},
    )
    assert reused.status_code == 400
    assert reused.json()["error"]["code"] == "password_unchanged"
    assert fresh.get("/api/workouts").status_code == 403

    changed = fresh.put(
        "/api/profile/password",
        json={"current_password": temporary, "new_password": "a brand new passphrase"},
    )
    assert changed.status_code == 204
    assert fresh.get("/api/auth/me").json()["must_change_password"] is False
    assert fresh.get("/api/workouts").status_code == 200
    assert login(TestClient(client.app), "other", "a brand new passphrase").status_code == 200
    listed = {user["username"]: user for user in client.get("/api/admin/users").json()}
    assert listed["other"]["must_change_password"] is False


def test_a_flagged_person_can_sign_out(client, other_client):
    temporary = reset_password(client, other_client.user["id"]).json()["temporary_password"]
    fresh = TestClient(client.app)
    assert login(fresh, "other", temporary).status_code == 200

    assert fresh.post("/api/auth/logout").status_code == 204

    assert fresh.get("/api/auth/me").status_code == 401


def test_resetting_clears_a_sign_in_lockout(client, other_client):
    throttle = client.app.state.login_throttle
    for _ in range(ACCOUNT_LOGIN_MAX_FAILURES):
        throttle.record_failure("username:other")
    locked = login(TestClient(client.app), "other")
    assert locked.json()["error"]["code"] == "too_many_attempts"

    temporary = reset_password(client, other_client.user["id"]).json()["temporary_password"]

    assert login(TestClient(client.app), "other", temporary).status_code == 200


def test_reset_password_is_for_other_existing_accounts_only(client, other_client):
    own = reset_password(client, client.user["id"])
    assert own.status_code == 409
    assert own.json()["error"]["code"] == "cannot_reset_self"
    assert login(TestClient(client.app), "owner").status_code == 200
    assert reset_password(client, "missing").status_code == 404
    refused = reset_password(other_client, client.user["id"])
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "admin_required"
    assert login(TestClient(client.app), "owner").status_code == 200
