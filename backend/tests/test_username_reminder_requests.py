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

REQUESTS = "/api/admin/username-reminder-requests"


@pytest.fixture(autouse=True)
def alerts(monkeypatch):
    """Phone alerts the requests would send, without contacting a push service."""
    sent: list[dict] = []

    def record(session_factory, settings, **alert):
        sent.append(alert)
        return True

    monkeypatch.setattr(password_reset_requests, "send_push_notification", record)
    return sent


def ask(test_client: TestClient, name: str):
    return test_client.post("/api/auth/username-reminder-request", json={"name": name})


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


def add_account(
    username: str, display_name: str, *, is_admin: bool = False, disabled: bool = False
) -> str:
    with SessionLocal() as db:
        user = User(
            username=username,
            display_name=display_name,
            password_hash="not-a-real-hash",
            is_admin=is_admin,
            disabled_at=utc_now() if disabled else None,
        )
        db.add(user)
        db.commit()
        return user.id


def test_a_signed_out_person_can_ask_for_their_username_by_name(client, other_client):
    response = ask(TestClient(client.app), "  oTHER ")

    assert response.status_code == 204
    assert response.headers["cache-control"] == "no-store"
    assert response.content == b""
    requests = listed(client)
    assert [(item["user_id"], item["username"], item["display_name"]) for item in requests] == [
        (other_client.user["id"], "other", "Other")
    ]
    row = account(client, "other")
    assert row["username_reminder_requested_at"] == requests[0]["requested_at"]
    # A username request is not a password reset request, and changes nothing about the account.
    assert row["password_reset_requested_at"] is None
    assert row["must_change_password"] is False
    assert account(client, "owner")["username_reminder_requested_at"] is None
    assert other_client.get("/api/auth/me").status_code == 200


def test_names_match_whatever_their_case_and_spacing(client):
    sam = add_account("sam.sample", "Sam  Sample")
    add_account("samuel", "Samuel Sample")

    ask(TestClient(client.app), "sam sample")

    assert [item["user_id"] for item in listed(client)] == [sam]


def test_every_active_account_with_the_name_is_flagged(client):
    first = add_account("sam.one", "Sam Sample")
    second = add_account("sam.two", "Sam Sample")
    add_account("sam.gone", "Sam Sample", disabled=True)

    ask(TestClient(client.app), "Sam Sample")

    assert sorted(item["user_id"] for item in listed(client)) == sorted([first, second])


def test_the_reply_does_not_reveal_whether_an_account_has_the_name(client, other_client):
    signed_out = TestClient(client.app)

    known = ask(signed_out, "Other")
    unknown = ask(signed_out, "Nobody Here")

    assert (known.status_code, known.content) == (unknown.status_code, unknown.content)
    assert [item["username"] for item in listed(client)] == ["other"]


@pytest.mark.parametrize("name", ["", "x" * 81])
def test_the_name_must_fit_a_display_name(client, name):
    assert ask(TestClient(client.app), name).status_code == 422


def test_a_blank_name_matches_nobody(client, other_client):
    assert ask(TestClient(client.app), "   ").status_code == 204
    assert listed(client) == []


def test_disabled_accounts_are_not_listed(client, other_client):
    signed_out = TestClient(client.app)
    ask(signed_out, "Other")
    client.patch(f"/api/admin/users/{other_client.user['id']}", json={"disabled": True})

    assert listed(client) == []
    assert account(client, "other")["username_reminder_requested_at"] is None


def test_asking_again_keeps_the_first_time_until_the_request_expires(client, other_client):
    signed_out = TestClient(client.app)
    ask(signed_out, "Other")
    first = listed(client)[0]["requested_at"]

    ask(signed_out, "Other")
    assert listed(client)[0]["requested_at"] == first

    with SessionLocal() as db:
        db.get(User, other_client.user["id"]).username_reminder_requested_at = (
            utc_now() - REQUEST_LIFETIME - timedelta(minutes=1)
        )
        db.commit()
    assert listed(client) == []
    assert account(client, "other")["username_reminder_requested_at"] is None

    ask(signed_out, "Other")
    assert requested_at(listed(client)[0]["requested_at"]) > requested_at(first)


def test_one_address_can_only_send_a_few_requests(client, other_client):
    signed_out = TestClient(client.app)
    for _ in range(MAX_REQUESTS_PER_ADDRESS):
        assert ask(signed_out, "Nobody Here").status_code == 204

    blocked = ask(signed_out, "Other")

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "too_many_attempts"
    assert listed(client) == []
    # Signing in and password reset requests keep their own allowances.
    assert login(signed_out, "other").status_code == 200
    reset = signed_out.post("/api/auth/password-reset-request", json={"username": "other"})
    assert reset.status_code == 204


def test_an_admin_can_dismiss_a_request(client, other_client):
    ask(TestClient(client.app), "Other")

    dismissed = client.delete(f"{REQUESTS}/{other_client.user['id']}")

    assert dismissed.status_code == 204
    assert listed(client) == []
    assert account(client, "other")["username_reminder_requested_at"] is None
    assert other_client.get("/api/auth/me").status_code == 200
    assert client.delete(f"{REQUESTS}/missing").status_code == 404


def test_signing_in_withdraws_the_request_but_a_wrong_password_does_not(client, other_client):
    signed_out = TestClient(client.app)
    ask(signed_out, "Other")

    assert login(signed_out, "other", "not the password").status_code == 401
    assert len(listed(client)) == 1

    assert login(signed_out, "other").status_code == 200
    assert listed(client) == []


def test_password_and_username_requests_are_kept_apart(client, other_client):
    signed_out = TestClient(client.app)
    signed_out.post("/api/auth/password-reset-request", json={"username": "other"})
    ask(signed_out, "Other")

    client.delete(f"/api/admin/password-reset-requests/{other_client.user['id']}")

    row = account(client, "other")
    assert row["password_reset_requested_at"] is None
    assert row["username_reminder_requested_at"] is not None


@pytest.mark.parametrize(("method", "path"), [("GET", REQUESTS), ("DELETE", f"{REQUESTS}/any")])
def test_only_admins_can_see_or_dismiss_requests(other_client, method, path):
    refused = other_client.request(method, path)
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "admin_required"
    assert TestClient(other_client.app).request(method, path).status_code == 401


def test_a_new_request_alerts_each_active_admins_phones(client, other_client, alerts):
    second_admin = add_account("second-admin", "Second Admin", is_admin=True)
    add_account("retired-admin", "Retired Admin", is_admin=True, disabled=True)

    assert ask(TestClient(client.app), "Other").status_code == 204

    assert sorted(alert["user_id"] for alert in alerts) == sorted([client.user["id"], second_admin])
    alert = alerts[0]
    assert alert["title"] == "Username request"
    assert alert["body"] == "Other asked for their username: @other."
    assert alert["url"] == f"/?admin-account={other_client.user['id']}#admin"
    assert alert["tag"] == f"username-reminder-{other_client.user['id']}"


def test_only_a_new_request_sends_alerts(client, other_client, alerts):
    signed_out = TestClient(client.app)
    ask(signed_out, "Nobody Here")
    assert alerts == []

    ask(signed_out, "Other")
    ask(signed_out, "Other")
    assert len(alerts) == 1


def test_an_admin_asking_is_not_alerted_about_themselves(client, alerts):
    second_admin = add_account("second-admin", "Second Admin", is_admin=True)

    ask(TestClient(client.app), "Owner")

    assert [alert["user_id"] for alert in alerts] == [second_admin]


def load_migration():
    path = Path(__file__).parents[1] / "migrations/versions/0064_username_reminder_requests.py"
    spec = importlib.util.spec_from_file_location("username_reminder_requests_migration", path)
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

        rows = connection.execute(
            text("SELECT id, username_reminder_requested_at FROM users")
        ).all()
        assert rows == [("existing", None)]

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert columns == {"id"}
