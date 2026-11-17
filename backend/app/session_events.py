"""Account session invalidation, independent of optional social/presence sharing."""

from __future__ import annotations

import asyncio
import contextlib
import threading

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from .auth import as_utc, hash_token, origin_matches_host, utc_now
from .database import SessionLocal
from .models import User, UserSession

SIGNED_OUT = 4401
SESSION_CHECK_SECONDS = 30


class SessionEvents:
    """Wake connected windows after committed revocations; the database decides validity."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, dict[asyncio.Event, asyncio.AbstractEventLoop]] = {}

    def connect(self, user_id: str, wake: asyncio.Event) -> None:
        with self._lock:
            self._windows.setdefault(user_id, {})[wake] = asyncio.get_running_loop()

    def disconnect(self, user_id: str, wake: asyncio.Event) -> None:
        with self._lock:
            windows = self._windows.get(user_id, {})
            windows.pop(wake, None)
            if not windows:
                self._windows.pop(user_id, None)

    def changed(self, user_id: str) -> None:
        with self._lock:
            windows = list(self._windows.get(user_id, {}).items())
        for wake, loop in windows:
            with contextlib.suppress(RuntimeError):
                loop.call_soon_threadsafe(wake.set)


session_events = SessionEvents()
session_router = APIRouter()


def session_user_id(token: str) -> str | None:
    """Check without renewing the session or exposing the cookie to client JavaScript."""
    with SessionLocal() as db:
        row = db.execute(
            select(UserSession.expires_at, User.id, User.disabled_at)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.token_hash == hash_token(token))
        ).first()
    if row is None:
        return None
    expires_at, user_id, disabled_at = row
    return user_id if as_utc(expires_at) > utc_now() and disabled_at is None else None


@session_router.websocket("/api/auth/ws")
async def session_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin is not None and not origin_matches_host(origin, websocket.headers.get("host")):
        await websocket.close(code=1008)
        return
    token = websocket.cookies.get(websocket.app.state.settings.session_cookie)
    user_id = await run_in_threadpool(session_user_id, token) if token else None
    await websocket.accept()
    if user_id is None:
        await websocket.close(code=SIGNED_OUT)
        return
    wake = asyncio.Event()
    session_events.connect(user_id, wake)
    try:
        # Register before checking again so a concurrent logout cannot be missed.
        if await run_in_threadpool(session_user_id, token) != user_id:
            await websocket.close(code=SIGNED_OUT)
            return
        await websocket.send_json({"type": "session", "user_id": user_id})
        while True:
            receive = asyncio.create_task(websocket.receive())
            changed = asyncio.create_task(wake.wait())
            try:
                done, _ = await asyncio.wait(
                    {receive, changed},
                    timeout=SESSION_CHECK_SECONDS,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if receive in done and receive.result()["type"] == "websocket.disconnect":
                    return
            finally:
                for task in (receive, changed):
                    task.cancel()
                await asyncio.gather(receive, changed, return_exceptions=True)
            wake.clear()
            if await run_in_threadpool(session_user_id, token) != user_id:
                await websocket.close(code=SIGNED_OUT)
                return
    except WebSocketDisconnect:
        pass
    finally:
        session_events.disconnect(user_id, wake)
