from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials

from app.auth import hash_token
from app.config import get_settings
from app.database import SessionLocal
from app.models import SessionStatus, WorkoutSession, YouTubeConnection, YouTubeOAuthState
from app.youtube import make_uploader
from app.youtube_connections import (
    YOUTUBE_SCOPES,
    ConnectedYouTubeUploader,
    OAuthAccessLogFilter,
    YouTubeConnectionError,
    decrypt_credentials,
    encrypt_credentials,
    token_cipher,
)


@pytest.fixture
def real_youtube(client, monkeypatch, tmp_path):
    settings = get_settings()
    secret = tmp_path / "web.json"
    secret.write_text(
        json.dumps(
            {
                "web": {
                    "client_id": "sample-client.apps.googleusercontent.com",
                    "client_secret": "sample-client-secret",
                }
            }
        )
    )
    for key, value in {
        "youtube_mock_mode": False,
        "youtube_web_client_secret_path": secret,
        "youtube_credentials_key_path": tmp_path / "credentials.key",
        "youtube_redirect_uri": "http://127.0.0.1:8001/api/youtube/callback",
    }.items():
        monkeypatch.setattr(settings, key, value)
    token_cipher(settings, create=True)
    return settings


def credentials(token="sample-access-token", refresh="sample-refresh-token", *, expired=False):
    return Credentials(
        token=token,
        refresh_token=refresh,
        token_uri="https://oauth2.googleapis.com/token",
        client_id="sample-client.apps.googleusercontent.com",
        client_secret="sample-client-secret",
        scopes=YOUTUBE_SCOPES,
        expiry=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=-1 if expired else 1),
    )


def save_connection(settings, user_id, channel="sample-channel", *, creds=None):
    with SessionLocal() as db:
        db.add(
            YouTubeConnection(
                user_id=user_id,
                channel_id=channel,
                channel_title="Sample training",
                encrypted_credentials=encrypt_credentials(
                    settings, user_id, creds or credentials()
                ),
            )
        )
        db.commit()


def begin(client):
    response = client.post("/api/youtube/connect")
    assert response.status_code == 200, response.text
    return parse_qs(urlsplit(response.json()["url"]).query)


def fake_provider(monkeypatch, *, channel="sample-channel", creds=None):
    exchange = Mock()
    monkeypatch.setattr(
        "app.youtube_connections.oauth_flow",
        lambda *_, **__: SimpleNamespace(fetch_token=exchange, credentials=creds or credentials()),
    )
    monkeypatch.setattr(
        "app.youtube_connections.authorized_channel", lambda _: (channel, "Sample training")
    )
    return exchange


def finish(client, state, **query):
    return client.get(
        "/api/youtube/callback",
        params={"state": state, "code": "sample-code", **query},
        follow_redirects=False,
    )


def test_connection_requires_sign_in_and_reports_safe_unconfigured_state(client, real_youtube):
    # The fixture's admin has a real cookie; a fresh browser does not.
    from fastapi.testclient import TestClient

    anonymous = TestClient(client.app)
    assert anonymous.get("/api/youtube/connection").status_code == 401
    assert anonymous.post("/api/youtube/connect").status_code == 401
    anonymous.close()
    real_youtube.youtube_web_client_secret_path.unlink()
    response = client.get("/api/youtube/connection")
    assert response.json()["status"] == "unavailable"
    assert "sample-client-secret" not in response.text
    assert str(real_youtube.youtube_web_client_secret_path) not in response.text


def test_authorization_uses_pkce_offline_access_and_fixed_callback(client, real_youtube):
    query = begin(client)
    assert query["redirect_uri"] == [real_youtube.youtube_redirect_uri]
    assert query["access_type"] == ["offline"]
    assert set(query["scope"][0].split()) == set(YOUTUBE_SCOPES)
    assert query["code_challenge_method"] == ["S256"]
    assert len(query["code_challenge"][0]) > 30
    with SessionLocal() as db:
        row = db.get(YouTubeOAuthState, hash_token(query["state"][0]))
        assert row and row.user_id == client.user["id"]
        assert query["state"][0] not in row.state_hash
        assert len(token_cipher(real_youtube).decrypt(row.encrypted_verifier.encode())) >= 43


def test_csrf_video_switch_and_callback_origin_configuration(
    client, other_client, real_youtube, monkeypatch
):
    assert other_client.post("/api/youtube/connect").status_code == 403
    assert (
        client.post("/api/youtube/connect", headers={"Origin": "https://other.example"}).status_code
        == 403
    )
    monkeypatch.setattr(
        real_youtube, "youtube_redirect_uri", "http://gym.example.com/api/youtube/callback"
    )
    assert client.post("/api/youtube/connect").status_code == 503


def test_callback_is_bound_to_sign_in_and_consumed_once(
    client, other_client, real_youtube, monkeypatch
):
    client.patch("/api/admin/settings", json={"video_uploads": "everyone"})
    state = begin(client)["state"][0]
    exchange = fake_provider(monkeypatch)
    assert "expired" in finish(other_client, state).headers["location"]
    exchange.assert_not_called()
    response = finish(client, state)
    assert response.headers["location"] == "/?youtube=connected#videos"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "expired" in finish(client, state).headers["location"]
    exchange.assert_called_once_with(code="sample-code", timeout=20)
    with SessionLocal() as db:
        row = db.get(YouTubeConnection, client.user["id"])
        assert row.channel_id == "sample-channel"
        assert "sample-access-token" not in row.encrypted_credentials
        assert "sample-refresh-token" not in row.encrypted_credentials
        assert decrypt_credentials(real_youtube, row).refresh_token == "sample-refresh-token"
        assert db.get(YouTubeConnection, other_client.user["id"]) is None
    result = client.get("/api/youtube/connection")
    assert result.json()["status"] == "connected"
    assert "sample-refresh-token" not in result.text


def test_state_does_not_work_in_another_sign_in_of_same_account(client, real_youtube, monkeypatch):
    from conftest import TEST_PASSWORD

    state = begin(client)["state"][0]
    client.post("/api/auth/login", json={"username": "owner", "password": TEST_PASSWORD})
    exchange = fake_provider(monkeypatch)
    assert "expired" in finish(client, state).headers["location"]
    exchange.assert_not_called()


@pytest.mark.parametrize("outcome", ["expired", "cancelled", "permission", "failed", "no_channel"])
def test_failed_consent_preserves_existing_connection(client, real_youtube, monkeypatch, outcome):
    save_connection(real_youtube, client.user["id"], "original-channel")
    state = begin(client)["state"][0]
    exchange = fake_provider(monkeypatch)
    query = {}
    if outcome == "expired":
        with SessionLocal() as db:
            db.get(YouTubeOAuthState, hash_token(state)).expires_at = datetime.now(UTC) - timedelta(
                minutes=1
            )
            db.commit()
    elif outcome == "cancelled":
        query["error"] = "access_denied"
    elif outcome == "permission":
        fake_provider(monkeypatch, creds=credentials(refresh=None))
    elif outcome == "failed":
        exchange.side_effect = RuntimeError("sample-client-secret must never reach UI")
    else:
        monkeypatch.setattr(
            "app.youtube_connections.authorized_channel",
            Mock(side_effect=YouTubeConnectionError("No YouTube channel was selected.")),
        )
    response = finish(client, state, **query)
    assert f"youtube={outcome}" in response.headers["location"]
    assert "sample-client-secret" not in response.text
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]).channel_id == "original-channel"


def test_new_connect_invalidates_previous_link(client, real_youtube, monkeypatch):
    first = begin(client)["state"][0]
    second = begin(client)["state"][0]
    fake_provider(monkeypatch)
    assert "expired" in finish(client, first).headers["location"]
    assert "connected" in finish(client, second).headers["location"]


def test_real_batches_never_fall_back_to_shared_token(client, real_youtube, tmp_path, monkeypatch):
    legacy = tmp_path / "legacy-token.json"
    legacy.write_text('{"token":"old-shared-token"}')
    monkeypatch.setattr(real_youtube, "youtube_token_path", legacy)
    payload = {"name": "Training", "workout_date": "2026-10-16", "expected_clip_count": 1}
    assert client.post("/api/sessions", json=payload).status_code == 409
    save_connection(real_youtube, client.user["id"])
    response = client.post("/api/sessions", json=payload)
    assert response.status_code == 201
    with SessionLocal() as db:
        assert db.get(WorkoutSession, response.json()["id"]).youtube_channel_id == "sample-channel"


def test_job_stays_pinned_to_original_channel_and_busy_connection_cannot_switch(
    client, real_youtube, monkeypatch
):
    save_connection(real_youtube, client.user["id"])
    with SessionLocal() as db:
        batch = WorkoutSession(
            user_id=client.user["id"],
            name="Sample",
            workout_date=date.today(),
            expected_clip_count=1,
            status=SessionStatus.QUEUED,
            youtube_channel_id="sample-channel",
        )
        db.add(batch)
        db.commit()
        batch_id = batch.id
    assert client.delete("/api/youtube/connection").status_code == 409
    state = begin(client)["state"][0]
    fake_provider(monkeypatch, channel="another-channel")
    assert "busy" in finish(client, state).headers["location"]
    with SessionLocal() as db:
        db.get(WorkoutSession, batch_id).status = SessionStatus.FAILED
        db.get(YouTubeConnection, client.user["id"]).channel_id = "another-channel"
        db.commit()
    response = client.post(f"/api/sessions/{batch_id}/retry-processing")
    assert response.status_code == 409
    assert "different YouTube channel" in response.text


def test_disconnect_removes_only_own_connection_and_pending_links(
    client, other_client, real_youtube, monkeypatch
):
    save_connection(real_youtube, client.user["id"])
    save_connection(real_youtube, other_client.user["id"], "other-channel")
    begin(client)
    revoke = Mock(return_value=True)
    monkeypatch.setattr("app.youtube_connections.revoke_credentials", revoke)
    response = client.delete("/api/youtube/connection")
    assert response.status_code == 200
    assert response.json()["status"] == "not_connected"
    revoke.assert_called_once()
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is None
        assert db.get(YouTubeConnection, other_client.user["id"]) is not None
        assert db.query(YouTubeOAuthState).count() == 0


def test_encrypted_tokens_cannot_be_transplanted_between_accounts(
    client, other_client, real_youtube
):
    save_connection(real_youtube, client.user["id"])
    with SessionLocal() as db:
        copied = db.get(YouTubeConnection, client.user["id"]).encrypted_credentials
        db.add(
            YouTubeConnection(
                user_id=other_client.user["id"],
                channel_id="sample-channel",
                channel_title="Copied",
                encrypted_credentials=copied,
            )
        )
        db.commit()
    assert other_client.get("/api/youtube/connection").json()["status"] == "reconnect_required"


def test_lost_encryption_key_is_not_silently_replaced(client, real_youtube):
    save_connection(real_youtube, client.user["id"])
    real_youtube.youtube_credentials_key_path.unlink()
    assert client.get("/api/youtube/connection").json()["status"] == "unavailable"
    assert client.post("/api/youtube/connect").status_code == 503
    assert not real_youtube.youtube_credentials_key_path.exists()


def test_uploader_uses_only_batch_owner_credentials_and_refreshes_them(
    client, other_client, real_youtube, monkeypatch
):
    save_connection(real_youtube, client.user["id"], creds=credentials(expired=True))
    save_connection(
        real_youtube,
        other_client.user["id"],
        "other-channel",
        creds=credentials(token="other-token"),
    )

    def refresh(self, _):
        assert self.refresh_token == "sample-refresh-token"
        self.token = "renewed-access-token"
        self.expiry = datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1)

    monkeypatch.setattr(Credentials, "refresh", refresh)
    channel = Mock(return_value=("sample-channel", "Sample"))
    monkeypatch.setattr("app.youtube_connections.authorized_channel", channel)
    build = Mock(return_value="sample-youtube-client")
    monkeypatch.setattr("app.youtube_connections.build", build)
    uploader = make_uploader(
        real_youtube,
        session_factory=SessionLocal,
        user_id=client.user["id"],
        channel_id="sample-channel",
    )
    assert isinstance(uploader, ConnectedYouTubeUploader)
    assert uploader._youtube_client() == "sample-youtube-client"
    assert channel.call_args.args[0].token == "renewed-access-token"
    with SessionLocal() as db:
        assert (
            decrypt_credentials(real_youtube, db.get(YouTubeConnection, client.user["id"])).token
            == "renewed-access-token"
        )
        assert (
            decrypt_credentials(
                real_youtube, db.get(YouTubeConnection, other_client.user["id"])
            ).token
            == "other-token"
        )


def test_revoked_token_marks_only_owner_for_reconnect(
    client, other_client, real_youtube, monkeypatch
):
    save_connection(real_youtube, client.user["id"], creds=credentials(expired=True))
    save_connection(real_youtube, other_client.user["id"], "other-channel")
    monkeypatch.setattr(Credentials, "refresh", Mock(side_effect=RefreshError("invalid_grant")))
    uploader = ConnectedYouTubeUploader(
        real_youtube, SessionLocal, client.user["id"], "sample-channel"
    )
    with pytest.raises(YouTubeConnectionError, match="Reconnect"):
        uploader._youtube_client()
    assert client.get("/api/youtube/connection").json()["status"] == "reconnect_required"
    assert other_client.get("/api/youtube/connection").json()["status"] == "connected"


def test_partial_permission_grant_is_not_saved(client, real_youtube, monkeypatch):
    state = begin(client)["state"][0]
    partial = credentials()
    partial._granted_scopes = [YOUTUBE_SCOPES[0]]
    fake_provider(monkeypatch, creds=partial)
    assert "permission" in finish(client, state).headers["location"]
    assert client.get("/api/youtube/connection").json()["status"] == "not_connected"


def test_transient_refresh_failure_does_not_revoke_working_connection(
    client, real_youtube, monkeypatch
):
    save_connection(real_youtube, client.user["id"], creds=credentials(expired=True))
    monkeypatch.setattr(
        Credentials, "refresh", Mock(side_effect=RefreshError("temporary", retryable=True))
    )
    uploader = ConnectedYouTubeUploader(
        real_youtube, SessionLocal, client.user["id"], "sample-channel"
    )
    with pytest.raises(Exception, match="temporarily unavailable"):
        uploader._youtube_client()
    assert client.get("/api/youtube/connection").json()["status"] == "connected"


def test_callback_codes_are_removed_from_access_logs():
    path = "/api/youtube/callback?code=secret&state=secret"
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        1,
        "%s %s %s %s %s",
        ("browser", "GET", path, "1.1", 303),
        None,
    )
    assert OAuthAccessLogFilter().filter(record)
    assert "secret" not in record.getMessage()
    assert path.split("?")[0] in record.getMessage()


def test_account_snapshot_excludes_credentials_and_deletion_revokes_them(
    client, real_youtube, monkeypatch
):
    import sqlite3

    from app.account_backups import BACKUP_DATABASE, backup_folder, create_account_snapshot
    from app.accounts import delete_account
    from app.models import User

    save_connection(real_youtube, client.user["id"])
    begin(client)
    revoke = Mock(return_value=True)
    monkeypatch.setattr("app.accounts.revoke_credentials", revoke)
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        backup = create_account_snapshot(db, real_youtube, user)
        database = backup_folder(real_youtube, user.id, backup.id) / BACKUP_DATABASE
        with sqlite3.connect(database) as snapshot:
            assert snapshot.execute("SELECT COUNT(*) FROM youtube_connections").fetchone()[0] == 0
            assert snapshot.execute("SELECT COUNT(*) FROM youtube_oauth_states").fetchone()[0] == 0
        delete_account(db, real_youtube, user)
    revoke.assert_called_once()
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is None
        assert db.query(YouTubeOAuthState).count() == 0


# The native app's flow: it starts with its bearer session and a challenge for a secret it keeps.
# Its sign-in browser has no Relay sign-in; the callback only exchanges the code, and the app
# finishes with its session, the completion code and the secret.
APP_RETURN = "relay-mobile://youtube-return"
VERIFIER = "sample-app-verifier-" + "x" * 40
CHALLENGE = hashlib.sha256(VERIFIER.encode()).hexdigest()


def bearer_client(client, user_id):
    """A client holding a bearer token for an account, as the installed app does."""
    from app.auth import create_user_session
    from app.models import User

    with SessionLocal() as db:
        token = create_user_session(db, db.get(User, user_id), client.app.state.settings)
    phone = TestClient(client.app)
    phone.headers["Authorization"] = f"Bearer {token}"
    return phone


@pytest.fixture
def app_session(client):
    phone = bearer_client(client, client.user["id"])
    yield phone
    phone.close()


@pytest.fixture
def browser(client):
    """A sign-in browser: a fresh cookie jar with no Relay sign-in."""
    sign_in_browser = TestClient(client.app)
    yield sign_in_browser
    sign_in_browser.close()


def begin_in_app(phone, return_url=APP_RETURN, challenge=CHALLENGE):
    response = phone.post(
        "/api/youtube/connect", json={"return_url": return_url, "app_challenge": challenge}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["flow"] == "app"
    assert parse_qs(urlsplit(body["url"]).query)["state"] == [body["state"]]
    return body["state"]


def returned(response):
    """The app link a callback returned to, and its query."""
    assert response.status_code == 303, response.text
    location = response.headers["location"]
    return location.split("?", 1)[0], parse_qs(urlsplit(location).query)


def finish_in_app(phone, state, code, verifier=VERIFIER):
    response = phone.post(
        "/api/youtube/finish", json={"state": state, "code": code, "verifier": verifier}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_app_start_returns_google_address_and_seals_the_flow(client, real_youtube, app_session):
    state = begin_in_app(app_session)
    with SessionLocal() as db:
        row = db.get(YouTubeOAuthState, hash_token(state))
        assert row.session_id is not None
        assert CHALLENGE not in row.encrypted_verifier
        assert APP_RETURN not in row.encrypted_verifier
    # The web's start is unchanged: no body still answers with Google's address only.
    response = client.post("/api/youtube/connect")
    assert set(response.json()) == {"url"}


def test_app_flow_saves_only_when_the_starting_app_finishes(
    client, real_youtube, app_session, browser, monkeypatch
):
    state = begin_in_app(app_session)
    exchange = fake_provider(monkeypatch)
    link, query = returned(finish(browser, state))
    assert link == APP_RETURN
    assert query["youtube"] == ["finish"] and len(query["code"]) == 1
    exchange.assert_called_once_with(code="sample-code", timeout=20)
    # Google has answered, but nothing is saved until the app finishes.
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is None
    result = finish_in_app(app_session, state, query["code"][0])
    assert result["result"] == "connected"
    assert result["connection"]["status"] == "connected"
    assert "sample-refresh-token" not in json.dumps(result)
    with SessionLocal() as db:
        row = db.get(YouTubeConnection, client.user["id"])
        assert row.channel_id == "sample-channel"
        assert decrypt_credentials(real_youtube, row).refresh_token == "sample-refresh-token"
        assert db.get(YouTubeOAuthState, hash_token(state)) is None
    # Finishing again, or replaying the callback, changes nothing.
    assert finish_in_app(app_session, state, query["code"][0])["result"] == "expired"
    # The finished flow is gone, so its callback is an unknown state that needs a web sign-in.
    assert finish(browser, state).status_code == 401
    exchange.assert_called_once()


def test_a_shared_start_link_cannot_attach_someone_elses_channel(
    client, other_client, real_youtube, app_session, monkeypatch
):
    """Someone opens your Google link in their browser, even one signed in to Relay, and
    consents. Their channel must never reach your account."""
    client.patch("/api/admin/settings", json={"video_uploads": "everyone"})
    state = begin_in_app(app_session)
    fake_provider(monkeypatch, channel="their-channel")
    link, query = returned(finish(other_client, state))
    code = query["code"][0]
    # The code reached their browser, not your app. Your app has the secret but not the code.
    assert finish_in_app(app_session, state, "guessed-code")["result"] == "expired"
    # They have the code but neither your sign-in nor your secret.
    with bearer_client(client, other_client.user["id"]) as their_app:
        assert finish_in_app(their_app, state, code)["result"] == "expired"
        assert (
            finish_in_app(their_app, state, code, "their-own-verifier-" + "y" * 40)["result"]
            == "expired"
        )
    # Even with your sign-in, a stolen code without your secret fails.
    assert finish_in_app(app_session, state, code, "wrong-verifier-" + "z" * 40)["result"] == (
        "expired"
    )
    # A cookie-signed-in web browser of the starting account can't finish it either.
    response = client.post(
        "/api/youtube/finish", json={"state": state, "code": code, "verifier": VERIFIER}
    )
    assert response.json()["result"] == "expired"
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is None
        assert db.get(YouTubeConnection, other_client.user["id"]) is None


def test_app_flow_ends_with_the_sign_in_that_started_it(
    client, real_youtube, app_session, browser, monkeypatch
):
    state = begin_in_app(app_session)
    exchange = fake_provider(monkeypatch)
    assert app_session.post("/api/auth/logout").status_code < 300
    # Signing out removes the flow with the session.
    assert finish(browser, state).status_code == 401
    exchange.assert_not_called()
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is None


def test_revoking_the_sign_in_during_googles_exchange_saves_nothing(
    client, real_youtube, app_session, browser, monkeypatch
):
    state = begin_in_app(app_session)
    exchange = fake_provider(monkeypatch)
    # The sign-in ends while Google is answering.
    exchange.side_effect = lambda **_: app_session.post("/api/auth/logout")
    # Signing out removed the flow with its session, so nothing waits to be finished.
    assert returned(finish(browser, state)) == (APP_RETURN, {"youtube": ["expired"]})
    exchange.assert_called_once()
    with SessionLocal() as db:
        assert db.get(YouTubeOAuthState, hash_token(state)) is None
        assert db.get(YouTubeConnection, client.user["id"]) is None


def test_losing_video_access_before_finishing_saves_nothing(
    client, other_client, real_youtube, monkeypatch
):
    client.patch("/api/admin/settings", json={"video_uploads": "everyone"})
    with bearer_client(client, other_client.user["id"]) as phone, TestClient(client.app) as web:
        state = begin_in_app(phone)
        fake_provider(monkeypatch)
        code = returned(finish(web, state))[1]["code"][0]
        client.patch("/api/admin/settings", json={"video_uploads": "admin"})
        response = phone.post(
            "/api/youtube/finish", json={"state": state, "code": code, "verifier": VERIFIER}
        )
    assert response.status_code == 403
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, other_client.user["id"]) is None


def test_the_write_rechecks_the_sign_in(client, real_youtube, app_session, browser, monkeypatch):
    """The save itself checks again, so a sign-out racing the finish request stops it."""
    state = begin_in_app(app_session)
    fake_provider(monkeypatch)
    code = returned(finish(browser, state))[1]["code"][0]
    monkeypatch.setattr("app.youtube_connections.may_connect", lambda *_: False)
    assert finish_in_app(app_session, state, code)["result"] == "expired"
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is None


@pytest.mark.parametrize("outcome", ["expired", "cancelled", "failed", "permission"])
def test_app_flow_failures_return_to_the_app_and_keep_the_connection(
    client, real_youtube, app_session, browser, monkeypatch, outcome
):
    save_connection(real_youtube, client.user["id"], "original-channel")
    state = begin_in_app(app_session)
    exchange = fake_provider(monkeypatch)
    query = {}
    if outcome == "expired":
        with SessionLocal() as db:
            db.get(YouTubeOAuthState, hash_token(state)).expires_at = datetime.now(UTC) - timedelta(
                minutes=1
            )
            db.commit()
    elif outcome == "cancelled":
        query["error"] = "access_denied"
    elif outcome == "permission":
        fake_provider(monkeypatch, creds=credentials(refresh=None))
    else:
        exchange.side_effect = RuntimeError("sample-client-secret must never reach UI")
    response = finish(browser, state, **query)
    assert returned(response) == (APP_RETURN, {"youtube": [outcome]})
    assert "sample-client-secret" not in response.text
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]).channel_id == "original-channel"


def test_a_busy_channel_is_not_switched_when_finishing(
    client, real_youtube, app_session, browser, monkeypatch
):
    save_connection(real_youtube, client.user["id"], "original-channel")
    with SessionLocal() as db:
        db.add(
            WorkoutSession(
                user_id=client.user["id"],
                name="Processing",
                workout_date=date.today(),
                expected_clip_count=1,
                status=SessionStatus.QUEUED,
                youtube_channel_id="original-channel",
            )
        )
        db.commit()
    state = begin_in_app(app_session)
    fake_provider(monkeypatch, channel="new-channel")
    code = returned(finish(browser, state))[1]["code"][0]
    assert finish_in_app(app_session, state, code)["result"] == "busy"
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]).channel_id == "original-channel"


def test_a_second_start_replaces_the_first_and_flows_stay_apart(
    client, other_client, real_youtube, app_session, browser, monkeypatch
):
    client.patch("/api/admin/settings", json={"video_uploads": "everyone"})
    first = begin_in_app(app_session)
    second = begin_in_app(app_session)
    # Another account's flow runs in the same browser at the same time.
    their_secret = "their-app-verifier-" + "y" * 40
    with bearer_client(client, other_client.user["id"]) as their_app:
        theirs = begin_in_app(
            their_app, challenge=hashlib.sha256(their_secret.encode()).hexdigest()
        )
        fake_provider(monkeypatch)
        # Starting again replaced the first flow.
        assert finish(browser, first).status_code == 401
        their_code = returned(finish(browser, theirs))[1]["code"][0]
        my_code = returned(finish(browser, second))[1]["code"][0]
        # Neither code works for the other flow, and each app finishes its own.
        assert finish_in_app(app_session, theirs, their_code)["result"] == "expired"
        assert finish_in_app(their_app, second, my_code, their_secret)["result"] == "expired"
        assert finish_in_app(app_session, second, my_code)["result"] == "connected"
        assert finish_in_app(their_app, theirs, their_code, their_secret)["result"] == "connected"
    with SessionLocal() as db:
        assert db.get(YouTubeConnection, client.user["id"]) is not None
        assert db.get(YouTubeConnection, other_client.user["id"]) is not None


def test_a_callback_with_an_unknown_state_still_needs_a_web_sign_in(browser, real_youtube):
    response = browser.get(
        "/api/youtube/callback", params={"state": "unknown", "code": "x"}, follow_redirects=False
    )
    assert response.status_code == 401


def test_expo_go_return_links_need_a_listed_development_host(
    real_youtube, app_session, browser, monkeypatch
):
    target = "exp://127.0.0.1:8081/--/youtube-return"
    response = app_session.post(
        "/api/youtube/connect", json={"return_url": target, "app_challenge": CHALLENGE}
    )
    assert response.status_code == 422
    monkeypatch.setattr(real_youtube, "youtube_app_dev_return_hosts", "127.0.0.1:8081, other:1")
    state = begin_in_app(app_session, target)
    fake_provider(monkeypatch)
    link, query = returned(finish(browser, state))
    assert link == target and query["youtube"] == ["finish"]


@pytest.mark.parametrize(
    "target",
    [
        "https://evil.example/steal",
        "javascript:alert(1)",
        "//evil.example",
        "relay-mobile://youtube-return#",
        "relay-mobile://youtube-return?youtube=connected",
        "relay-mobile://youtube-return/extra",
        "relay-mobile://other",
        "relay-mobile:///youtube-return",
        "exp://evil.example:8081/--/youtube-return",
        "exp://127.0.0.1:8081/--/youtube-return?x=1",
    ],
)
def test_app_return_link_must_be_the_app_link(real_youtube, app_session, monkeypatch, target):
    monkeypatch.setattr(real_youtube, "youtube_app_dev_return_hosts", "127.0.0.1:8081")
    response = app_session.post(
        "/api/youtube/connect", json={"return_url": target, "app_challenge": CHALLENGE}
    )
    assert response.status_code == 422
    with SessionLocal() as db:
        assert db.query(YouTubeOAuthState).count() == 0


@pytest.mark.parametrize("challenge", [None, "short", "A" * 64])
def test_app_start_needs_a_challenge(real_youtube, app_session, challenge):
    body = {"return_url": APP_RETURN, **({"app_challenge": challenge} if challenge else {})}
    assert app_session.post("/api/youtube/connect", json=body).status_code == 422


def test_mock_mode_has_no_app_flow(client, app_session):
    response = app_session.post(
        "/api/youtube/connect", json={"return_url": APP_RETURN, "app_challenge": CHALLENGE}
    )
    assert response.status_code == 409
    response = app_session.post(
        "/api/youtube/finish", json={"state": "any", "code": "any", "verifier": VERIFIER}
    )
    assert response.json()["result"] == "expired"


def test_finish_needs_a_sign_in(anonymous_client):
    response = anonymous_client.post(
        "/api/youtube/finish", json={"state": "any", "code": "any", "verifier": VERIFIER}
    )
    assert response.status_code == 401
