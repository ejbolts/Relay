"""Per-user web OAuth. Provider secrets never reach the browser or account backups."""

from __future__ import annotations

import json
import logging
import re
import secrets
from collections.abc import Callable
from datetime import timedelta
from typing import Annotated, Literal, NoReturn
from urllib.parse import urlsplit

import requests
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .auth import AppSettings, AuthContextDependency, CurrentUser, hash_token, require_video_access
from .config import Settings
from .database import get_db
from .errors import api_error
from .models import SessionStatus, WorkoutSession, YouTubeConnection, YouTubeOAuthState, utc_now
from .youtube import GoogleYouTubeUploader, YouTubeUploadError

YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]

Db = Annotated[Session, Depends(get_db)]
BUSY_STATUSES = (
    SessionStatus.QUEUED,
    SessionStatus.NORMALIZING,
    SessionStatus.STITCHING,
    SessionStatus.UPLOADING_TO_YOUTUBE,
    SessionStatus.YOUTUBE_PROCESSING,
)
RECONNECT_MESSAGE = "Reconnect your YouTube channel in Video logger, then retry."
SETUP_MESSAGE = "YouTube connections are not ready. Ask the app administrator to finish setup."


class OAuthAccessLogFilter(logging.Filter):
    """Keep Google's one-use authorization code out of Uvicorn access logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and len(record.args) == 5:
            client, method, path, protocol, status = record.args
            if isinstance(path, str) and path.split("?", 1)[0] == "/api/youtube/callback":
                record.args = (client, method, "/api/youtube/callback", protocol, status)
        return True


def granted_permissions(credentials: Credentials) -> bool:
    scopes = credentials.granted_scopes
    if scopes is None:
        scopes = credentials.scopes or []
    if isinstance(scopes, str):
        scopes = scopes.split()
    return set(YOUTUBE_SCOPES).issubset(scopes)


class YouTubeConnectionError(YouTubeUploadError):
    """A safe, actionable error that requires user or operator attention."""


class YouTubeConnectionRead(BaseModel):
    status: Literal["mock", "unavailable", "not_connected", "connected", "reconnect_required"]
    channel_id: str | None = None
    channel_title: str | None = None
    channel_url: str | None = None
    can_disconnect: bool = True
    message: str
    privacy_status: str


def web_client_config(settings: Settings) -> dict:
    """Use fixed Google endpoints, never endpoints supplied by a request or secret file."""
    try:
        uri = urlsplit(settings.youtube_redirect_uri or "")
        if (
            not uri.hostname
            or uri.username is not None
            or uri.password is not None
            or uri.query
            or uri.fragment
            or uri.path != "/api/youtube/callback"
            or not (
                uri.scheme == "https"
                or (uri.scheme == "http" and uri.hostname in {"localhost", "127.0.0.1", "::1"})
            )
        ):
            raise ValueError("Invalid callback URL")
        web = json.loads(settings.youtube_web_client_secret_path.read_text(encoding="utf-8"))["web"]
        if not isinstance(web["client_id"], str) or not isinstance(web["client_secret"], str):
            raise ValueError("Missing web client")
        if not web["client_id"] or not web["client_secret"]:
            raise ValueError("Empty web client")
        return {
            "web": {
                "client_id": web["client_id"],
                "client_secret": web["client_secret"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise YouTubeConnectionError(SETUP_MESSAGE) from error


def token_cipher(settings: Settings, *, create: bool = False) -> Fernet:
    path = settings.youtube_credentials_key_path
    try:
        if create and not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with path.open("xb") as target:
                    target.write(Fernet.generate_key())
                path.chmod(0o600)
            except FileExistsError:
                pass
        return Fernet(path.read_bytes())
    except (OSError, ValueError) as error:
        raise YouTubeConnectionError(SETUP_MESSAGE) from error


def encrypt_credentials(settings: Settings, user_id: str, credentials: Credentials) -> str:
    payload = {"user_id": user_id, "credentials": json.loads(credentials.to_json())}
    return token_cipher(settings).encrypt(json.dumps(payload).encode()).decode()


def decrypt_credentials(settings: Settings, connection: YouTubeConnection) -> Credentials:
    try:
        payload = json.loads(
            token_cipher(settings).decrypt(connection.encrypted_credentials.encode())
        )
        if payload["user_id"] != connection.user_id:
            raise ValueError("Credential owner mismatch")
        # The current operator-controlled web client supplies the secret, not a database row.
        info = payload["credentials"]
        client = web_client_config(settings)["web"]
        if info["client_id"] != client["client_id"]:
            raise ValueError("OAuth client changed")
        info.update(client_secret=client["client_secret"], token_uri=client["token_uri"])
        return Credentials.from_authorized_user_info(info, YOUTUBE_SCOPES)
    except (InvalidToken, ValueError, KeyError, TypeError) as error:
        raise YouTubeConnectionError(RECONNECT_MESSAGE) from error


def has_active_job(db: Session, user_id: str) -> bool:
    return (
        db.scalar(
            select(WorkoutSession.id)
            .where(WorkoutSession.user_id == user_id, WorkoutSession.status.in_(BUSY_STATUSES))
            .limit(1)
        )
        is not None
    )


def require_connection(
    db: Session, settings: Settings, user_id: str | None, channel_id: str | None = None
) -> YouTubeConnection | None:
    if settings.youtube_mock_mode:
        return None
    web_client_config(settings)
    connection = db.get(YouTubeConnection, user_id) if user_id else None
    if not connection or connection.needs_reconnect:
        raise YouTubeConnectionError(RECONNECT_MESSAGE)
    if channel_id is not None and connection.channel_id != channel_id:
        raise YouTubeConnectionError(
            "This batch belongs to a different YouTube channel. Reconnect that channel to retry."
        )
    decrypt_credentials(settings, connection)
    return connection


def read_connection(db: Session, settings: Settings, user_id: str) -> YouTubeConnectionRead:
    row = db.get(YouTubeConnection, user_id)
    result = YouTubeConnectionRead(
        status="not_connected",
        message="Connect your own channel to upload workout videos.",
        privacy_status=settings.youtube_privacy_status,
        can_disconnect=not has_active_job(db, user_id),
    )
    if row:
        result.channel_id = row.channel_id
        result.channel_title = row.channel_title
        result.channel_url = f"https://www.youtube.com/channel/{row.channel_id}"
    if settings.youtube_mock_mode:
        result.status = "mock"
        result.message = "Demo mode: videos are not sent to YouTube."
        return result
    try:
        web_client_config(settings)
        if row:
            decrypt_credentials(settings, row)
        elif settings.youtube_credentials_key_path.exists():
            token_cipher(settings)
    except YouTubeConnectionError as error:
        result.status = "unavailable" if str(error) == SETUP_MESSAGE else "reconnect_required"
        result.message = str(error)
        return result
    if row:
        result.status = "reconnect_required" if row.needs_reconnect else "connected"
        result.message = RECONNECT_MESSAGE if row.needs_reconnect else "Uploads go to your channel."
    return result


def oauth_flow(settings: Settings, *, state: str, verifier: str) -> Flow:
    return Flow.from_client_config(
        web_client_config(settings),
        scopes=YOUTUBE_SCOPES,
        state=state,
        redirect_uri=settings.youtube_redirect_uri,
        code_verifier=verifier,
        autogenerate_code_verifier=False,
    )


def authorized_channel(credentials: Credentials) -> tuple[str, str]:
    response = (
        build("youtube", "v3", credentials=credentials, cache_discovery=False)
        .channels()
        .list(part="snippet", mine=True)
        .execute()
    )
    items = response.get("items", [])
    if len(items) != 1 or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", items[0].get("id", "")):
        raise YouTubeConnectionError(
            "No YouTube channel was selected. Create a channel on YouTube, then connect again."
        )
    return items[0]["id"], str(items[0].get("snippet", {}).get("title") or "Your channel")[:200]


def revoke_credentials(credentials: Credentials) -> bool:
    try:
        response = requests.post(
            "https://oauth2.googleapis.com/revoke",
            data={"token": credentials.refresh_token or credentials.token},
            timeout=15,
        )
        return response.status_code in {200, 400}
    except requests.RequestException:
        return False


router = APIRouter(prefix="/api/youtube", tags=["YouTube"])


@router.get("/connection", response_model=YouTubeConnectionRead)
def connection_status(user: CurrentUser, db: Db, settings: AppSettings) -> YouTubeConnectionRead:
    return read_connection(db, settings, user.id)


@router.post("/connect", dependencies=[Depends(require_video_access)])
def connect(context: AuthContextDependency, db: Db, settings: AppSettings) -> dict[str, str]:
    if settings.youtube_mock_mode:
        raise api_error(409, "youtube_mock_mode", "Demo mode does not connect Google accounts.")
    try:
        web_client_config(settings)
        # Never replace a lost key while other users still have encrypted connections.
        cipher = token_cipher(
            settings, create=db.scalar(select(YouTubeConnection.user_id).limit(1)) is None
        )
        state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
        flow = oauth_flow(settings, state=state, verifier=verifier)
        url, _ = flow.authorization_url(access_type="offline", prompt="consent select_account")
    except YouTubeConnectionError as error:
        raise api_error(503, "youtube_not_configured", str(error)) from error
    db.execute(
        delete(YouTubeOAuthState).where(
            (YouTubeOAuthState.user_id == context.user.id)
            | (YouTubeOAuthState.expires_at <= utc_now())
        )
    )
    db.add(
        YouTubeOAuthState(
            state_hash=hash_token(state),
            user_id=context.user.id,
            session_id=context.session.id,
            encrypted_verifier=cipher.encrypt(verifier.encode()).decode(),
            expires_at=utc_now() + timedelta(minutes=10),
        )
    )
    db.commit()
    return {"url": url}


def callback_redirect(result: str) -> RedirectResponse:
    return RedirectResponse(
        f"/?youtube={result}#videos",
        status_code=303,
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.get("/callback", dependencies=[Depends(require_video_access)])
def callback(
    context: AuthContextDependency,
    db: Db,
    settings: AppSettings,
    state: str = "",
    code: str = "",
    error: str = "",
) -> RedirectResponse:
    if not state or len(state) > 200 or settings.youtube_mock_mode:
        return callback_redirect("expired")
    # Claim once, atomically, before a network request. A replay cannot exchange the code again.
    claimed = db.execute(
        delete(YouTubeOAuthState)
        .where(
            YouTubeOAuthState.state_hash == hash_token(state),
            YouTubeOAuthState.user_id == context.user.id,
            YouTubeOAuthState.session_id == context.session.id,
            YouTubeOAuthState.expires_at > utc_now(),
        )
        .returning(YouTubeOAuthState.encrypted_verifier)
    ).scalar_one_or_none()
    db.commit()
    if claimed is None:
        return callback_redirect("expired")
    if error or not code or len(code) > 4096:
        return callback_redirect("cancelled" if error == "access_denied" else "failed")
    try:
        verifier = token_cipher(settings).decrypt(claimed.encode()).decode()
        flow = oauth_flow(settings, state=state, verifier=verifier)
        # Passing only the code avoids trusting proxy headers or exposing it in other resources.
        flow.fetch_token(code=code, timeout=20)
        credentials = flow.credentials
        if not credentials.refresh_token or not granted_permissions(credentials):
            return callback_redirect("permission")
        channel_id, title = authorized_channel(credentials)
        connection = db.get(YouTubeConnection, context.user.id)
        if (
            connection
            and connection.channel_id != channel_id
            and has_active_job(db, context.user.id)
        ):
            return callback_redirect("busy")
        encrypted = encrypt_credentials(settings, context.user.id, credentials)
        if connection is None:
            connection = YouTubeConnection(user_id=context.user.id)
            db.add(connection)
        connection.channel_id, connection.channel_title = channel_id, title
        connection.encrypted_credentials, connection.needs_reconnect = encrypted, False
        db.commit()
    except YouTubeConnectionError as connection_error:
        return callback_redirect(
            "no_channel" if "No YouTube channel" in str(connection_error) else "failed"
        )
    except Exception:
        # Google exceptions can contain codes, tokens, or client secrets. Never log their text.
        db.rollback()
        return callback_redirect("failed")
    return callback_redirect("connected")


@router.delete("/connection", response_model=YouTubeConnectionRead)
def disconnect(user: CurrentUser, db: Db, settings: AppSettings) -> YouTubeConnectionRead:
    if has_active_job(db, user.id):
        raise api_error(
            409, "youtube_busy", "Wait for video processing to finish before disconnecting."
        )
    connection = db.get(YouTubeConnection, user.id)
    credentials = None
    if connection:
        try:
            credentials = decrypt_credentials(settings, connection)
        except YouTubeConnectionError:
            pass
        db.delete(connection)
    db.execute(delete(YouTubeOAuthState).where(YouTubeOAuthState.user_id == user.id))
    db.commit()
    revoked = credentials is not None and revoke_credentials(credentials)
    result = read_connection(db, settings, user.id)
    result.message = (
        "YouTube disconnected. Existing videos stay on your channel."
        if revoked or connection is None
        else "YouTube disconnected from this app. Remove its access in your Google account too."
    )
    return result


class ConnectedYouTubeUploader(GoogleYouTubeUploader):
    """Load only the batch owner's credentials; a global token is never a fallback."""

    def __init__(
        self,
        settings: Settings,
        session_factory: Callable[[], Session],
        user_id: str | None,
        channel_id: str | None,
    ):
        super().__init__(settings)
        self.session_factory, self.user_id, self.channel_id = session_factory, user_id, channel_id

    def _youtube_client(self):
        with self.session_factory() as db:
            connection = require_connection(db, self.settings, self.user_id, self.channel_id)
            if not connection or not self.channel_id:
                raise YouTubeConnectionError(
                    "This older batch has no personal channel connection. Start a new upload."
                )
            credentials = decrypt_credentials(self.settings, connection)
            encrypted_before = connection.encrypted_credentials
        try:
            if not credentials.valid:
                if not credentials.refresh_token:
                    raise RefreshError("Missing refresh token")
                credentials.refresh(GoogleRequest())
                with self.session_factory() as db:
                    saved = db.execute(
                        update(YouTubeConnection)
                        .where(
                            YouTubeConnection.user_id == self.user_id,
                            YouTubeConnection.encrypted_credentials == encrypted_before,
                        )
                        .values(
                            encrypted_credentials=encrypt_credentials(
                                self.settings, self.user_id, credentials
                            )
                        )
                    ).rowcount
                    db.commit()
                    if not saved:
                        raise YouTubeConnectionError(RECONNECT_MESSAGE)
            actual_id, _ = authorized_channel(credentials)
            if actual_id != self.channel_id:
                raise RefreshError("Channel mismatch")
            return build("youtube", "v3", credentials=credentials, cache_discovery=False)
        except RefreshError as error:
            if error.retryable:
                raise YouTubeUploadError(
                    "YouTube is temporarily unavailable. Try again later."
                ) from None
            with self.session_factory() as db:
                db.execute(
                    update(YouTubeConnection)
                    .where(
                        YouTubeConnection.user_id == self.user_id,
                        YouTubeConnection.channel_id == self.channel_id,
                    )
                    .values(needs_reconnect=True)
                )
                db.commit()
            raise YouTubeConnectionError(RECONNECT_MESSAGE) from error
        except HttpError as error:
            self._raise_api_error(error)

    def _raise_api_error(self, error: Exception) -> NoReturn:
        if isinstance(error, HttpError) and (
            error.resp.status == 401
            or (error.resp.status == 403 and "insufficient" in str(error).lower())
        ):
            with self.session_factory() as db:
                db.execute(
                    update(YouTubeConnection)
                    .where(
                        YouTubeConnection.user_id == self.user_id,
                        YouTubeConnection.channel_id == self.channel_id,
                    )
                    .values(needs_reconnect=True)
                )
                db.commit()
            raise YouTubeConnectionError(RECONNECT_MESSAGE) from None
        raise YouTubeUploadError(
            "YouTube could not complete this request. Check your channel's upload limits "
            "or try again later."
        ) from None
