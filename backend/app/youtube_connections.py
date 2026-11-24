"""Per-user web OAuth. Provider secrets never reach the browser or account backups.

The web starts and finishes in one browser sign-in. The native app starts with its bearer
session, an app return link and a challenge for a secret only that app attempt holds. Its sign-in
browser goes straight to Google; the callback exchanges the code but saves nothing, returning to
the app with a one-time completion code. Only the starting sign-in, presenting that code and the
secret, can then save the channel (`POST /api/youtube/finish`).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import re
import secrets
from collections.abc import Callable
from datetime import timedelta
from typing import Annotated, Literal, NoReturn
from urllib.parse import urlencode, urlsplit

import requests
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Body, Depends, Request, Response
from fastapi.responses import RedirectResponse
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .auth import (
    AppSettings,
    AuthContextDependency,
    CurrentUser,
    as_utc,
    can_upload_videos,
    get_auth_context,
    get_current_user,
    hash_token,
    require_video_access,
)
from .config import Settings
from .database import get_db
from .errors import api_error
from .models import (
    SessionStatus,
    User,
    UserSession,
    WorkoutSession,
    YouTubeConnection,
    YouTubeOAuthState,
    utc_now,
)
from .server_settings import load_runtime_settings
from .youtube import GoogleYouTubeUploader, YouTubeUploadError

logger = logging.getLogger(__name__)

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
    """Keep Google's one-use authorization code and the state out of Uvicorn access logs."""

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


# The only link a release build's sign-in browser returns to. Expo Go's own links are allowed
# only for development hosts the operator lists (`youtube_app_dev_return_hosts`).
APP_RETURN_URL = "relay-mobile://youtube-return"
EXPO_RETURN_URL = re.compile(r"exps?://([A-Za-z0-9.-]{1,253}(?::[0-9]{1,5})?)/--/youtube-return")
STATE_MINUTES = 10
# Long enough for Google's token exchange (20 s timeout) and channel lookup after a claim, so a
# sweep can't remove an exchange that started in time.
EXCHANGE_DEADLINE = timedelta(minutes=2)


class ConnectRequest(BaseModel):
    """Optional: the web posts no body. The app names its return link and its attempt's
    challenge: the lowercase hex SHA-256 of a secret it keeps until it finishes."""

    return_url: str | None = Field(default=None, max_length=300)
    app_challenge: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class FinishRequest(BaseModel):
    state: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=200)
    verifier: str = Field(min_length=43, max_length=128)


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


def app_return_url(settings: Settings, value: str) -> str:
    """The release app's fixed return link, or Expo Go's on a listed development host."""
    if value == APP_RETURN_URL:
        return value
    expo = EXPO_RETURN_URL.fullmatch(value)
    hosts = {
        host.strip().lower()
        for host in (settings.youtube_app_dev_return_hosts or "").split(",")
        if host.strip()
    }
    if expo and expo.group(1).lower() in hosts:
        return value
    raise api_error(422, "invalid_return_url", "That app return link is not allowed.")


def app_flow(settings: Settings, sealed: str) -> dict | None:
    """An app flow's details, or None for a web flow, whose row holds only the verifier."""
    try:
        plain = token_cipher(settings).decrypt(sealed.encode()).decode()
        if not plain.startswith("{"):
            return None
        flow = json.loads(plain)
    except (InvalidToken, YouTubeConnectionError, ValueError):
        return None
    if not isinstance(flow, dict) or flow.get("kind") != "app":
        return None
    if not all(isinstance(flow.get(key), str) for key in ("return_url", "challenge", "stage")):
        return None
    return flow


def seal_flow(settings: Settings, flow: dict) -> str:
    return token_cipher(settings).encrypt(json.dumps(flow).encode()).decode()


@router.post("/connect", dependencies=[Depends(require_video_access)])
def connect(
    context: AuthContextDependency,
    db: Db,
    settings: AppSettings,
    body: Annotated[ConnectRequest | None, Body()] = None,
) -> dict[str, str]:
    if settings.youtube_mock_mode:
        raise api_error(409, "youtube_mock_mode", "Demo mode does not connect Google accounts.")
    return_url = app_return_url(settings, body.return_url) if body and body.return_url else None
    if return_url and not (body and body.app_challenge):
        raise api_error(422, "missing_app_challenge", "Connecting in the app needs a challenge.")
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
    secret = verifier
    if return_url:
        secret = json.dumps(
            {
                "kind": "app",
                "stage": "started",
                "verifier": verifier,
                "return_url": return_url,
                "challenge": body.app_challenge,
            }
        )
    db.add(
        YouTubeOAuthState(
            state_hash=hash_token(state),
            user_id=context.user.id,
            session_id=context.session.id,
            encrypted_verifier=cipher.encrypt(secret.encode()).decode(),
            expires_at=utc_now() + timedelta(minutes=STATE_MINUTES),
        )
    )
    db.commit()
    # `flow` and `state` are additions: an app that sees no `flow` is talking to an older server.
    return {"url": url, "flow": "app", "state": state} if return_url else {"url": url}


NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}


def callback_redirect(result: str) -> RedirectResponse:
    return RedirectResponse(f"/?youtube={result}#videos", status_code=303, headers=NO_STORE)


def app_redirect(return_url: str, result: str, code: str | None = None) -> RedirectResponse:
    # The return link is one of the fixed forms above, so it never has a query of its own.
    params = {"youtube": result, **({"code": code} if code else {})}
    return RedirectResponse(f"{return_url}?{urlencode(params)}", status_code=303, headers=NO_STORE)


def find_state(
    db: Session, settings: Settings, state: str
) -> tuple[YouTubeOAuthState | None, dict | None]:
    """A state's row, expired or not, and its app flow; a web state has no app flow."""
    if not state or len(state) > 200 or settings.youtube_mock_mode:
        return None, None
    row = db.get(YouTubeOAuthState, hash_token(state))
    if row is None:
        return None, None
    # A snapshot: the claims below replace or delete the row with their own conditions.
    db.expunge(row)
    return row, app_flow(settings, row.encrypted_verifier)


def replace_flow(
    db: Session, state_hash: str, current: str, sealed: str, *, unexpired: bool = False, **values
) -> bool:
    """Swaps a flow's sealed details only if they are still `current` (and, with `unexpired`,
    only before the flow's deadline)."""
    conditions = [
        YouTubeOAuthState.state_hash == state_hash,
        YouTubeOAuthState.encrypted_verifier == current,
    ]
    if unexpired:
        conditions.append(YouTubeOAuthState.expires_at > utc_now())
    changed = db.execute(
        update(YouTubeOAuthState)
        .where(*conditions)
        .values(encrypted_verifier=sealed, **values)
        .execution_options(synchronize_session=False)
    ).rowcount
    db.commit()
    return bool(changed)


def forget_flow(db: Session, state_hash: str) -> None:
    db.execute(
        delete(YouTubeOAuthState)
        .where(YouTubeOAuthState.state_hash == state_hash)
        .execution_options(synchronize_session=False)
    )
    db.commit()


def may_connect(db: Session, settings: Settings, user_id: str, session_id: str) -> bool:
    """Whether a sign-in is still open, and its account may still upload videos.

    Reads columns, never ORM objects, so a request's cached `UserSession` or `User` can't answer
    for rows another request has since changed or deleted.
    """
    session = db.execute(
        select(UserSession.user_id, UserSession.expires_at).where(UserSession.id == session_id)
    ).first()
    if session is None or session.user_id != user_id or as_utc(session.expires_at) <= utc_now():
        return False
    user = db.execute(
        select(User.disabled_at, User.must_change_password, User.is_admin).where(User.id == user_id)
    ).first()
    if user is None or user.disabled_at is not None or user.must_change_password:
        return False
    return can_upload_videos(user, load_runtime_settings(db, settings).video_uploads)


def exchange_code(
    settings: Settings, state: str, verifier: str, code: str
) -> tuple[str, Credentials | None, str | None, str | None]:
    """Google's side: the code's credentials and channel, or the result to show instead."""
    try:
        flow = oauth_flow(settings, state=state, verifier=verifier)
        # Passing only the code avoids trusting proxy headers or exposing it in other resources.
        flow.fetch_token(code=code, timeout=20)
        credentials = flow.credentials
        if not credentials.refresh_token or not granted_permissions(credentials):
            return "permission", None, None, None
        channel_id, title = authorized_channel(credentials)
        return "connected", credentials, channel_id, title
    except YouTubeConnectionError as connection_error:
        return (
            ("no_channel" if "No YouTube channel" in str(connection_error) else "failed"),
            None,
            None,
            None,
        )
    except Exception:
        # Google exceptions can contain codes, tokens, or client secrets. Never log their text.
        return "failed", None, None, None


def write_connection(db: Session, user_id: str, encrypted: str, channel_id: str, title: str) -> str:
    """Stores a channel for an account, unless a video is still processing for another one.
    The caller commits."""
    current = db.execute(
        select(YouTubeConnection.channel_id).where(YouTubeConnection.user_id == user_id)
    ).first()
    if current and current.channel_id != channel_id and has_active_job(db, user_id):
        return "busy"
    values = {
        "channel_id": channel_id,
        "channel_title": title,
        "encrypted_credentials": encrypted,
        "needs_reconnect": False,
    }
    if current:
        changed = db.execute(
            update(YouTubeConnection)
            .where(YouTubeConnection.user_id == user_id)
            .values(**values)
            .execution_options(synchronize_session=False)
        ).rowcount
        if changed != 1:
            # Disconnected meanwhile: report a failure rather than a connection nobody saved.
            raise YouTubeConnectionError("The connection changed while saving.")
    else:
        db.add(YouTubeConnection(user_id=user_id, **values))
    return "connected"


def save_connection(db: Session, user_id: str, encrypted: str, channel_id: str, title: str) -> str:
    """The web's save, right after its own callback."""
    try:
        result = write_connection(db, user_id, encrypted, channel_id, title)
        db.commit()
    except Exception:
        db.rollback()
        return "failed"
    return result


def app_callback(
    db: Session,
    settings: Settings,
    row: YouTubeOAuthState,
    flow: dict,
    *,
    state: str,
    code: str,
    error: str,
) -> RedirectResponse:
    """Exchanges the code for the app, keeping the result sealed until the app finishes.

    Every result, failures included, waits under the state for the app's proof, so a link that
    merely looks like the return can never report one.
    """
    return_url = flow["return_url"]
    if flow["stage"] != "started" or as_utc(row.expires_at) <= utc_now():
        # Expired, or already returned: a finished flow is left for the app to complete.
        return app_redirect(return_url, "expired")
    # Claim once, atomically, before a network request. A replay cannot exchange the code again.
    claimed = {key: value for key, value in flow.items() if key != "verifier"}
    claimed["stage"] = "exchanging"
    claimed_sealed = seal_flow(settings, claimed)
    # The claim checks the deadline atomically, and gives the exchange its own short one.
    if not replace_flow(
        db,
        row.state_hash,
        row.encrypted_verifier,
        claimed_sealed,
        unexpired=True,
        expires_at=utc_now() + EXCHANGE_DEADLINE,
    ):
        return app_redirect(return_url, "expired")
    if not may_connect(db, settings, row.user_id, row.session_id):
        forget_flow(db, row.state_hash)
        return app_redirect(return_url, "expired")
    if error or not code or len(code) > 4096:
        outcome: dict = {"result": "cancelled" if error == "access_denied" else "failed"}
    else:
        result, credentials, channel_id, title = exchange_code(
            settings, state, flow["verifier"], code
        )
        outcome = {"result": result}
        if credentials is not None:
            # Nothing is saved yet. The channel waits, sealed, for the app that holds the secret.
            outcome |= {
                "credentials": encrypt_credentials(settings, row.user_id, credentials),
                "channel_id": channel_id,
                "channel_title": title,
            }
    completion = secrets.token_urlsafe(32)
    settled = {**claimed, **outcome, "stage": "settled", "code_hash": hash_token(completion)}
    if not replace_flow(
        db,
        row.state_hash,
        claimed_sealed,
        seal_flow(settings, settled),
        expires_at=utc_now() + timedelta(minutes=STATE_MINUTES),
    ):
        return app_redirect(return_url, "expired")
    return app_redirect(return_url, "finish", completion)


@router.get("/callback")
def callback(
    request: Request,
    response: Response,
    db: Db,
    settings: AppSettings,
    state: str = "",
    code: str = "",
    error: str = "",
) -> RedirectResponse:
    # The app's sign-in browser has no Relay sign-in: its state identifies the flow.
    row, flow = find_state(db, settings, state)
    if row is not None and flow is not None:
        return app_callback(db, settings, row, flow, state=state, code=code, error=error)
    # The web's flow, unchanged: it needs the browser sign-in that started it.
    context = get_auth_context(request, response, settings, db)
    require_video_access(get_current_user(context), settings, db)
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
    except (YouTubeConnectionError, InvalidToken):
        return callback_redirect("failed")
    result, credentials, channel_id, title = exchange_code(settings, state, verifier, code)
    if credentials is None:
        return callback_redirect(result)
    try:
        encrypted = encrypt_credentials(settings, context.user.id, credentials)
    except Exception:
        return callback_redirect("failed")
    return callback_redirect(save_connection(db, context.user.id, encrypted, channel_id, title))


class FinishRead(BaseModel):
    result: str
    connection: YouTubeConnectionRead


def finish_app_flow(
    db: Session,
    settings: Settings,
    row: YouTubeOAuthState,
    flow: dict,
    user_id: str,
    session_id: str,
) -> str:
    """Claims a settled flow and saves its channel in one transaction.

    The claim is a write, so SQLite holds its write lock from here to the commit: a sign-out,
    a lost video permission or a disconnect on another device either lands before the claim
    (and the reads below see it) or waits until this save is done.
    """
    db.commit()  # Start from a clean transaction, so the claim below begins the write.
    try:
        claimed = db.execute(
            delete(YouTubeOAuthState)
            .where(
                YouTubeOAuthState.state_hash == row.state_hash,
                YouTubeOAuthState.encrypted_verifier == row.encrypted_verifier,
                YouTubeOAuthState.user_id == user_id,
                YouTubeOAuthState.session_id == session_id,
                YouTubeOAuthState.expires_at > utc_now(),
            )
            .returning(YouTubeOAuthState.state_hash)
            .execution_options(synchronize_session=False)
        ).scalar_one_or_none()
        if claimed is None:
            db.rollback()
            return "expired"
        if "credentials" not in flow:
            # Google's answer was a failure: it is confirmed now, and the attempt is used up.
            db.commit()
            return str(flow.get("result", "failed"))
        if not may_connect(db, settings, user_id, session_id):
            db.commit()
            return "expired"
        result = write_connection(
            db, user_id, flow["credentials"], flow["channel_id"], flow["channel_title"]
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        return "failed"


@router.post("/finish", response_model=FinishRead, dependencies=[Depends(require_video_access)])
def finish(
    body: FinishRequest, context: AuthContextDependency, db: Db, settings: AppSettings
) -> FinishRead:
    """Ends an app flow: only the starting sign-in, with the code and the secret, gets its result,
    and only then is a channel saved."""
    result = "expired"
    user_id, session_id = context.user.id, context.session.id
    row, flow = find_state(db, settings, body.state)
    proof = hashlib.sha256(body.verifier.encode()).hexdigest()
    if (
        row is not None
        and flow is not None
        and flow["stage"] == "settled"
        and row.user_id == user_id
        and row.session_id == session_id
        and hmac.compare_digest(hash_token(body.code), str(flow.get("code_hash", "")))
        and hmac.compare_digest(proof, flow["challenge"])
    ):
        result = finish_app_flow(db, settings, row, flow, user_id, session_id)
    return FinishRead(result=result, connection=read_connection(db, settings, user_id))


def remove_expired_states(session_factory: Callable[[], Session]) -> int:
    """Deletes expired attempts, with any Google credentials an abandoned one still holds."""
    with session_factory() as db:
        removed = db.execute(
            delete(YouTubeOAuthState).where(YouTubeOAuthState.expires_at <= utc_now())
        ).rowcount
        db.commit()
        return removed


class OAuthStateSweeper:
    """Removes expired connection attempts on startup and every few minutes after.

    Stopping ends the waits between sweeps, and waits for a sweep already running to finish, so
    no sweep outlives the app's shutdown.
    """

    interval_seconds = 300

    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory
        self._task: asyncio.Task[None] | None = None
        self._stopping: asyncio.Event | None = None

    def start(self) -> None:
        self._stopping = asyncio.Event()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._stopping:
            self._stopping.set()
        if self._task:
            await asyncio.gather(self._task, return_exceptions=True)

    async def _run(self) -> None:
        assert self._stopping is not None
        while not self._stopping.is_set():
            try:
                await asyncio.to_thread(remove_expired_states, self.session_factory)
            except Exception:
                # The next sweep tries again; expired attempts can't be used meanwhile.
                logger.warning("Could not remove expired YouTube connection attempts")
            try:
                await asyncio.wait_for(self._stopping.wait(), self.interval_seconds)
            except TimeoutError:
                pass


@router.delete("/connection", response_model=YouTubeConnectionRead)
def disconnect(user: CurrentUser, db: Db, settings: AppSettings) -> YouTubeConnectionRead:
    db.commit()  # Start from a clean transaction, so the first statement below begins the write.
    # Deleting pending attempts first takes SQLite's write lock, so an app finish saving a channel
    # either commits before everything below reads, or waits until this disconnect is done.
    db.execute(
        delete(YouTubeOAuthState)
        .where(YouTubeOAuthState.user_id == user.id)
        .execution_options(synchronize_session=False)
    )
    if has_active_job(db, user.id):
        db.rollback()
        raise api_error(
            409, "youtube_busy", "Wait for video processing to finish before disconnecting."
        )
    removed = db.execute(
        delete(YouTubeConnection)
        .where(YouTubeConnection.user_id == user.id)
        .returning(YouTubeConnection.encrypted_credentials)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()
    db.commit()
    # Revoke the grant of the row this disconnect deleted, never one read before the lock.
    credentials = None
    if removed is not None:
        try:
            credentials = decrypt_credentials(
                settings, YouTubeConnection(user_id=user.id, encrypted_credentials=removed)
            )
        except YouTubeConnectionError:
            pass
    revoked = credentials is not None and revoke_credentials(credentials)
    result = read_connection(db, settings, user.id)
    result.message = (
        "YouTube disconnected. Existing videos stay on your channel."
        if revoked or removed is None
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
