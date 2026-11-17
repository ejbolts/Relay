"""Which one-off notices an account has seen, so each of its devices does not repeat them."""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .auth import CurrentUser
from .database import get_db
from .training_metrics import get_setting, set_setting

NOTICES_KEY = "app_notices"
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
def save_app_notices(payload: AppNotices, db: DbSession, user: CurrentUser) -> AppNotices:
    merged = merge_notices(get_app_notices(db, user), payload)
    set_setting(db, user.id, NOTICES_KEY, merged.model_dump_json())
    db.commit()
    return merged
