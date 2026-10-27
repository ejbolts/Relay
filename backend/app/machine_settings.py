from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .auth import CurrentUser
from .database import get_db
from .models import Exercise, MachinePhoto
from .training_metrics import get_setting, set_setting


class MachineSetting(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    value: str = Field(min_length=1, max_length=30)

    @field_validator("name", "value", mode="before")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class MachineSettings(BaseModel):
    settings: list[MachineSetting] = Field(default_factory=list, max_length=20)


class NumericMachineSetting(MachineSetting):
    value: str = Field(
        min_length=1, max_length=30, pattern=r"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$"
    )

    @field_validator("value", mode="before")
    @classmethod
    def number_as_text(cls, value: object) -> object:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(value)
        return value


class MachineSettingsUpdate(MachineSettings):
    settings: list[NumericMachineSetting] = Field(default_factory=list, max_length=20)


router = APIRouter(prefix="/api/exercises", tags=["machine settings"])
DbSession = Annotated[Session, Depends(get_db)]


def require_exercise(db: Session, user_id: str, exercise_id: str) -> None:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user_id:
        raise HTTPException(status_code=404, detail="Exercise was not found.")


def settings_key(
    db: Session, user_id: str, exercise_id: str, machine_photo_id: str | None = None
) -> str:
    require_exercise(db, user_id, exercise_id)
    if machine_photo_id is None:
        return f"machine_settings:{exercise_id}"
    photo = db.get(MachinePhoto, machine_photo_id)
    if photo is None or photo.user_id != user_id or photo.exercise_id != exercise_id:
        raise HTTPException(status_code=404, detail="Machine photo was not found.")
    return f"machine_settings:{exercise_id}:{machine_photo_id}"


@router.get("/{exercise_id}/machine-settings", response_model=MachineSettings)
def get_machine_settings(
    exercise_id: str, db: DbSession, user: CurrentUser, machine_photo_id: str | None = None
) -> MachineSettings:
    key = settings_key(db, user.id, exercise_id, machine_photo_id)
    try:
        return MachineSettings.model_validate_json(get_setting(db, user.id, key, "{}"))
    except ValidationError:
        return MachineSettings()


@router.put(
    "/{exercise_id}/machine-settings",
    response_model=MachineSettings,
    dependencies=[Depends(limit_save_rate)],
)
def save_machine_settings(
    exercise_id: str,
    payload: MachineSettingsUpdate,
    db: DbSession,
    user: CurrentUser,
    machine_photo_id: str | None = None,
) -> MachineSettings:
    key = settings_key(db, user.id, exercise_id, machine_photo_id)
    set_setting(db, user.id, key, payload.model_dump_json())
    db.commit()
    return payload
