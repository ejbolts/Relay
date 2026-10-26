"""Live friend activity: whether friends are online now, and the workout they are doing.

Each open, visible app window keeps a WebSocket to ``/api/presence/ws`` and reports its state.
Online status lives in memory: the server runs as one process, so a single hub sees every
connection. The workout in progress is stored, so friends still see it while a phone is locked
between sets. It ends when the app finishes or discards the workout, or once the app's inactivity
auto-finish time passes.

Only accepted friends who could see the member on their Friends list receive it, and each part can
be turned off in the sharing settings. Changes are pushed to friends' open windows; the Friends
and feed responses include the same presence, so a dropped socket only delays updates.
"""

from __future__ import annotations

import asyncio
import contextlib
import threading
from datetime import datetime, timedelta
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .auth import as_utc, hash_token, origin_matches_host
from .database import SessionLocal
from .models import LiveWorkout, ProfileSharing, User, UserSession, utc_now

PRIVATE = "private"
# Longer than any real session; caps a workout whose app never reports again.
MAX_WORKOUT = timedelta(hours=12)
MAX_MESSAGE_CHARACTERS = 2_000
SESSION_CHECK_SECONDS = 30
# Close codes the app understands: sign in again, rather than reconnecting.
SIGNED_OUT = 4401

WorkoutKind = Literal["strength", "cardio"]


class LiveWorkoutRead(BaseModel):
    name: str
    kind: WorkoutKind
    started_at: datetime


class FriendPresence(BaseModel):
    """What friends see. Online fields are empty when the member hides their online status."""

    online: bool | None = None
    last_active_at: datetime | None = None
    workout: LiveWorkoutRead | None = None


class LiveWorkoutReport(BaseModel):
    name: str = Field(max_length=120)
    kind: WorkoutKind
    started_at: datetime
    expires_at: datetime

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class PresenceReport(BaseModel):
    """A window's state: whether it is visible, and its device's workout in progress."""

    type: Literal["state"]
    device: str = Field(min_length=1, max_length=64)
    visible: bool
    workout: LiveWorkoutReport | None = None


class Window:
    """An open presence socket, the event loop serving it, and whether its window is visible."""

    __slots__ = ("loop", "socket", "visible", "user_id", "token")

    def __init__(self, socket: WebSocket, user_id: str, token: str) -> None:
        self.socket = socket
        self.loop = asyncio.get_running_loop()
        self.visible = False
        self.user_id = user_id
        self.token = token


class PresenceHub:
    """Open presence sockets by account, and which of them belong to visible windows."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, dict[str, Window]] = {}

    def connect(self, user_id: str, socket_id: str, socket: WebSocket, token: str) -> None:
        with self._lock:
            self._windows.setdefault(user_id, {})[socket_id] = Window(socket, user_id, token)

    def _online(self, user_id: str) -> bool:
        return any(window.visible for window in self._windows.get(user_id, {}).values())

    def set_visible(self, user_id: str, socket_id: str, visible: bool) -> bool:
        """Record a window's visibility; whether the account's online status changed."""
        with self._lock:
            window = self._windows.get(user_id, {}).get(socket_id)
            if window is None:
                return False
            was_online = self._online(user_id)
            window.visible = visible
            return was_online != self._online(user_id)

    def disconnect(self, user_id: str, socket_id: str) -> bool:
        """Forget a socket; whether the account went offline as a result."""
        with self._lock:
            windows = self._windows.get(user_id, {})
            window = windows.pop(socket_id, None)
            if not windows:
                self._windows.pop(user_id, None)
            return window is not None and window.visible and not self._online(user_id)

    def is_online(self, user_id: str) -> bool:
        with self._lock:
            return self._online(user_id)

    def online_ids(self, user_ids: list[str]) -> set[str]:
        with self._lock:
            return {user_id for user_id in user_ids if self._online(user_id)}

    def connected_ids(self, user_ids: list[str]) -> list[str]:
        with self._lock:
            return [user_id for user_id in user_ids if user_id in self._windows]

    def windows_for(self, user_ids: list[str]) -> list[Window]:
        with self._lock:
            return [
                window for user_id in user_ids for window in self._windows.get(user_id, {}).values()
            ]

    def notify(self, user_id: str) -> None:
        """Push a member's presence to friends; safe to call from request threads."""
        with self._lock:
            loop = next(
                (window.loop for windows in self._windows.values() for window in windows.values()),
                None,
            )
        if loop is None or loop.is_closed():
            return
        with contextlib.suppress(RuntimeError):
            asyncio.run_coroutine_threadsafe(broadcast(user_id), loop)


hub = PresenceHub()


def friend_presence(
    member: User,
    sharing: ProfileSharing | None,
    live: LiveWorkout | None,
    online: bool,
    now: datetime | None = None,
) -> FriendPresence | None:
    """A member's presence as friends see it, or ``None`` when there is nothing to show."""
    if sharing is None or sharing.visibility == PRIVATE or member.disabled_at is not None:
        return None
    now = now or utc_now()
    workout = (
        LiveWorkoutRead(name=live.name, kind=live.kind, started_at=as_utc(live.started_at))
        if sharing.share_live_workouts and live is not None and as_utc(live.expires_at) > now
        else None
    )
    if not sharing.share_online_status:
        return FriendPresence(workout=workout) if workout else None
    return FriendPresence(
        online=online,
        last_active_at=as_utc(member.last_active_at) if member.last_active_at else None,
        workout=workout,
    )


def presence_by_member(
    db: Session, members: list[tuple[User, ProfileSharing]]
) -> dict[str, FriendPresence | None]:
    """Presence for several members at once, keyed by account id."""
    ids = [member.id for member, _ in members]
    live = {
        workout.user_id: workout
        for workout in db.scalars(select(LiveWorkout).where(LiveWorkout.user_id.in_(ids)))
    }
    online = hub.online_ids(ids)
    now = utc_now()
    return {
        member.id: friend_presence(member, sharing, live.get(member.id), member.id in online, now)
        for member, sharing in members
    }


def signed_in_user_id(token: str) -> str | None:
    """The account behind a live session cookie, without extending the session."""
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


def save_live_workout(user_id: str, device: str, report: LiveWorkoutReport | None) -> bool:
    """Store or clear a device's workout in progress; whether friends would see a change."""
    with SessionLocal() as db:
        current = db.get(LiveWorkout, user_id)
        before = (current.name, current.kind, as_utc(current.started_at)) if current else None
        now = utc_now()
        if report is not None:
            started_at = min(as_utc(report.started_at), now)
            expires_at = min(as_utc(report.expires_at), started_at + MAX_WORKOUT)
            if expires_at <= now:
                report = None
        if report is None:
            # Another device without a workout open must not end the one in progress.
            if current is None or current.device_id != device:
                return False
            db.delete(current)
            db.commit()
            return True
        if current is None:
            current = LiveWorkout(user_id=user_id)
            db.add(current)
        current.device_id = device
        current.name = report.name
        current.kind = report.kind
        current.started_at = started_at
        current.expires_at = expires_at
        db.commit()
        return before != (report.name, report.kind, started_at)


def record_last_active(user_id: str) -> None:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is not None:
            user.last_active_at = utc_now()
            db.commit()


def presence_update(user_id: str) -> tuple[list[str], FriendPresence | None]:
    """Friends with an open window who can see ``user_id``, and what they should see."""
    from .sharing import shared_friend_ids

    with SessionLocal() as db:
        member = db.get(User, user_id)
        if member is None:
            return [], None
        viewers = hub.connected_ids(list(db.scalars(shared_friend_ids(db, user_id))))
        if not viewers:
            return [], None
        presence = friend_presence(
            member,
            db.get(ProfileSharing, user_id),
            db.get(LiveWorkout, user_id),
            hub.is_online(user_id),
        )
        return viewers, presence


async def broadcast(user_id: str) -> None:
    viewers, presence = await run_in_threadpool(presence_update, user_id)
    message = {
        "type": "presence",
        "user_id": user_id,
        "presence": presence.model_dump(mode="json") if presence else None,
    }
    current = asyncio.get_running_loop()
    for window in hub.windows_for(viewers):
        # Production serves every socket from one loop; test clients give each socket its own.
        if window.loop is current:
            await deliver(window, message)
        elif not window.loop.is_closed():
            with contextlib.suppress(RuntimeError):
                asyncio.run_coroutine_threadsafe(deliver(window, message), window.loop)


async def deliver(window: Window, message: dict) -> None:
    # A socket closing mid-send is cleaned up by its own handler.
    with contextlib.suppress(Exception):
        if await run_in_threadpool(signed_in_user_id, window.token) != window.user_id:
            await window.socket.close(code=SIGNED_OUT)
            return
        await window.socket.send_json(message)


async def leave(user_id: str, socket_id: str) -> None:
    """Forget a closed socket; when it was the last visible window, tell friends."""
    if hub.disconnect(user_id, socket_id):
        await run_in_threadpool(record_last_active, user_id)
        await broadcast(user_id)


presence_router = APIRouter()


@presence_router.websocket("/api/presence/ws")
async def presence_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin is not None and not origin_matches_host(origin, websocket.headers.get("host")):
        await websocket.close(code=1008)
        return
    token = websocket.cookies.get(websocket.app.state.settings.session_cookie)
    user_id = await run_in_threadpool(signed_in_user_id, token) if token else None
    if user_id is None:
        await websocket.accept()
        await websocket.close(code=SIGNED_OUT)
        return
    socket_id = uuid4().hex
    # Registered before the handshake completes, so the window counts as soon as it opens.
    hub.connect(user_id, socket_id, websocket, token)
    try:
        await websocket.accept()
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(), timeout=SESSION_CHECK_SECONDS
                )
            except TimeoutError:
                message = None
            # Open sockets must obey logout, password changes, account disabling and expiry.
            if await run_in_threadpool(signed_in_user_id, token) != user_id:
                await websocket.close(code=SIGNED_OUT)
                break
            if message is None:
                continue
            if len(message) > MAX_MESSAGE_CHARACTERS:
                continue
            try:
                report = PresenceReport.model_validate_json(message)
            except ValidationError:
                continue
            workout_changed = await run_in_threadpool(
                save_live_workout, user_id, report.device, report.workout
            )
            online_changed = hub.set_visible(user_id, socket_id, report.visible)
            if online_changed and not report.visible:
                await run_in_threadpool(record_last_active, user_id)
            if online_changed or workout_changed:
                await broadcast(user_id)
    except WebSocketDisconnect:
        pass
    finally:
        await leave(user_id, socket_id)
