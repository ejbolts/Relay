"""Optional per-exercise conversion of each saved machine's weights to a reference machine.

Logged sets are never rewritten. Progress charts multiply a machine's weights by
``reference_kg / machine_kg`` when normalising is on, so the mapping can be edited
or switched off at any time.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .account_limits import limit_save_rate
from .auth import CurrentUser
from .database import get_db
from .models import Exercise, MachinePhoto
from .tracker import machine_photo_usage
from .training_metrics import get_setting, set_setting

router = APIRouter(prefix="/api/exercises", tags=["machine weight mapping"])
DbSession = Annotated[Session, Depends(get_db)]


class MachineWeightPair(BaseModel):
    """``machine_kg`` on this machine feels like ``reference_kg`` on the reference machine."""

    machine_kg: float | None = Field(default=None, gt=0, le=10_000)
    reference_kg: float | None = Field(default=None, gt=0, le=10_000)

    @model_validator(mode="after")
    def both_or_neither(self) -> MachineWeightPair:
        if (self.machine_kg is None) != (self.reference_kg is None):
            raise ValueError("Enter both weights, or leave both blank.")
        return self


class MachineWeightUpdate(MachineWeightPair):
    id: str


class MachineWeightRead(MachineWeightPair):
    id: str
    caption: str
    thumbnail_url: str
    workout_count: int
    last_used_date: date | None


class WeightMappingUpdate(BaseModel):
    enabled: bool = False
    reference_machine_id: str | None = None
    machines: list[MachineWeightUpdate] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def reference_when_enabled(self) -> WeightMappingUpdate:
        if self.enabled and self.reference_machine_id is None:
            raise ValueError("Choose a reference machine.")
        if len({machine.id for machine in self.machines}) != len(self.machines):
            raise ValueError("Each machine can only be listed once.")
        return self


class WeightMappingRead(BaseModel):
    enabled: bool
    reference_machine_id: str | None
    machines: list[MachineWeightRead]


def setting_key(exercise_id: str) -> str:
    return f"weight_mapping:{exercise_id}"


def owned_exercise(db: Session, user_id: str, exercise_id: str) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user_id:
        raise HTTPException(status_code=404, detail="Exercise was not found.")
    return exercise


def canonical_ids(db: Session, user_id: str, exercise_id: str) -> dict[str, str]:
    """Every machine photo id for the exercise, mapped to the saved machine it belongs to."""
    rows = db.execute(
        select(MachinePhoto.id, MachinePhoto.merged_into_id).where(
            MachinePhoto.user_id == user_id, MachinePhoto.exercise_id == exercise_id
        )
    )
    return {photo_id: merged_into_id or photo_id for photo_id, merged_into_id in rows}


def stored_mapping(db: Session, user_id: str, exercise_id: str) -> dict:
    try:
        value = json.loads(get_setting(db, user_id, setting_key(exercise_id), "{}"))
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def read_mapping(db: Session, user_id: str, exercise_id: str) -> WeightMappingRead:
    owned_exercise(db, user_id, exercise_id)
    canonical = canonical_ids(db, user_id, exercise_id)
    stored = stored_mapping(db, user_id, exercise_id)
    pairs: dict[str, MachineWeightPair] = {}
    raw_pairs = stored.get("machines")
    for photo_id, pair in (raw_pairs if isinstance(raw_pairs, dict) else {}).items():
        machine_id = canonical.get(photo_id)
        # A merged machine keeps its own pair; an alias only fills a gap.
        if machine_id is None or (machine_id in pairs and photo_id != machine_id):
            continue
        try:
            pairs[machine_id] = MachineWeightPair(machine_kg=pair[0], reference_kg=pair[1])
        except (TypeError, IndexError, ValueError):
            continue
    reference_id = canonical.get(stored.get("reference_machine_id") or "")
    photos = list(
        db.scalars(
            select(MachinePhoto)
            .where(
                MachinePhoto.exercise_id == exercise_id,
                MachinePhoto.user_id == user_id,
                MachinePhoto.merged_into_id.is_(None),
            )
            .options(selectinload(MachinePhoto.exercise), selectinload(MachinePhoto.merged_photos))
            .order_by(MachinePhoto.created_at)
        )
    )
    machines = []
    for usage in machine_photo_usage(db, user_id, photos):
        pair = pairs.get(usage.id) if usage.id != reference_id else None
        machines.append(
            MachineWeightRead(
                id=usage.id,
                caption=usage.caption,
                thumbnail_url=usage.thumbnail_url,
                workout_count=usage.workout_count,
                last_used_date=usage.last_used_date,
                machine_kg=pair.machine_kg if pair else None,
                reference_kg=pair.reference_kg if pair else None,
            )
        )
    return WeightMappingRead(
        enabled=bool(stored.get("enabled")) and reference_id is not None,
        reference_machine_id=reference_id,
        machines=machines,
    )


@router.get("/{exercise_id}/weight-mapping", response_model=WeightMappingRead)
def get_weight_mapping(exercise_id: str, db: DbSession, user: CurrentUser) -> WeightMappingRead:
    return read_mapping(db, user.id, exercise_id)


@router.put(
    "/{exercise_id}/weight-mapping",
    response_model=WeightMappingRead,
    dependencies=[Depends(limit_save_rate)],
)
def save_weight_mapping(
    exercise_id: str, payload: WeightMappingUpdate, db: DbSession, user: CurrentUser
) -> WeightMappingRead:
    owned_exercise(db, user.id, exercise_id)
    canonical = canonical_ids(db, user.id, exercise_id)
    saved_machines = set(canonical.values())
    requested = [payload.reference_machine_id] if payload.reference_machine_id else []
    requested += [machine.id for machine in payload.machines]
    if any(machine_id not in saved_machines for machine_id in requested):
        raise HTTPException(status_code=404, detail="Machine photo was not found.")
    value = {
        "enabled": payload.enabled,
        "reference_machine_id": payload.reference_machine_id,
        "machines": {
            machine.id: [machine.machine_kg, machine.reference_kg]
            for machine in payload.machines
            if machine.machine_kg is not None and machine.id != payload.reference_machine_id
        },
    }
    set_setting(db, user.id, setting_key(exercise_id), json.dumps(value))
    db.commit()
    return read_mapping(db, user.id, exercise_id)
