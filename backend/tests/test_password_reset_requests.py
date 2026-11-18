from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_PASSWORD
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from app import password_reset_requests
from app.database import SessionLocal
from app.models import User, utc_now
from app.password_reset_requests import MAX_REQUESTS_PER_ADDRESS, REQUEST_LIFETIME

REQUESTS = "/api/admin/password-reset-requests"


@pytest.fixture(autouse=True)
def alerts(monkeypatch):
    """Phone alerts the requests would send, without contacting a push service."""
    sent: list[dict] = []

    def record(session_factory, settings, **alert):
        sent.append(alert)
        return True

    monkeypatch.setattr(password_reset_requests, "send_push_notification", record)
    return sent


def ask(test_client: TestClient, username: str):
    return test_client.post("/api/auth/password-reset-request", json={"username": username})


def login(test_client: TestClient, username: str, password: str = TEST_PASSWORD):
    return test_client.post("/api/auth/login", json={"username": username, "password": password})


def listed(admin: TestClient) -> list[dict]:
    response = admin.get(REQUESTS)
    assert response.status_code == 200, response.text
    return response.json()


def account(admin: TestClient, username: str) -> dict:
    return {user["username"]: user for user in admin.get("/api/admin/users").json()}[username]


def requested_at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_a_signed_out_person_can_ask_the_admins_for_a_reset(client, other_client):
    response = ask(TestClient(client.app), "  Other ")

    assert response.status_code == 204
    assert response.headers["cache-control"] == "no-store"
    requests = listed(client)
    assert [(item["user_id"], item["username"], item["display_name"]) for item in requests] == [
        (other_client.user["id"], "other", "Other")
    ]
    assert account(client, "other")["password_reset_requested_at"] == requests[0]["requested_at"]
    assert account(client, "owner")["password_reset_requested_at"] is None
    # Asking changes nothing about the account until an admin acts on it.
    assert other_client.get("/api/auth/me").status_code == 200
    assert account(client, "other")["must_change_password"] is False


def test_the_reply_does_not_reveal_whether_an_account_exists(client, other_client):
    signed_out = TestClient(client.app)

    known = ask(signed_out, "other")
    unknown = ask(signed_out, "nobody-here")

    assert (known.status_code, known.content) == (unknown.status_code, unknown.content)
    assert [item["username"] for item in listed(client)] == ["other"]


def test_disabled_accounts_are_not_listed(client, other_client):
    signed_out = TestClient(client.app)
    ask(signed_out, "other")
    client.patch(f"/api/admin/users/{other_client.user['id']}", json={"disabled": True})

    assert listed(client) == []
    assert account(client, "other")["password_reset_requested_at"] is None
    assert ask(signed_out, "other").status_code == 204
    assert listed(client) == []


def test_asking_again_keeps_the_first_time_until_the_request_expires(client, other_client):
    signed_out = TestClient(client.app)
    ask(signed_out, "other")
    first = listed(client)[0]["requested_at"]

    ask(signed_out, "other")
    assert listed(client)[0]["requested_at"] == first

    with SessionLocal() as db:
        db.get(User, other_client.user["id"]).password_reset_requested_at = (
            utc_now() - REQUEST_LIFETIME - timedelta(minutes=1)
        )
        db.commit()
    assert listed(client) == []
    assert account(client, "other")["password_reset_requested_at"] is None

    ask(signed_out, "other")
    assert requested_at(listed(client)[0]["requested_at"]) > requested_at(first)


def test_one_address_can_only_send_a_few_requests(client, other_client):
    signed_out = TestClient(client.app)
    for _ in range(MAX_REQUESTS_PER_ADDRESS):
        assert ask(signed_out, "nobody-here").status_code == 204

    blocked = ask(signed_out, "other")

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "too_many_attempts"
    assert listed(client) == []
    # Signing in keeps its own allowance.
    assert login(signed_out, "other").status_code == 200


def test_resetting_the_password_answers_the_request(client, other_client):
    ask(TestClient(client.app), "other")

    reset = client.post(f"/api/admin/users/{other_client.user['id']}/reset-password")

    assert reset.status_code == 200
    assert listed(client) == []
    row = account(client, "other")
    assert row["password_reset_requested_at"] is None
    assert row["must_change_password"] is True


def test_an_admin_can_dismiss_a_request_without_changing_the_password(client, other_client):
    ask(TestClient(client.app), "other")

    dismissed = client.delete(f"{REQUESTS}/{other_client.user['id']}")

    assert dismissed.status_code == 204
    assert listed(client) == []
    assert account(client, "other")["must_change_password"] is False
    assert other_client.get("/api/auth/me").status_code == 200
    assert client.delete(f"{REQUESTS}/missing").status_code == 404


def test_signing_in_withdraws_the_request_but_a_wrong_password_does_not(client, other_client):
    signed_out = TestClient(client.app)
    ask(signed_out, "other")

    assert login(signed_out, "other", "not the password").status_code == 401
    assert len(listed(client)) == 1

    assert login(signed_out, "other").status_code == 200
    assert listed(client) == []


def test_changing_the_password_withdraws_the_request(client, other_client):
    ask(TestClient(client.app), "other")

    changed = other_client.put(
        "/api/profile/password",
        json={"current_password": TEST_PASSWORD, "new_password": "another long passphrase"},
    )

    assert changed.status_code == 204
    assert listed(client) == []


@pytest.mark.parametrize(("method", "path"), [("GET", REQUESTS), ("DELETE", f"{REQUESTS}/any")])
def test_only_admins_can_see_or_dismiss_requests(other_client, method, path):
    refused = other_client.request(method, path)
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "admin_required"
    assert TestClient(other_client.app).request(method, path).status_code == 401


def add_account(username: str, *, is_admin: bool, disabled: bool = False) -> str:
    with SessionLocal() as db:
        user = User(
            username=username,
            display_name=username.title(),
            password_hash="not-a-real-hash",
            is_admin=is_admin,
            disabled_at=utc_now() if disabled else None,
        )
        db.add(user)
        db.commit()
        return user.id


def test_a_new_request_alerts_each_active_admins_phones(client, other_client, alerts):
    second_admin = add_account("second-admin", is_admin=True)
    add_account("retired-admin", is_admin=True, disabled=True)

    assert ask(TestClient(client.app), "other").status_code == 204

    assert sorted(alert["user_id"] for alert in alerts) == sorted([client.user["id"], second_admin])
    alert = alerts[0]
    assert alert["title"] == "Password reset request"
    assert alert["body"] == "Other (@other) asked for a temporary password."
    assert alert["url"] == f"/?admin-account={other_client.user['id']}#admin"
    assert alert["tag"] == f"password-reset-{other_client.user['id']}"


def test_only_a_new_request_sends_alerts(client, other_client, alerts):
    signed_out = TestClient(client.app)
    ask(signed_out, "nobody-here")
    assert alerts == []

    ask(signed_out, "other")
    ask(signed_out, "other")
    assert len(alerts) == 1


def test_an_admin_asking_is_not_alerted_about_themselves(client, alerts):
    second_admin = add_account("second-admin", is_admin=True)

    ask(TestClient(client.app), "owner")

    assert [alert["user_id"] for alert in alerts] == [second_admin]


def test_one_failed_alert_does_not_stop_the_others(client, other_client, monkeypatch):
    second_admin = add_account("second-admin", is_admin=True)
    delivered = []

    def flaky(session_factory, settings, *, user_id, **alert):
        if user_id == client.user["id"]:
            raise RuntimeError("push service down")
        delivered.append(user_id)
        return True

    monkeypatch.setattr(password_reset_requests, "send_push_notification", flaky)

    assert ask(TestClient(client.app), "other").status_code == 204
    assert delivered == [second_admin]
    assert len(listed(client)) == 1


def load_migration():
    path = Path(__file__).parents[1] / "migrations/versions/0061_password_reset_requests.py"
    spec = importlib.util.spec_from_file_location("password_reset_requests_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_adds_and_removes_the_request_time():
    migration = load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('existing')"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        rows = connection.execute(text("SELECT id, password_reset_requested_at FROM users")).all()
        assert rows == [("existing", None)]

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert columns == {"id"}
