from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Test imports below create the application's database engine. Point them at an
# isolated temporary location before importing any application module so tests
# can never reset a user's live data/gym-video-logger.db database.
# Keep the base path short: nested account-backup paths can otherwise exceed
# Windows' SQLite path limit when tests run in a deeply nested worktree.
TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="gym-tests-")).resolve()
# A developer's deployment configuration must never select test credentials or cookies.
# This only changes the test process; the running app and its environment are untouched.
for name in tuple(os.environ):
    if name.startswith("GYM_"):
        del os.environ[name]
os.environ["GYM_DATA_DIR"] = str(TEST_DATA_DIR)
os.environ["GYM_DATABASE_PATH"] = str(TEST_DATA_DIR / "gym-video-logger-test.db")
os.environ["GYM_SEED_SAMPLE_DATA"] = "false"
os.environ["GYM_YOUTUBE_MOCK_MODE"] = "true"
for name, filename in (
    ("YOUTUBE_CLIENT_SECRET_PATH", "youtube-client.json"),
    ("YOUTUBE_TOKEN_PATH", "youtube-token.json"),
    ("YOUTUBE_WEB_CLIENT_SECRET_PATH", "youtube-web-client.json"),
    ("YOUTUBE_CREDENTIALS_KEY_PATH", "youtube-credentials.key"),
    ("WEB_PUSH_VAPID_PRIVATE_KEY_PATH", "web-push-vapid-private.pem"),
):
    os.environ[f"GYM_{name}"] = str(TEST_DATA_DIR / filename)
# Mirrors a deployed server: browser sign-up (including the first account) needs the invite code.
TEST_INVITE_CODE = "test-invite-code"
os.environ["GYM_REGISTRATION_INVITE_CODE"] = TEST_INVITE_CODE
os.environ["GYM_ALLOW_REGISTRATION"] = "true"

import app  # noqa: E402

# A virtual environment shared between Git worktrees can have an editable install that
# points at another checkout. Stop before any test silently runs against that code.
# A copy of this file run outside a checkout has no sibling `app` package to compare with.
CHECKOUT_BACKEND = Path(__file__).resolve().parents[1]
if (CHECKOUT_BACKEND / "app").is_dir() and Path(app.__file__).resolve().parents[1] != (
    CHECKOUT_BACKEND
):
    pytest.exit(
        f"Tests would import `app` from {Path(app.__file__).resolve().parent}, not from this "
        f"checkout ({CHECKOUT_BACKEND / 'app'}). Run pytest from the repository root so "
        "pyproject.toml's `pythonpath` applies, or put this checkout's backend first on "
        "PYTHONPATH.",
        returncode=4,
    )

from app.config import Settings, get_settings  # noqa: E402

# Explicit Settings(_env_file=...) tests can still exercise dotenv parsing. Ordinary
# settings, including those constructed by tests, must ignore the checkout's .env.
Settings.model_config["env_file"] = None
get_settings.cache_clear()

from app.accounts import seed_new_account, user_to_read  # noqa: E402
from app.auth import create_user_session, hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import ProfileSharing, User  # noqa: E402
from app.storage import StoredUpload, original_filename  # noqa: E402
from app.tracker import bump_workout_cache_revision  # noqa: E402


def pytest_configure(config):
    if config.option.basetemp is None:
        # A unique, owned directory avoids stale/foreign pytest temp permissions.
        # Preserve an explicit --basetemp chosen by the caller.
        config.option.basetemp = str(TEST_DATA_DIR / "tmp")


@pytest.fixture(scope="session")
def database_schema():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
    engine.dispose()


def clear_database():
    # Keep real commits and independent connections for request/thread/scheduler tests.
    # Delete children before parents with foreign-key enforcement still enabled.
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture(autouse=True)
def reset_database(database_schema):
    settings = get_settings()
    # Disk totals and processors must not see uploads left behind by another test.
    for folder in (
        settings.machine_photos_dir,
        settings.profile_photos_dir,
        settings.uploads_dir,
        settings.normalized_dir,
        settings.output_dir,
        settings.account_backups_dir,
    ):
        assert folder.resolve().is_relative_to(TEST_DATA_DIR.resolve())
        shutil.rmtree(folder, ignore_errors=True)
        folder.mkdir(parents=True, exist_ok=True)
    clear_database()
    yield
    clear_database()
    shutil.rmtree(settings.machine_photos_dir, ignore_errors=True)
    shutil.rmtree(settings.profile_photos_dir, ignore_errors=True)
    shutil.rmtree(get_settings().account_backups_dir, ignore_errors=True)


TEST_PASSWORD = "correct horse battery staple"


@pytest.fixture(scope="session")
def fixture_password_hash():
    # A real, production-strength hash reused only by pre-created fixture accounts.
    # Registration, login and password tests continue to call the real auth code.
    return hash_password(TEST_PASSWORD)


def fixture_account(test_client: TestClient, password_hash: str, *, other: bool = False) -> dict:
    settings = test_client.app.state.settings
    with SessionLocal() as db:
        user = User(
            username="other" if other else "owner",
            display_name="Other" if other else "Owner",
            password_hash=password_hash,
            is_admin=not other,
        )
        db.add(user)
        db.flush()
        db.add(ProfileSharing(user_id=user.id, visibility="public"))
        bump_workout_cache_revision(db, user.id)
        db.commit()
        seed_new_account(db, settings, user)
        token = create_user_session(db, user, settings, "testclient")
        account = user_to_read(db, user, settings).model_dump(mode="json")
    test_client.cookies.set(settings.session_cookie, token)
    return account


def register_user(
    test_client: TestClient,
    username: str = "owner",
    display_name: str = "Owner",
    password: str = TEST_PASSWORD,
) -> dict:
    """Register, then explicitly sign in so authenticated fixtures have a real session."""
    response = test_client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": password,
            "display_name": display_name,
            "invite_code": TEST_INVITE_CODE,
        },
    )
    assert response.status_code == 201, response.text
    signed_in = test_client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert signed_in.status_code == 200, signed_in.text
    return response.json()


@pytest.fixture
def anonymous_client():
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def client(anonymous_client, request):
    """A signed-in client for the first (admin) account."""
    if request.node.get_closest_marker("auth_flow"):
        anonymous_client.user = register_user(anonymous_client)
    else:
        anonymous_client.user = fixture_account(
            anonymous_client, request.getfixturevalue("fixture_password_hash")
        )
    return anonymous_client


@pytest.fixture
def other_client(client, request):
    """A second, independent browser signed in as a different non-admin account."""
    second = TestClient(client.app)
    if request.node.get_closest_marker("auth_flow"):
        second.user = register_user(second, "other", "Other")
    else:
        second.user = fixture_account(
            second, request.getfixturevalue("fixture_password_hash"), other=True
        )
    yield second
    second.close()


def make_user(username: str = "direct", *, is_admin: bool = False) -> str:
    """Insert an account row directly, for tests that exercise internals without HTTP."""
    with SessionLocal() as db:
        user = User(
            username=username,
            display_name="Direct",
            password_hash="not-a-real-hash",
            is_admin=is_admin,
        )
        db.add(user)
        db.commit()
        return user.id


@pytest.fixture
def fake_upload(monkeypatch):
    async def store(*, upload, session_id, existing_session_bytes, settings):
        filename = original_filename(upload.filename)
        extension = Path(filename).suffix.lower()
        path = settings.uploads_dir / session_id / f"server-{uuid.uuid4().hex}{extension}"
        path.parent.mkdir(parents=True, exist_ok=True)
        contents = await upload.read()
        path.write_bytes(contents)
        await upload.close()
        return StoredUpload(filename, path.name, path, len(contents), 1_000)

    monkeypatch.setattr("app.main.stream_upload_to_disk", store)
    return store


def create_session(client: TestClient, expected: int = 1) -> dict:
    response = client.post(
        "/api/sessions",
        json={
            "name": "Lower body",
            "workout_date": "2026-07-12",
            "notes": "Test notes",
            "expected_clip_count": expected,
        },
    )
    assert response.status_code == 201
    return response.json()


def upload(client: TestClient, session_id: str, client_id: str, order: int, name: str = "set.mov"):
    return client.post(
        f"/api/sessions/{session_id}/clips",
        data={
            "client_clip_id": client_id,
            "order_index": str(order),
            "exercise_label": "Back squat",
        },
        files={"file": (name, b"small but test-only video", "video/quicktime")},
    )
