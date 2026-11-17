"""Hidden limits that stop one account from bloating the server.

Real training stays far below every limit (a six-year log peaks at 55 sets and 9 exercises in one
workout), so only scripted or abusive use reaches them. Users are never told a limit exists: a
refused request gets the same plain message as any failed save, and the server log records which
limit was hit. The one exception is the photo upload size, which people are told so they can pick
a smaller photo (the app also shrinks photos before uploading). Admins adjust the limits in the
admin console; values are stored in ``server_settings`` and apply immediately. Per-account totals
and the save rate do not apply to admins.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Annotated

from annotated_types import Ge, Le
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .config import Settings, get_settings
from .database import get_db
from .errors import api_error
from .models import ServerSetting, TrainingWorkout, User
from .server_settings import save_runtime_setting

logger = logging.getLogger(__name__)

MEGABYTE = 1024 * 1024
LIMIT_KEY_PREFIX = "limit."
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# The messages users see. They read like any failed save and never mention a limit.
WORKOUT_NOT_SAVED = "This workout couldn't be saved."
EXERCISE_NOT_CREATED = "This exercise couldn't be created."
PHOTO_NOT_UPLOADED = "This photo couldn't be uploaded."
CARDIO_NOT_SAVED = "This cardio session couldn't be saved."
IMPORT_NOT_SAVED = "This file couldn't be imported."
TRY_AGAIN_SOON = "Couldn't save right now. Try again in a moment."


class AccountLimits(BaseModel):
    """Every limit an admin can adjust. The upper bounds are the request schema's own ceilings."""

    workouts_per_account: int = Field(default=5_000, ge=1, le=1_000_000)
    cardio_sessions_per_account: int = Field(default=5_000, ge=1, le=1_000_000)
    custom_exercises_per_account: int = Field(default=100, ge=1, le=100_000)
    photos_per_account: int = Field(default=25, ge=1, le=100_000)
    workout_photos_per_account: int = Field(default=500, ge=1, le=100_000)
    saves_per_minute: int = Field(default=60, ge=1, le=10_000)
    exercises_per_workout: int = Field(default=20, ge=1, le=100)
    sets_per_workout: int = Field(default=100, ge=1, le=10_000)
    workout_note_characters: int = Field(default=2_000, ge=1, le=10_000)
    exercise_note_characters: int = Field(default=1_000, ge=1, le=2_000)
    set_note_characters: int = Field(default=500, ge=1, le=2_000)
    photo_upload_megabytes: int = Field(default=5, ge=1, le=50)


class LimitBounds(BaseModel):
    minimum: int
    maximum: int


class AccountLimitsRead(BaseModel):
    values: AccountLimits
    defaults: AccountLimits
    bounds: dict[str, LimitBounds]


def default_account_limits(settings: Settings) -> AccountLimits:
    """``.env`` supplies the starting photo size; the rest are built in."""
    return AccountLimits(
        photo_upload_megabytes=min(50, max(1, settings.max_photo_size_bytes // MEGABYTE))
    )


def limit_bounds() -> dict[str, LimitBounds]:
    bounds = {}
    for name, field in AccountLimits.model_fields.items():
        minimum = next(item.ge for item in field.metadata if isinstance(item, Ge))
        maximum = next(item.le for item in field.metadata if isinstance(item, Le))
        bounds[name] = LimitBounds(minimum=minimum, maximum=maximum)
    return bounds


def load_account_limits(db: Session, settings: Settings) -> AccountLimits:
    limits = default_account_limits(settings)
    rows = db.execute(
        select(ServerSetting.key, ServerSetting.value).where(
            ServerSetting.key.startswith(LIMIT_KEY_PREFIX)
        )
    )
    for key, raw in rows:
        name = key.removeprefix(LIMIT_KEY_PREFIX)
        if name not in AccountLimits.model_fields:
            continue
        try:
            # A stored value that is somehow out of range falls back to the default.
            limits = AccountLimits.model_validate({**limits.model_dump(), name: int(raw)})
        except (ValueError, ValidationError):
            continue
    return limits


def save_account_limits(db: Session, limits: AccountLimits) -> None:
    """Store every limit (no commit; runs in the caller's transaction)."""
    for name, value in limits.model_dump().items():
        save_runtime_setting(db, f"{LIMIT_KEY_PREFIX}{name}", str(value))


def account_limits_read(db: Session, settings: Settings) -> AccountLimitsRead:
    return AccountLimitsRead(
        values=load_account_limits(db, settings),
        defaults=default_account_limits(settings),
        bounds=limit_bounds(),
    )


def refuse(user: User, limit: str, message: str, status_code: int = 422) -> HTTPException:
    logger.warning("Refused a change for %s: the %s limit was reached.", user.username, limit)
    return api_error(status_code, "not_saved", message)


def check_account_total(
    db: Session, user: User, model, limit: int, name: str, message: str, *conditions
) -> None:
    """Refuse adding one more row once an account holds ``limit`` of them. Admins are exempt."""
    if user.is_admin:
        return
    count = db.scalar(
        select(func.count()).select_from(model).where(model.user_id == user.id, *conditions)
    )
    if (count or 0) >= limit:
        raise refuse(user, name, message)


def _longest(values) -> int:
    return max((len(value) for value in values if value), default=0)


def check_workout_size(
    payload, limits: AccountLimits, user: User, existing: TrainingWorkout | None = None
) -> None:
    """Refuse an oversized workout. A saved workout may stay as large as it already is, so
    lowering a limit never stops someone editing what they logged before."""
    allowed_exercises = limits.exercises_per_workout
    allowed_sets = limits.sets_per_workout
    allowed_workout_note = limits.workout_note_characters
    allowed_exercise_note = limits.exercise_note_characters
    allowed_set_note = limits.set_note_characters
    if existing is not None:
        movements = existing.movements
        allowed_exercises = max(allowed_exercises, len(movements))
        allowed_sets = max(allowed_sets, sum(len(movement.sets) for movement in movements))
        allowed_workout_note = max(allowed_workout_note, _longest([existing.notes]))
        allowed_exercise_note = max(
            allowed_exercise_note, _longest(movement.notes for movement in movements)
        )
        allowed_set_note = max(
            allowed_set_note,
            _longest(item.notes for movement in movements for item in movement.sets),
        )

    checks = (
        ("exercises_per_workout", len(payload.movements), allowed_exercises),
        (
            "sets_per_workout",
            sum(len(movement.sets) for movement in payload.movements),
            allowed_sets,
        ),
        ("workout_note_characters", _longest([payload.notes]), allowed_workout_note),
        (
            "exercise_note_characters",
            _longest(movement.notes for movement in payload.movements),
            allowed_exercise_note,
        ),
        (
            "set_note_characters",
            _longest(item.notes for movement in payload.movements for item in movement.sets),
            allowed_set_note,
        ),
    )
    for name, value, allowed in checks:
        if value > allowed:
            raise refuse(user, name, WORKOUT_NOT_SAVED)


class SaveRateLimiter:
    """Counts each account's changes over the last minute, in memory for this server process."""

    WINDOW_SECONDS = 60.0

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, user_id: str, per_minute: int, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            events = self._events.setdefault(user_id, deque())
            while events and now - events[0] >= self.WINDOW_SECONDS:
                events.popleft()
            if len(events) >= per_minute:
                return False
            events.append(now)
            return True


def limit_save_rate(
    request: Request,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Router dependency: refuse an account's changes beyond the per-minute rate."""
    if request.method in SAFE_METHODS or user.is_admin:
        return
    per_minute = load_account_limits(db, settings).saves_per_minute
    if not request.app.state.save_rate_limiter.allow(user.id, per_minute):
        raise refuse(user, "saves_per_minute", TRY_AGAIN_SOON, status_code=429)
