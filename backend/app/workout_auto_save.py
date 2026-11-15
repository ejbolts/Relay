"""Opt-in: save a workout left running once its owner's auto-save time has passed.

The logging app prepares the finished workout with each live draft revision (see
``active_workouts``), so this saves exactly what its Save button would have saved at the
inactivity cutoff, through the same save path. A workout the app could not prepare, or one the
save refuses (for example, edited elsewhere), keeps waiting for the owner's Save, Resume or
Discard, as it does with auto-save off.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .active_workouts import AUTO_SAVE_SETTING, auto_save_minutes
from .auth import as_utc
from .config import Settings
from .models import ActiveWorkoutSync, LiveWorkout, TrainingWorkout, User, UserSetting
from .presence import hub
from .tracker import insert_workout, load_workout, replace_workout
from .tracker_schemas import TrainingWorkoutCreate

logger = logging.getLogger(__name__)

# Matches the app: a workout is never cut off within 30 minutes of its last activity.
RECENT_ACTIVITY = timedelta(minutes=30)


@dataclass(frozen=True)
class AutoSavedWorkout:
    user_id: str
    name: str


def auto_save_due_at(row: ActiveWorkoutSync, minutes: int) -> datetime:
    """The later of the owner's chosen time, the app's own cutoff and the activity grace."""
    draft = row.draft or {}
    started = datetime.fromtimestamp(draft["startedAt"] / 1000, UTC)
    due = started + timedelta(minutes=minutes)
    if draft.get("inactiveFinishAt"):
        due = max(due, datetime.fromtimestamp(draft["inactiveFinishAt"] / 1000, UTC))
    if row.last_activity_at is not None:
        due = max(due, as_utc(row.last_activity_at) + RECENT_ACTIVITY)
    return due


def _save(db: Session, settings: Settings, row: ActiveWorkoutSync) -> AutoSavedWorkout:
    user = db.get(User, row.user_id)
    if user is None or row.draft is None or row.auto_save is None:
        raise ValueError("Nothing to save.")
    payload = TrainingWorkoutCreate.model_validate(
        {
            **row.auto_save,
            "active_workout_revision": row.revision,
            "active_workout_session_id": row.session_id,
        }
    )
    resuming = row.draft.get("resumingWorkoutId")
    if resuming:
        workout = load_workout(db, user.id, resuming)
        replace_workout(db, user, settings, workout, payload, row.auto_save_client_version)
    else:
        session = str(payload.client_session_id) if payload.client_session_id else None
        if session is None or session != row.session_id:
            raise ValueError("The prepared workout belongs to another session.")
        if db.scalar(
            select(TrainingWorkout.id).where(
                TrainingWorkout.user_id == user.id,
                TrainingWorkout.client_session_id == session,
            )
        ):
            raise ValueError("This workout session was already saved.")
        insert_workout(db, user, settings, payload)
    # Friends stop seeing the workout in progress straight away.
    live = db.get(LiveWorkout, user.id)
    if live is not None:
        db.delete(live)
        db.commit()
        hub.notify(user.id)
    return AutoSavedWorkout(user_id=user.id, name=payload.name)


def _forget(db: Session, user_id: str, revision: int) -> None:
    """Stop retrying a refused save; the owner decides, and later edits prepare a new one."""
    db.execute(
        update(ActiveWorkoutSync)
        .where(ActiveWorkoutSync.user_id == user_id, ActiveWorkoutSync.revision == revision)
        .values(auto_save=None, auto_save_client_version=None)
    )
    db.commit()


def save_due_workouts(
    session_factory: Callable[[], Session], settings: Settings, now: datetime | None = None
) -> list[AutoSavedWorkout]:
    now = now or datetime.now(UTC)
    saved: list[AutoSavedWorkout] = []
    with session_factory() as db:
        candidates = [
            (row.user_id, row.revision)
            for row in db.scalars(
                select(ActiveWorkoutSync)
                .join(User, User.id == ActiveWorkoutSync.user_id)
                .join(
                    UserSetting,
                    (UserSetting.user_id == ActiveWorkoutSync.user_id)
                    & (UserSetting.key == AUTO_SAVE_SETTING),
                )
                .where(
                    ActiveWorkoutSync.draft.is_not(None),
                    ActiveWorkoutSync.auto_save.is_not(None),
                    User.disabled_at.is_(None),
                )
            )
        ]
    for user_id, revision in candidates:
        with session_factory() as db:
            row = db.get(ActiveWorkoutSync, user_id)
            minutes = auto_save_minutes(db, user_id)
            if (
                row is None
                or row.revision != revision
                or row.draft is None
                or row.auto_save is None
                or minutes is None
                or now < auto_save_due_at(row, minutes)
            ):
                continue
            try:
                saved.append(_save(db, settings, row))
            except (HTTPException, ValueError) as error:
                db.rollback()
                logger.info("Auto-save left a workout for its owner: %s", error)
                _forget(db, user_id, revision)
            except Exception:
                db.rollback()
                logger.exception("Could not auto-save a workout")
                _forget(db, user_id, revision)
    return saved
