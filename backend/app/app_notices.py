"""Which one-off notices an account has seen, so each of its devices does not repeat them."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .auth import CurrentUser
from .client_versions import ClientVersion, parse_version
from .database import get_db
from .training_metrics import get_setting, set_setting

NOTICES_KEY = "app_notices"
# A reviewed week starts on or before the device's own today. Two days covers every time
# zone, and refuses a device whose clock is set well ahead: values only move forward, so a
# date far in the future would hide the weekly review on every device until then.
CLOCK_TOLERANCE = timedelta(days=2)
_VERSION = re.compile(r"^\d{1,4}\.\d{1,4}\.\d{1,4}$")


class AppNotices(BaseModel):
    # The newest release whose "What's new" has been dismissed on any device.
    release_seen: str | None = Field(default=None, max_length=14)
    # The first day of the latest week whose review has been shown on any device.
    weekly_review_seen: date | None = None

    @field_validator("release_seen")
    @classmethod
    def release_is_a_version(cls, value: str | None) -> str | None:
        if value is not None and not _VERSION.match(value):
            raise ValueError("Use a release version such as 1.3.0.")
        return value


def _version_key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("."))


def merge_notices(stored: AppNotices, update: AppNotices) -> AppNotices:
    """Notices only move forward, so a device on an older release cannot bring one back."""
    releases = [value for value in (stored.release_seen, update.release_seen) if value]
    weeks = [value for value in (stored.weekly_review_seen, update.weekly_review_seen) if value]
    return AppNotices(
        release_seen=max(releases, key=_version_key) if releases else None,
        weekly_review_seen=max(weeks) if weeks else None,
    )


router = APIRouter(prefix="/api/app-notices", tags=["app notices"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=AppNotices)
def get_app_notices(db: DbSession, user: CurrentUser) -> AppNotices:
    try:
        return AppNotices.model_validate_json(get_setting(db, user.id, NOTICES_KEY, "{}"))
    except ValidationError:
        return AppNotices()


@router.put("", response_model=AppNotices, dependencies=[Depends(limit_save_rate)])
def save_app_notices(
    payload: AppNotices,
    db: DbSession,
    user: CurrentUser,
    client_version: ClientVersion = None,
) -> AppNotices:
    week = payload.weekly_review_seen
    if week is not None and week > date.today() + CLOCK_TOLERANCE:
        raise HTTPException(422, "That week has not started yet.")
    # An app cannot have shown the notes of a release newer than itself.
    running = parse_version(client_version)
    if payload.release_seen and running and _version_key(payload.release_seen) > running:
        raise HTTPException(422, "That release is newer than this app.")
    # Take the write lock before reading, so two devices recording at once are merged one
    # after the other instead of the second overwriting what the first just saved.
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    merged = merge_notices(get_app_notices(db, user), payload)
    set_setting(db, user.id, NOTICES_KEY, merged.model_dump_json())
    db.commit()
    return merged
