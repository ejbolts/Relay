from __future__ import annotations

import pytest
from conftest import TEST_PASSWORD, register_user
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import manage
from app.auth import verify_password
from app.database import SessionLocal
from app.main import create_app
from app.models import Exercise, User, UserSession

pytestmark = pytest.mark.auth_flow


def feed_passwords(monkeypatch, *answers: str) -> None:
    replies = iter(answers)
    monkeypatch.setattr(manage.getpass, "getpass", lambda _prompt="": next(replies))


def test_create_user_prompts_for_a_password_and_first_account_is_admin(monkeypatch, capsys):
    feed_passwords(monkeypatch, TEST_PASSWORD, TEST_PASSWORD)

    manage.main(["create-user", "--username", "Owner", "--display-name", "Owner"])

    assert "Created admin account owner" in capsys.readouterr().out
    with SessionLocal() as db:
        user = db.scalar(select(User))
        assert user.is_admin and verify_password(TEST_PASSWORD, user.password_hash)
        assert db.scalar(select(func.count(Exercise.id)).where(Exercise.user_id == user.id)) > 0


def test_create_user_admin_flag_and_duplicate_and_bad_input(monkeypatch, capsys):
    feed_passwords(monkeypatch, TEST_PASSWORD, TEST_PASSWORD)
    manage.main(["create-user", "--username", "first", "--display-name", "First"])
    feed_passwords(monkeypatch, TEST_PASSWORD, TEST_PASSWORD)
    manage.main(["create-user", "--username", "boss", "--display-name", "B", "--admin"])
    feed_passwords(monkeypatch, TEST_PASSWORD, TEST_PASSWORD)
    manage.main(["create-user", "--username", "plain", "--display-name", "P"])
    with SessionLocal() as db:
        roles = {user.username: user.is_admin for user in db.scalars(select(User))}
    assert roles == {
        "first": True,
        "boss": True,
        "plain": False,
    }

    feed_passwords(monkeypatch, TEST_PASSWORD, TEST_PASSWORD)
    with pytest.raises(SystemExit, match="already exists"):
        manage.main(["create-user", "--username", "plain", "--display-name", "P"])
    feed_passwords(monkeypatch, "short", "short")
    with pytest.raises(SystemExit, match="Password must be"):
        manage.main(["create-user", "--username", "xxx", "--display-name", "X"])
    feed_passwords(monkeypatch, TEST_PASSWORD, "different password")
    with pytest.raises(SystemExit, match="did not match"):
        manage.main(["create-user", "--username", "xxx", "--display-name", "X"])
    with pytest.raises(SystemExit, match="Use 3-32"):
        manage.main(["create-user", "--username", "bad name", "--display-name", "X"])
    capsys.readouterr()


def test_reset_password_signs_everyone_out_and_list_users(client, monkeypatch, capsys):
    feed_passwords(monkeypatch, "a brand new password", "a brand new password")

    manage.main(["reset-password", "--username", "OWNER"])

    assert "Password updated" in capsys.readouterr().out
    assert client.get("/api/auth/me").status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count(UserSession.id))) == 0
    fresh = TestClient(client.app)
    login = fresh.post(
        "/api/auth/login", json={"username": "owner", "password": "a brand new password"}
    )
    assert login.status_code == 200
    with pytest.raises(SystemExit, match="No account"):
        manage.main(["reset-password", "--username", "ghost"])

    register_user(TestClient(create_app()), "second", "Second")
    manage.main(["list-users"])
    lines = capsys.readouterr().out.strip().splitlines()
    assert [line.split("\t")[:4] for line in lines] == [
        ["owner", "Owner", "admin", "active"],
        ["second", "Second", "user", "active"],
    ]


def test_refuses_to_run_without_env_file_or_database_path(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("GYM_DATABASE_PATH")
    with pytest.raises(SystemExit, match=r"No \.env file"):
        manage.main(["list-users"])
    (tmp_path / ".env").write_text("GYM_SEED_SAMPLE_DATA=false\n")
    manage.main(["list-users"])  # The configured test database is used once .env is found.


def test_list_users_when_empty(capsys):
    manage.main(["list-users"])
    assert "No accounts yet" in capsys.readouterr().out
