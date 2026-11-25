from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import ClipUploadStatus, SessionStatus
from .push_security import validate_expo_push_token, validate_push_endpoint


class SessionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    workout_date: date
    notes: str | None = Field(default=None, max_length=10_000)
    expected_clip_count: int = Field(gt=0, le=500)

    @field_validator("name", "notes", mode="before")
    @classmethod
    def strip_strings(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class ClipPatch(BaseModel):
    exercise_label: str | None = Field(default=None, max_length=200)

    @field_validator("exercise_label", mode="before")
    @classmethod
    def empty_to_none(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value


class ReorderItem(BaseModel):
    clip_id: str
    order_index: int = Field(ge=0)


class ReorderRequest(BaseModel):
    clips: list[ReorderItem] = Field(min_length=1)


class ClipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_clip_id: str
    original_filename: str
    order_index: int
    exercise_label: str | None
    file_size: int
    upload_status: ClipUploadStatus
    uploaded_at: datetime | None
    duration_ms: int | None


class TimestampRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clip_id: str
    order_index: int
    label: str
    start_seconds: int
    youtube_url: str | None


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    workout_date: date
    notes: str | None
    status: SessionStatus
    expected_clip_count: int
    uploaded_clip_count: int
    processing_error: str | None
    youtube_video_id: str | None
    youtube_url: str | None
    created_at: datetime
    updated_at: datetime
    clips: list[ClipRead] = []
    timestamps: list[TimestampRead] = []


class HealthRead(BaseModel):
    status: str
    upload_concurrency: int
    youtube_mock_mode: bool


class PushConfigRead(BaseModel):
    enabled: bool
    public_key: str | None = None


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2_000)
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=200)

    _endpoint = field_validator("endpoint")(validate_push_endpoint)


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2_000)


class ExpoPushTokenCreate(BaseModel):
    token: str = Field(min_length=1, max_length=200)
    platform: Literal["ios", "android"] | None = None
    # Alert kinds this app schedules on the phone itself. Unknown kinds are kept but unused.
    local_alerts: list[str] = Field(default_factory=list, max_length=10)

    _token = field_validator("token")(validate_expo_push_token)

    @field_validator("local_alerts")
    @classmethod
    def short_kinds(cls, value: list[str]) -> list[str]:
        return sorted({kind for kind in value if 0 < len(kind) <= 40})


class ExpoPushTokenDelete(BaseModel):
    token: str = Field(min_length=1, max_length=200)


class ExpoLocalReminderUpdate(BaseModel):
    """The "Still working out?" reminder the phone has scheduled, or none (both null)."""

    token: str = Field(min_length=1, max_length=200)
    workout_started_at: str | None = Field(default=None, max_length=30)
    due_at_ms: int | None = Field(default=None, ge=0)


class RestTimerNotificationCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2_000)
    timer_id: str = Field(min_length=1, max_length=100)
    delay_seconds: int = Field(ge=1, le=3_600)


class RestTimerNotificationCancel(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2_000)
    timer_id: str = Field(min_length=1, max_length=100)


class ActiveWorkoutReminderCreate(RestTimerNotificationCancel):
    started_at: float = Field(gt=0, le=253402293599)
