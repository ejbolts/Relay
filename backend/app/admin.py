"""Admin console API: account oversight, runtime switches, and server health."""

from __future__ import annotations

import shutil
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .account_limits import (
    AccountLimits,
    AccountLimitsRead,
    account_limits_read,
    save_account_limits,
)
from .accounts import no_store
from .auth import AdminUser, AppSettings, as_utc, require_admin, utc_now
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
from .server_settings import (
    ALLOW_REGISTRATION_KEY,
    VIDEO_UPLOADS_KEY,
    VideoUploads,
    load_runtime_settings,
    save_runtime_setting,
)
from .session_events import session_events

DbDependency = Annotated[Session, Depends(get_db)]

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
    created_at: datetime
    last_active_at: datetime | None
    signed_in_devices: int
    workouts: int
    photos: int
    photo_bytes: int
    video_sessions: int


class AdminUserUpdate(BaseModel):
    disabled: bool


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


class ServerStatusRead(BaseModel):
    disk: DiskUsageRead
    database_bytes: int
    photos: int
    photo_bytes: int
    video_file_bytes: int
    video_queue: dict[str, int]


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
            created_at=as_utc(user.created_at),
            last_active_at=as_utc(user.last_active_at) if user.last_active_at else None,
            signed_in_devices=devices.get(user.id, 0),
            workouts=workouts.get(user.id, 0),
            photos=photos.get(user.id, 0),
            photo_bytes=photo_bytes.get(user.id, 0),
            video_sessions=video_sessions.get(user.id, 0),
        )
        for user in users
    ]


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
    )
