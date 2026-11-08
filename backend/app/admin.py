"""Admin console API: account oversight, runtime switches, and server health."""

from __future__ import annotations

import secrets
import shutil
from collections.abc import Iterable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from . import client_versions
from .account_limits import (
    AccountLimits,
    AccountLimitsRead,
    account_limits_read,
    save_account_limits,
)
from .accounts import no_store
from .auth import (
    AdminUser,
    AppSettings,
    LoginThrottle,
    as_utc,
    get_login_throttle,
    hash_password,
    require_admin,
    utc_now,
)
from .config import Settings
from .database import get_db
from .errors import api_error
from .models import (
    MachinePhoto,
    PushSubscription,
    SessionStatus,
    TrainingWorkout,
    User,
    UserSession,
    WorkoutSession,
)
from .photo_storage import machine_photo_paths
from .presence import FriendPresence, admin_presence_by_member
from .server_settings import (
    ALLOW_REGISTRATION_KEY,
    VIDEO_UPLOADS_KEY,
    VideoUploads,
    load_runtime_settings,
    save_runtime_setting,
)
from .session_events import session_events

DbDependency = Annotated[Session, Depends(get_db)]
Throttle = Annotated[LoginThrottle, Depends(get_login_throttle)]

# Lowercase letters and digits without look-alikes (no i, l, o, 0 or 1), so a temporary password
# can be read out or typed without mix-ups.
TEMPORARY_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
TEMPORARY_PASSWORD_GROUPS = 3
TEMPORARY_PASSWORD_GROUP_LENGTH = 5

# Sign-ins unused for longer are left out of the app versions still in use.
CLIENT_VERSION_WINDOW = timedelta(days=30)

# Sessions the background processor still has to work on, in pipeline order.
VIDEO_QUEUE_STATUSES = (
    SessionStatus.QUEUED,
    SessionStatus.NORMALIZING,
    SessionStatus.STITCHING,
    SessionStatus.UPLOADING_TO_YOUTUBE,
    SessionStatus.YOUTUBE_PROCESSING,
)


class AdminUserRead(BaseModel):
    id: str
    username: str
    display_name: str
    is_admin: bool
    disabled_at: datetime | None
    # An admin reset the password and the person has not chosen a new one yet.
    must_change_password: bool
    created_at: datetime
    last_active_at: datetime | None
    presence: FriendPresence
    signed_in_devices: int
    workouts: int
    photos: int
    photo_bytes: int
    video_sessions: int


class AdminUserUpdate(BaseModel):
    disabled: bool


class TemporaryPasswordRead(BaseModel):
    temporary_password: str


class ServerSettingsRead(BaseModel):
    video_uploads: VideoUploads
    allow_registration: bool
    invite_code_required: bool


class ServerSettingsUpdate(BaseModel):
    video_uploads: VideoUploads | None = None
    allow_registration: bool | None = None


class DiskUsageRead(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int


class ClientVersionUsageRead(BaseModel):
    # None: sessions that have not been used since releases started sending their version.
    version: str | None
    users: int
    sessions: int
    last_seen_at: datetime


class ServerStatusRead(BaseModel):
    disk: DiskUsageRead
    database_bytes: int
    photos: int
    photo_bytes: int
    video_file_bytes: int
    video_queue: dict[str, int]
    client_versions: list[ClientVersionUsageRead]
    minimum_write_version: str | None


admin_router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(no_store), Depends(require_admin)],
)


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _tree_size(roots: Iterable[Path]) -> int:
    """Total bytes of the files under the given folders, ignoring missing ones."""
    return sum(
        _file_size(path)
        for root in roots
        if root.is_dir()
        for path in root.rglob("*")
        if path.is_file()
    )


def _counts_by_user(db: Session, model, *conditions) -> dict[str, int]:
    rows = db.execute(
        select(model.user_id, func.count())
        .select_from(model)
        .where(*conditions)
        .group_by(model.user_id)
    )
    return {user_id: count for user_id, count in rows if user_id is not None}


def _photo_bytes_by_user(db: Session, settings: Settings) -> dict[str, int]:
    totals: dict[str, int] = {}
    rows = db.execute(
        select(MachinePhoto.user_id, MachinePhoto.full_filename, MachinePhoto.thumbnail_filename)
    )
    for user_id, full_filename, thumbnail_filename in rows:
        if user_id is None:
            continue
        size = sum(
            _file_size(path)
            for path in machine_photo_paths(settings, full_filename, thumbnail_filename)
        )
        totals[user_id] = totals.get(user_id, 0) + size
    return totals


def _admin_user_reads(
    db: Session, settings: Settings, users: Iterable[User]
) -> list[AdminUserRead]:
    users = list(users)
    activity = admin_presence_by_member(db, users)
    devices = _counts_by_user(db, UserSession, UserSession.expires_at > utc_now())
    workouts = _counts_by_user(db, TrainingWorkout)
    photos = _counts_by_user(db, MachinePhoto)
    video_sessions = _counts_by_user(db, WorkoutSession)
    photo_bytes = _photo_bytes_by_user(db, settings)
    return [
        AdminUserRead(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            is_admin=user.is_admin,
            disabled_at=as_utc(user.disabled_at) if user.disabled_at else None,
            must_change_password=user.must_change_password,
            created_at=as_utc(user.created_at),
            last_active_at=as_utc(user.last_active_at) if user.last_active_at else None,
            presence=activity[user.id],
            signed_in_devices=devices.get(user.id, 0),
            workouts=workouts.get(user.id, 0),
            photos=photos.get(user.id, 0),
            photo_bytes=photo_bytes.get(user.id, 0),
            video_sessions=video_sessions.get(user.id, 0),
        )
        for user in users
    ]


def generate_temporary_password() -> str:
    return "-".join(
        "".join(
            secrets.choice(TEMPORARY_PASSWORD_ALPHABET)
            for _ in range(TEMPORARY_PASSWORD_GROUP_LENGTH)
        )
        for _ in range(TEMPORARY_PASSWORD_GROUPS)
    )


def _client_version_usage(db: Session) -> list[ClientVersionUsageRead]:
    now = utc_now()
    rows = db.execute(
        select(
            UserSession.client_version,
            func.count(func.distinct(UserSession.user_id)),
            func.count(UserSession.id),
            func.max(UserSession.last_seen_at),
        )
        .where(
            UserSession.expires_at > now,
            UserSession.last_seen_at >= now - CLIENT_VERSION_WINDOW,
        )
        .group_by(UserSession.client_version)
    ).all()
    usage = [
        ClientVersionUsageRead(
            version=version, users=users, sessions=sessions, last_seen_at=as_utc(last_seen)
        )
        for version, users, sessions, last_seen in rows
    ]
    # Newest release first; sessions without a version are the oldest.
    return sorted(
        usage,
        key=lambda item: client_versions.parse_version(item.version) or (-1, -1, -1),
        reverse=True,
    )


def _settings_read(db: Session, settings: Settings) -> ServerSettingsRead:
    runtime = load_runtime_settings(db, settings)
    return ServerSettingsRead(
        video_uploads=runtime.video_uploads,
        allow_registration=runtime.allow_registration,
        invite_code_required=settings.registration_invite_code is not None,
    )


@admin_router.get("/users", response_model=list[AdminUserRead])
def list_users(db: DbDependency, settings: AppSettings) -> list[AdminUserRead]:
    users = db.scalars(select(User).order_by(User.created_at, User.username))
    return _admin_user_reads(db, settings, list(users))


@admin_router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    request: Request,
    admin: AdminUser,
    db: DbDependency,
    settings: AppSettings,
) -> AdminUserRead:
    user = db.get(User, user_id)
    if user is None:
        raise api_error(404, "user_not_found", "That account was not found.")
    if payload.disabled and user.id == admin.id:
        raise api_error(409, "cannot_disable_self", "You cannot disable your own account.")
    endpoints: list[str] = []
    if payload.disabled and user.disabled_at is None:
        user.disabled_at = utc_now()
        # Sign the account out everywhere and stop any alerts it has scheduled.
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        endpoints = list(
            db.scalars(select(PushSubscription.endpoint).where(PushSubscription.user_id == user.id))
        )
    elif not payload.disabled:
        user.disabled_at = None
    db.commit()
    for endpoint in endpoints:
        request.app.state.rest_timer_notifications.cancel_endpoint(endpoint)
        request.app.state.workout_reminders.cancel(endpoint=endpoint, user_id=user.id)
    session_events.changed(user.id)
    db.refresh(user)
    return _admin_user_reads(db, settings, [user])[0]


@admin_router.post("/users/{user_id}/reset-password", response_model=TemporaryPasswordRead)
def reset_user_password(
    user_id: str,
    admin: AdminUser,
    db: DbDependency,
    throttle: Throttle,
) -> TemporaryPasswordRead:
    """Replace a forgotten password with a temporary one, shown to the admin once."""
    user = db.get(User, user_id)
    if user is None:
        raise api_error(404, "user_not_found", "That account was not found.")
    if user.id == admin.id:
        raise api_error(
            409,
            "cannot_reset_self",
            "Change your own password from Account settings instead.",
        )
    temporary_password = generate_temporary_password()
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    # Signed out everywhere, so nobody holding the old password stays in.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    # Failed sign-ins before the reset must not lock the person out of the new password.
    throttle.reset(f"username:{user.username}", f"user:{user.id}")
    session_events.changed(user.id)
    return TemporaryPasswordRead(temporary_password=temporary_password)


@admin_router.get("/settings", response_model=ServerSettingsRead)
def get_server_settings(db: DbDependency, settings: AppSettings) -> ServerSettingsRead:
    return _settings_read(db, settings)


@admin_router.patch("/settings", response_model=ServerSettingsRead)
def update_server_settings(
    payload: ServerSettingsUpdate, db: DbDependency, settings: AppSettings
) -> ServerSettingsRead:
    if payload.video_uploads is not None:
        save_runtime_setting(db, VIDEO_UPLOADS_KEY, payload.video_uploads)
    if payload.allow_registration is not None:
        save_runtime_setting(
            db, ALLOW_REGISTRATION_KEY, "true" if payload.allow_registration else "false"
        )
    db.commit()
    return _settings_read(db, settings)


@admin_router.get("/limits", response_model=AccountLimitsRead)
def get_account_limits(db: DbDependency, settings: AppSettings) -> AccountLimitsRead:
    return account_limits_read(db, settings)


@admin_router.put("/limits", response_model=AccountLimitsRead)
def update_account_limits(
    payload: AccountLimits, db: DbDependency, settings: AppSettings
) -> AccountLimitsRead:
    save_account_limits(db, payload)
    db.commit()
    return account_limits_read(db, settings)


@admin_router.get("/status", response_model=ServerStatusRead)
def server_status(db: DbDependency, settings: AppSettings) -> ServerStatusRead:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    disk = shutil.disk_usage(settings.data_dir)
    video_file_bytes = _tree_size(
        [settings.uploads_dir, settings.normalized_dir, settings.output_dir]
    )
    queue_rows = db.execute(
        select(WorkoutSession.status, func.count(WorkoutSession.id))
        .where(WorkoutSession.status.in_(VIDEO_QUEUE_STATUSES))
        .group_by(WorkoutSession.status)
    )
    queued = {status: count for status, count in queue_rows}
    return ServerStatusRead(
        disk=DiskUsageRead(total_bytes=disk.total, used_bytes=disk.used, free_bytes=disk.free),
        database_bytes=_file_size(settings.database_path),
        photos=db.scalar(select(func.count(MachinePhoto.id))) or 0,
        photo_bytes=_tree_size([settings.machine_photos_dir]),
        video_file_bytes=video_file_bytes,
        video_queue={status.value: queued.get(status, 0) for status in VIDEO_QUEUE_STATUSES},
        client_versions=_client_version_usage(db),
        minimum_write_version=client_versions.MIN_WRITE_CLIENT_VERSION,
    )
