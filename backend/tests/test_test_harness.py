"""Exercise fixture isolation in a fresh pytest process with hostile deployment settings."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_fixture_run_is_isolated_and_auth_flow_still_registers(tmp_path):
    probe = tmp_path / "probe"
    probe.mkdir()
    deployment = tmp_path / "deployment"
    deployment.mkdir()
    sentinel = deployment / "untouched.db"
    sentinel.write_bytes(b"synthetic deployment sentinel; never open as SQLite")
    (probe / "conftest.py").write_text(
        Path(__file__).with_name("conftest.py").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (probe / "pytest.ini").write_text(
        "[pytest]\nmarkers = auth_flow: real registration/login fixtures\n", encoding="utf-8"
    )
    (probe / ".env").write_text(
        "GYM_COOKIE_SECURE=true\nGYM_SESSION_COOKIE=deployment_cookie\n"
        "GYM_VIDEO_UPLOADS=off\nGYM_YOUTUBE_MOCK_MODE=false\n",
        encoding="utf-8",
    )
    (probe / "test_probe.py").write_text(
        """import conftest
import pytest
from sqlalchemy import func, select
from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models import AppSetting, User

def test_create_fixture_data(client, other_client):
    settings = get_settings()
    assert not settings.cookie_secure
    assert settings.session_cookie == "gym_session"
    assert settings.video_uploads == "admin"
    assert settings.youtube_mock_mode
    assert Settings().session_cookie == "gym_session"
    for path in (
        settings.database_path, settings.youtube_client_secret_path,
        settings.youtube_token_path, settings.youtube_web_client_secret_path,
        settings.youtube_credentials_key_path, settings.web_push_vapid_private_key_path,
    ):
        assert path.is_relative_to(conftest.TEST_DATA_DIR)
    assert client.get("/api/auth/me").json()["id"] == client.user["id"]
    assert other_client.get("/api/auth/me").json()["id"] == other_client.user["id"]
    assert client.user["id"] != other_client.user["id"]
    with SessionLocal() as db:
        db.add(AppSetting(key="fixture-canary", value="must disappear"))
        db.commit()
    (settings.uploads_dir / "fixture-canary").write_text("must disappear")

def test_next_case_starts_empty(anonymous_client):
    assert anonymous_client.get("/api/auth/me").status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count(User.id))) == 0
        assert db.scalar(select(func.count(AppSetting.key))) == 0
    assert not (get_settings().uploads_dir / "fixture-canary").exists()

@pytest.mark.auth_flow
def test_auth_fixture_uses_real_registration_and_login(request, monkeypatch):
    registrations = []
    real_register = conftest.register_user
    def register(*args, **kwargs):
        registrations.append(True)
        return real_register(*args, **kwargs)
    monkeypatch.setattr(conftest, "register_user", register)
    client = request.getfixturevalue("client")
    assert registrations == [True]
    assert client.get("/api/auth/me").status_code == 200
""",
        encoding="utf-8",
    )
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-x", "test_probe.py"],
        cwd=probe,
        env={
            **os.environ,
            "GYM_DATABASE_PATH": str(sentinel),
            "GYM_DATA_DIR": str(deployment),
            "GYM_WEB_PUSH_VAPID_PRIVATE_KEY_PATH": str(sentinel),
            "GYM_YOUTUBE_TOKEN_PATH": str(sentinel),
            "GYM_COOKIE_SECURE": "true",
            "GYM_SESSION_COOKIE": "inherited_deployment_cookie",
            # The probe runs outside the checkout, so name this checkout's application.
            "PYTHONPATH": os.pathsep.join(
                filter(None, [str(Path(__file__).parents[1]), os.environ.get("PYTHONPATH")])
            ),
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
            "PYTEST_ADDOPTS": "",
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert sentinel.read_bytes() == b"synthetic deployment sentinel; never open as SQLite"
    assert list(deployment.iterdir()) == [sentinel]
