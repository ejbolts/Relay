"""Account-private live drafts. Merge independent edits, refuse ambiguous overwrites.

The shared revision also guards finishing and discarding. A tombstone prevents an offline
device from bringing back a workout another device has already ended.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import as_utc
from .errors import api_error
from .models import ActiveWorkoutSync, TrainingWorkout, utc_now
from .presence import hub
from .tracker_schemas import TrainingWorkoutCreate, WorkoutSetCreate


class DraftSet(WorkoutSetCreate):
    key: str = Field(min_length=1, max_length=100)
    fromPrevious: bool | None = None
    restRevealed: bool | None = None
    restConfirmed: bool | None = None


class DraftMovement(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    exerciseId: str = Field(min_length=1, max_length=100)
    notes: str = Field(max_length=2_000)
    machinePhotoIds: list[Annotated[str, Field(max_length=100)]] = Field(max_length=20)
    machineSettings: list[dict[str, str]] | None = Field(default=None, max_length=20)
    supersetKey: str | None = Field(max_length=100)
    isComplete: bool | None = None
    swappedFrom: str | None = Field(default=None, max_length=200)
    sets: list[DraftSet] = Field(max_length=100)

    @model_validator(mode="after")
    def unique_sets(self) -> DraftMovement:
        if len({item.key for item in self.sets}) != len(self.sets):
            raise ValueError("Set keys must be unique.")
        return self


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    version: Literal[1]
    clientSessionId: UUID
    startedAt: float = Field(gt=0, le=253402214400000)
    updatedAt: float = Field(gt=0, le=253402214400000)
    lastActiveAt: float | None = Field(default=None, gt=0, le=253402214400000)
    inactiveFinishAt: float | None = Field(default=None, gt=0, le=253402214400000)
    resumingWorkoutId: str | None = Field(default=None, max_length=36)
    previousDurationMinutes: int | None = Field(default=None, ge=0, le=1440)
    durationOverrideMinutes: int | None = Field(default=None, ge=1, le=1440)
    pausedMs: float | None = Field(default=None, ge=0, le=253402214400000)
    pausedAt: float | None = Field(default=None, gt=0, le=253402214400000)
    name: str = Field(max_length=200)
    workoutDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Literal["upper", "lower", "push", "pull", "full_body", "cardio", "other"]
    workoutTypeId: str | None = Field(default=None, max_length=100)
    workoutTypeExplicit: bool | None = None
    skipHighRepWarning: bool | None = None
    notes: str = Field(max_length=10_000)
    movements: list[DraftMovement] = Field(max_length=100)

    @model_validator(mode="after")
    def unique_movements(self) -> Draft:
        if len({item.key for item in self.movements}) != len(self.movements):
            raise ValueError("Movement keys must be unique.")
        if self.lastActiveAt is not None and self.lastActiveAt < self.startedAt:
            raise ValueError("Activity cannot precede the workout.")
        return self


class DraftChange(BaseModel):
    revision: int = Field(ge=0)
    base: dict[str, Any] | None
    draft: dict[str, Any] | None
    replace: bool = False

    @model_validator(mode="after")
    def validate_drafts(self) -> DraftChange:
        # Validate without normalising: partially entered fields and whitespace are draft data.
        for value in (self.base, self.draft):
            if value is not None:
                if len(json.dumps(value)) > 512_000:
                    raise ValueError("Workout draft is too large.")
                Draft.model_validate(value)
        return self


MISSING = object()


class MergeConflict(Exception):
    pass


def merge(base: Any, local: Any, remote: Any, path: str = "") -> Any:
    """Three-way merge, keyed by stable movement/set ids rather than list positions."""
    if local == remote or remote == base:
        return local
    if local == base:
        return remote
    if all(isinstance(value, dict) for value in (base, local, remote)):
        result = {}
        for key in base.keys() | local.keys() | remote.keys():
            values = [value.get(key, MISSING) for value in (base, local, remote)]
            if path == "" and key in {"updatedAt", "lastActiveAt", "inactiveFinishAt"}:
                merged = max(
                    (value for value in values if isinstance(value, (int, float))), default=MISSING
                )
            else:
                merged = merge(*values, path=f"{path}/{key}")
            if merged is not MISSING:
                result[key] = merged
        return result
    if path in {"/movements"} or path.endswith("/sets"):
        if not all(isinstance(value, list) for value in (base, local, remote)):
            raise MergeConflict(path)
        maps = [{item["key"]: item for item in value} for value in (base, local, remote)]
        keys = maps[0].keys() | maps[1].keys() | maps[2].keys()
        items = {
            key: merge(*(value.get(key, MISSING) for value in maps), path=f"{path}/{key}")
            for key in keys
        }
        common = set.intersection(*(set(value) for value in maps))
        orders = [
            [item["key"] for item in value if item["key"] in common]
            for value in (base, local, remote)
        ]
        if orders[1] != orders[0] and orders[2] != orders[0] and orders[1] != orders[2]:
            raise MergeConflict(path)
        primary, secondary = (local, remote) if orders[1] != orders[0] else (remote, local)
        order = [item["key"] for item in primary]
        # Insert additions next to their preceding set/movement, preserving both devices' work.
        for index, item in enumerate(secondary):
            key = item["key"]
            if key not in order:
                previous = next(
                    (
                        earlier["key"]
                        for earlier in reversed(secondary[:index])
                        if earlier["key"] in order
                    ),
                    None,
                )
                order.insert(order.index(previous) + 1 if previous else 0, key)
        return [items[key] for key in order if items[key] is not MISSING]
    raise MergeConflict(path)


def snapshot(row: ActiveWorkoutSync | None) -> dict:
    return {"revision": row.revision if row else 0, "draft": row.draft if row else None}


def change_draft(db: Session, user_id: str, change: DraftChange, attempts: int = 3) -> dict:
    row = db.get(ActiveWorkoutSync, user_id)
    current = snapshot(row)
    remote = current["draft"]
    if change.draft == remote:
        return {**current, "conflict": False}
    if change.replace and change.revision == current["revision"] and change.base == remote:
        if (
            change.draft
            and row
            and row.draft is None
            and change.draft["clientSessionId"] == row.session_id
        ):
            return {**current, "conflict": True}
        merged = change.draft
    elif change.base is None:
        # A fresh device must read first; a stale empty slot may not replace another session.
        if remote is not None or change.revision != current["revision"]:
            return {**current, "conflict": True}
        if change.draft and row and change.draft["clientSessionId"] == row.session_id:
            return {**current, "conflict": True}
        merged = change.draft
    else:
        if remote is None or remote["clientSessionId"] != change.base["clientSessionId"]:
            return {**current, "conflict": True}
        if change.draft is None:
            if change.revision != current["revision"]:
                return {**current, "conflict": True}
            merged = None
        else:
            if change.draft["clientSessionId"] != remote["clientSessionId"]:
                return {**current, "conflict": True}
            try:
                merged = merge(change.base, change.draft, remote)
            except MergeConflict:
                return {**current, "conflict": True}
    if merged is not None:
        # Also validate the combined result (limits apply across concurrent additions).
        try:
            Draft.model_validate(merged)
        except ValidationError as error:
            raise api_error(
                422, "draft_limit", "The combined workout exceeds the live draft limits."
            ) from error
        session_id = merged["clientSessionId"]
        if (
            db.query(TrainingWorkout.id)
            .filter_by(user_id=user_id, client_session_id=session_id)
            .first()
        ):
            return {**current, "conflict": True}
        activity = min(
            datetime.fromtimestamp(merged.get("lastActiveAt", merged["startedAt"]) / 1000, UTC),
            utc_now(),
        )
    else:
        session_id = row.session_id if row else None
        activity = None
    values = {
        "revision": current["revision"] + 1,
        "draft": merged,
        "session_id": session_id,
        "started_at": str(int(merged["startedAt"]))
        if merged
        else (row.started_at if row else None),
        "last_activity_at": activity,
        "reminder_delivered": bool(
            row
            and row.reminder_delivered
            and activity
            and row.last_activity_at
            and activity <= as_utc(row.last_activity_at)
        ),
    }
    if row is None:
        db.add(ActiveWorkoutSync(user_id=user_id, **values))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return {**snapshot(db.get(ActiveWorkoutSync, user_id)), "conflict": True}
    else:
        changed = db.execute(
            update(ActiveWorkoutSync)
            .where(
                ActiveWorkoutSync.user_id == user_id,
                ActiveWorkoutSync.revision == current["revision"],
            )
            .values(**values)
        )
        if changed.rowcount != 1:
            db.rollback()
            db.expire_all()
            if attempts > 1:
                return change_draft(db, user_id, change, attempts - 1)
            return {**snapshot(db.get(ActiveWorkoutSync, user_id)), "conflict": True}
        db.commit()
    hub.active_workout_changed(user_id)
    return {"revision": values["revision"], "draft": merged, "conflict": False}


def finish_shared_draft(
    db: Session, user_id: str, session_id: str | None, revision: int | None
) -> None:
    """Consume the shared revision in the same transaction as the final workout save."""
    if revision is None:
        return  # Deployed clients retain their existing save contract.
    changed = db.execute(
        update(ActiveWorkoutSync)
        .where(
            ActiveWorkoutSync.user_id == user_id,
            ActiveWorkoutSync.session_id == session_id,
            ActiveWorkoutSync.revision == revision,
            ActiveWorkoutSync.draft.is_not(None),
        )
        .values(draft=None, revision=revision + 1, last_activity_at=None)
    )
    if changed.rowcount != 1:
        raise api_error(
            409,
            "active_workout_changed",
            "This workout changed on another device. "
            "Resume it and review the latest sets before saving.",
        )


def check_repeated_finish(workout: TrainingWorkout, payload: TrainingWorkoutCreate) -> None:
    """A lost response can retry; a divergent offline completion must stay on its device."""
    if payload.active_workout_revision is None:
        return

    def comparable(value: dict) -> dict:
        value = {
            key: item
            for key, item in value.items()
            if key
            not in {
                "client_session_id",
                "active_workout_revision",
                "active_workout_session_id",
            }
        }
        groups = {}
        for movement in value["movements"]:
            group = movement.get("superset_key")
            if group is not None:
                groups.setdefault(group, len(groups))
            movement["superset_key"] = groups.get(group)
            movement["machine_photo_ids"] = sorted(movement.get("machine_photo_ids", []))
            movement.setdefault("machine_settings", [])
        return value

    # Reconstruct the accepted request from stored performance, leaving out response-only ids.
    stored = TrainingWorkoutCreate(
        name=workout.name,
        workout_date=workout.workout_date,
        category=workout.category,
        workout_type_id=workout.workout_type_id,
        notes=workout.notes,
        duration_minutes=workout.duration_minutes,
        start_time=workout.start_time,
        end_time=workout.end_time,
        movements=[
            {
                "exercise_id": movement.exercise_id,
                "notes": movement.notes,
                "machine_photo_ids": [photo.id for photo in movement.machine_photos],
                "machine_settings": movement.machine_settings or [],
                "superset_key": movement.superset_group_id,
                "sets": [
                    WorkoutSetCreate.model_validate(item, from_attributes=True)
                    for item in movement.sets
                ],
            }
            for movement in workout.movements
        ],
    )
    expected = payload.model_copy(
        update={
            "workout_type_id": None
            if payload.workout_type_id == payload.category.value
            else payload.workout_type_id,
        }
    )
    if comparable(stored.model_dump(mode="json")) != comparable(expected.model_dump(mode="json")):
        raise api_error(
            409,
            "active_workout_changed",
            "This workout was already saved on another device. "
            "Your different version is kept on this device for review.",
        )
