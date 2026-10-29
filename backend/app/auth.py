"""Password hashing, server-side sessions, request authentication, and abuse controls."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import DEFAULT_SESSION_COOKIE, Settings
from .database import get_db
from .errors import api_error
from .models import User, UserSession
from .server_settings import VideoUploads, load_runtime_settings

SESSION_COOKIE = DEFAULT_SESSION_COOKIE
# One of OWASP's equivalent scrypt profiles: 32 MiB per hash keeps a small VM comfortable.
SCRYPT_N = 2**15
SCRYPT_R = 8
SCRYPT_P = 3
SCRYPT_KEY_BYTES = 64
SCRYPT_SALT_BYTES = 16
SCRYPT_MAXMEM = 128 * 1024 * 1024
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 256
# Failed sign-ins allowed per account from all addresses combined. Each address is limited far
# lower, so locking someone out needs many addresses rather than ten guesses from anywhere.
ACCOUNT_LOGIN_MAX_FAILURES = 100
LAST_SEEN_WRITE_INTERVAL = timedelta(minutes=5)
# How often a session in use has its expiry pushed back to a full lifetime.
SESSION_REFRESH_INTERVAL = timedelta(days=1)
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def utc_now() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes for timezone-aware columns; they are always UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SCRYPT_SALT_BYTES)
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_KEY_BYTES,
        maxmem=SCRYPT_MAXMEM,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(key)}"


def password_needs_rehash(stored: str) -> bool:
    """True when a hash was made with older cost parameters than the current ones."""
    return not stored.startswith(f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}$")


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, key_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(key_b64)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
            maxmem=SCRYPT_MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


@lru_cache
def dummy_password_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def burn_password_check(password: str) -> None:
    """Spend the same time as a real verification when no account matches."""
    verify_password(password, dummy_password_hash())


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_lifetime(settings: Settings) -> timedelta:
    return timedelta(days=settings.session_days)


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        settings.session_cookie,
        token,
        max_age=int(session_lifetime(settings).total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def prune_expired_sessions(db: Session) -> None:
    db.execute(delete(UserSession).where(UserSession.expires_at <= utc_now()))


def create_user_session(
    db: Session, user: User, settings: Settings, user_agent: str | None = None
) -> str:
    """Store a new revocable session and return the raw token for the cookie."""
    prune_expired_sessions(db)
    token = new_session_token()
    now = utc_now()
    user.last_active_at = now
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=now,
            expires_at=now + session_lifetime(settings),
            last_seen_at=now,
            user_agent=(user_agent or "")[:300] or None,
        )
    )
    db.commit()
    return token


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


AppSettings = Annotated[Settings, Depends(get_app_settings)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: UserSession


def not_authenticated():
    return api_error(401, "not_authenticated", "Sign in to continue.")


def get_auth_context(
    request: Request,
    response: Response,
    settings: AppSettings,
    db: Annotated[Session, Depends(get_db)],
) -> AuthContext:
    token = request.cookies.get(settings.session_cookie)
    if not token:
        raise not_authenticated()
    row = db.execute(
        select(UserSession, User)
        .join(User, User.id == UserSession.user_id)
        .where(UserSession.token_hash == hash_token(token))
    ).first()
    if row is None:
        raise not_authenticated()
    session, user = row
    now = utc_now()
    expires_at = as_utc(session.expires_at)
    # Disabling an account deletes its sessions; the check here also covers any that race it.
    if expires_at <= now or user.disabled_at is not None:
        db.delete(session)
        db.commit()
        raise not_authenticated()
    lifetime = session_lifetime(settings)
    if expires_at - now < lifetime - min(SESSION_REFRESH_INTERVAL, lifetime / 2):
        # Sliding expiry: a sign-in only ends after a full lifetime without use. Refresh the
        # browser cookie to match.
        session.expires_at = now + lifetime
        session.last_seen_at = user.last_active_at = now
        db.commit()
        set_session_cookie(response, token, settings)
    elif now - as_utc(session.last_seen_at) > LAST_SEEN_WRITE_INTERVAL:
        session.last_seen_at = user.last_active_at = now
        db.commit()
    return AuthContext(user=user, session=session)


AuthContextDependency = Annotated[AuthContext, Depends(get_auth_context)]


def get_current_user(context: AuthContextDependency) -> User:
    return context.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def can_upload_videos(user: User, video_uploads: VideoUploads) -> bool:
    if video_uploads == "off":
        return False
    return video_uploads == "everyone" or user.is_admin


def require_video_access(
    user: CurrentUser, settings: AppSettings, db: Annotated[Session, Depends(get_db)]
) -> User:
    video_uploads = load_runtime_settings(db, settings).video_uploads
    if video_uploads == "off":
        raise api_error(
            403, "video_uploads_disabled", "Video uploads are turned off on this server."
        )
    if not can_upload_videos(user, video_uploads):
        raise api_error(
            403,
            "video_uploads_restricted",
            "Video uploads are limited to the administrator of this deployment.",
        )
    return user


def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise api_error(403, "admin_required", "Only an administrator can do that.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


class LoginThrottle:
    """In-memory sliding-window limiter for failed credential checks (per process)."""

    def __init__(
        self,
        max_failures: int = 10,
        window_seconds: float = 15 * 60,
        max_keys: int = 10_000,
        clock=time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._clock = clock
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float] | None:
        failures = self._failures.get(key)
        if failures is None:
            return None
        while failures and now - failures[0] >= self.window_seconds:
            failures.popleft()
        if not failures:
            del self._failures[key]
            return None
        return failures

    def is_blocked(self, *keys: str, max_failures: int | None = None) -> bool:
        limit = self.max_failures if max_failures is None else max_failures
        now = self._clock()
        with self._lock:
            for key in keys:
                failures = self._recent(key, now)
                if failures is not None and len(failures) >= limit:
                    return True
        return False

    def record_failure(self, *keys: str) -> None:
        now = self._clock()
        with self._lock:
            if len(self._failures) >= self.max_keys:
                for stale_key in list(self._failures):
                    self._recent(stale_key, now)
                while len(self._failures) >= self.max_keys:
                    self._failures.pop(next(iter(self._failures)))
            for key in keys:
                self._failures.setdefault(key, deque()).append(now)

    def reset(self, *keys: str) -> None:
        with self._lock:
            for key in keys:
                self._failures.pop(key, None)


def get_login_throttle(request: Request) -> LoginThrottle:
    return request.app.state.login_throttle


def too_many_attempts():
    return api_error(429, "too_many_attempts", "Too many failed attempts. Try again later.")


def origin_matches_host(origin: str, host: str | None) -> bool:
    if not host:
        return False
    try:
        origin_host = urlsplit(origin).netloc
    except ValueError:
        return False
    return bool(origin_host) and origin_host.casefold() == host.casefold()


class CsrfOriginMiddleware:
    """Reject cross-site unsafe API requests when the browser says where they came from.

    SameSite=Lax cookies already block most cross-site POSTs; this closes same-site and
    legacy-browser gaps. Requests with no Origin header (curl, non-browser clients) pass.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["method"] in UNSAFE_METHODS
            and scope["path"].startswith("/api/")
        ):
            headers = Headers(scope=scope)
            origin = headers.get("origin")
            if origin is not None and not origin_matches_host(origin, headers.get("host")):
                await JSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": "csrf_rejected",
                            "message": "Cross-site request rejected.",
                        }
                    },
                )(scope, receive, send)
                return
        await self.app(scope, receive, send)
