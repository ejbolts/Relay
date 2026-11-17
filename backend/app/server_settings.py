"""Deployment-wide switches that an admin can change while the server is running.

``.env`` supplies the starting value of each switch. Once an admin saves a choice in the admin
console it is stored in the ``server_settings`` table and takes precedence, so the change applies
immediately and survives restarts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, get_args

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import ServerSetting

VideoUploads = Literal["off", "admin", "everyone"]
VIDEO_UPLOAD_MODES: tuple[str, ...] = get_args(VideoUploads)
VIDEO_UPLOADS_KEY = "video_uploads"
ALLOW_REGISTRATION_KEY = "allow_registration"


@dataclass(frozen=True)
class RuntimeSettings:
    video_uploads: VideoUploads
    allow_registration: bool


def load_runtime_settings(db: Session, settings: Settings) -> RuntimeSettings:
    rows = db.execute(select(ServerSetting.key, ServerSetting.value))
    stored = {key: value for key, value in rows}
    video_uploads = stored.get(VIDEO_UPLOADS_KEY)
    if video_uploads not in VIDEO_UPLOAD_MODES:
        video_uploads = settings.video_uploads
    allow_registration = stored.get(ALLOW_REGISTRATION_KEY)
    return RuntimeSettings(
        video_uploads=video_uploads,
        allow_registration=(
            settings.allow_registration
            if allow_registration is None
            else allow_registration == "true"
        ),
    )


def save_runtime_setting(db: Session, key: str, value: str) -> None:
    """Store one switch (no commit; runs in the caller's transaction)."""
    row = db.get(ServerSetting, key)
    if row is None:
        db.add(ServerSetting(key=key, value=value))
    else:
        row.value = value
