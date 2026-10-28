from __future__ import annotations

import enum
import uuid
from datetime import UTC, date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base


class SessionStatus(enum.StrEnum):
    DRAFT = "draft"
    UPLOADING = "uploading"
    UPLOAD_FAILED = "upload_failed"
    QUEUED = "queued"
    NORMALIZING = "normalizing"
    STITCHING = "stitching"
    UPLOADING_TO_YOUTUBE = "uploading_to_youtube"
    YOUTUBE_PROCESSING = "youtube_processing"
    COMPLETE = "complete"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ClipUploadStatus(enum.StrEnum):
    WAITING = "waiting"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"


class WorkoutCategory(enum.StrEnum):
    UPPER = "upper"
    LOWER = "lower"
    PUSH = "push"
    PULL = "pull"
    FULL_BODY = "full_body"
    CARDIO = "cardio"
    OTHER = "other"


class ExerciseKind(enum.StrEnum):
    STRENGTH = "strength"
    CARDIO = "cardio"


class SetType(enum.StrEnum):
    WARMUP = "warmup"
    NORMAL = "normal"
    DROP = "drop"


class MuscleRole(enum.StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"


class PersonalRecordType(enum.StrEnum):
    WEIGHT = "weight"
    REPS_AT_WEIGHT = "reps_at_weight"
    ESTIMATED_1RM = "estimated_1rm"
    DURATION = "duration"
    DISTANCE = "distance"


def new_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


def user_id_column() -> Mapped[str | None]:
    """Owner of a row. Nullable only so pre-accounts rows can wait to be claimed."""
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    username: Mapped[str] = mapped_column(String(32, collation="NOCASE"), unique=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(300))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # A square WebP in data/profile-photos/; a new upload gets a new name, which busts caches.
    profile_photo_filename: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Set by an admin; a disabled account cannot sign in and has no live sessions.
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Survives sign-out and session expiry, unlike the per-session last_seen_at.
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), onupdate=utc_now
    )


class AppFeedback(Base):
    __tablename__ = "app_feedback"
    __table_args__ = (UniqueConstraint("user_id", "submission_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    submission_id: Mapped[str] = mapped_column(String(36))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), index=True
    )
    # Open feedback has no resolution; administrators can resolve it and reopen it again.
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    resolved_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class ProfileSharing(Base):
    """Who can see an account's profile, and what it shares beyond workouts and its photo.

    ``visibility`` is ``private`` (nobody), ``followers`` (its friends; the stored name predates
    friendships) or ``public`` (every sharing member). Only accounts that share can see or add
    others. The optional choices are kept while the profile is private, so sharing again restores
    them.
    """

    __tablename__ = "profile_sharing"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('private', 'followers', 'public')", name="profile_visibility_known"
        ),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    visibility: Mapped[str] = mapped_column(String(20), default="private", server_default="private")
    share_notes: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # No longer read: cardio is always shared with workouts. Kept so existing databases and
    # account backups keep their schema.
    share_cardio: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    share_body_weight: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    share_goals: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    share_machine_photos: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), onupdate=utc_now
    )


class Friendship(Base):
    """Two members' friendship: ``pending`` until the member who did not ask accepts it.

    Each pair has one row, stored with the lower account id first so a request in either
    direction finds the same friendship. ``notification_seen`` belongs to whoever has news: the
    recipient of a pending request, then the requester once it is accepted.
    """

    __tablename__ = "friendships"
    __table_args__ = (
        CheckConstraint("member_a_id < member_b_id", name="friendship_ordered_pair"),
        CheckConstraint(
            "requested_by_id IN (member_a_id, member_b_id)", name="friendship_requester_member"
        ),
        CheckConstraint("status IN ('pending', 'accepted')", name="friendship_status_known"),
    )

    member_a_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    member_b_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    requested_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_seen: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    def other(self, user_id: str) -> str:
        return self.member_b_id if user_id == self.member_a_id else self.member_a_id


WORKOUT_REACTIONS = ("like", "love", "strong", "fire", "clap", "trophy")


class ProfileBlock(Base):
    """An account's persistent block of another member, independent of profile visibility."""

    __tablename__ = "profile_blocks"
    __table_args__ = (CheckConstraint("blocker_id != blocked_id", name="profile_block_not_self"),)

    blocker_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    blocked_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )


class WorkoutReaction(Base):
    """One member's reaction to another member's shared workout; reacting again replaces it."""

    __tablename__ = "workout_reactions"
    __table_args__ = (
        CheckConstraint(
            "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy')",
            name="workout_reaction_known",
        ),
    )

    workout_id: Mapped[str] = mapped_column(
        ForeignKey("training_workouts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    reaction: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    # The workout owner's notification, cleared when they dismiss it.
    notification_seen: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class WorkoutComment(Base):
    __tablename__ = "workout_comments"
    __table_args__ = (CheckConstraint("length(body) BETWEEN 1 AND 280", name="comment_length"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    workout_id: Mapped[str] = mapped_column(
        ForeignKey("training_workouts.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("workout_comments.id", ondelete="CASCADE")
    )
    reply_to_id: Mapped[str | None] = mapped_column(
        ForeignKey("workout_comments.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(String(280))
    reaction: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CommentReaction(Base):
    __tablename__ = "comment_reactions"
    __table_args__ = (
        CheckConstraint(
            "reaction IN ('like', 'love', 'strong', 'fire', 'clap', 'trophy')",
            name="comment_reaction_known",
        ),
    )

    comment_id: Mapped[str] = mapped_column(
        ForeignKey("workout_comments.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    reaction: Mapped[str] = mapped_column(String(20))


class CommentNotification(Base):
    __tablename__ = "comment_notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    comment_id: Mapped[str] = mapped_column(
        ForeignKey("workout_comments.id", ondelete="CASCADE"), index=True
    )
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))
    reaction: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class ServerSetting(Base):
    """Deployment-wide switches an admin changes at runtime; unset keys fall back to .env."""

    __tablename__ = "server_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), onupdate=utc_now
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)


class YouTubeConnection(Base):
    """An account's channel and encrypted OAuth credentials; never included in backups."""

    __tablename__ = "youtube_connections"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    channel_id: Mapped[str] = mapped_column(String(100))
    channel_title: Mapped[str] = mapped_column(String(200))
    encrypted_credentials: Mapped[str] = mapped_column(Text)
    needs_reconnect: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")


class YouTubeOAuthState(Base):
    """Short-lived, single-use authorization tied to the initiating app sign-in."""

    __tablename__ = "youtube_oauth_states"

    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("user_sessions.id", ondelete="CASCADE"))
    encrypted_verifier: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserSetting(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class AccountBackupKind(enum.StrEnum):
    SNAPSHOT = "snapshot"
    LEGACY_IMPORT = "legacy_import"


class AccountBackup(Base):
    """A backup owned by one account. Its files live under ``account_backups_dir/<user_id>``."""

    __tablename__ = "account_backups"
    __table_args__ = (
        UniqueConstraint("user_id", "source_fingerprint", name="uq_account_backup_user_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(200))
    schema_revision: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_count: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)
    # SHA-256 of an imported database, so the same legacy backup cannot be imported twice.
    source_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )


movement_machine_photos = Table(
    "movement_machine_photos",
    Base.metadata,
    Column(
        "movement_id",
        String(36),
        ForeignKey("workout_movements.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "machine_photo_id",
        String(36),
        ForeignKey("machine_photos.id", ondelete="RESTRICT"),
        primary_key=True,
    ),
)


class WorkoutSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    name: Mapped[str] = mapped_column(String(200))
    workout_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, native_enum=False), default=SessionStatus.DRAFT
    )
    expected_clip_count: Mapped[int] = mapped_column(Integer)
    uploaded_clip_count: Mapped[int] = mapped_column(Integer, default=0)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    youtube_video_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    youtube_channel_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    clips: Mapped[list[Clip]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="Clip.order_index"
    )
    timestamps: Mapped[list[Timestamp]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="Timestamp.order_index"
    )

    __table_args__ = (
        CheckConstraint("expected_clip_count > 0", name="expected_clip_count_positive"),
    )


class Clip(Base):
    __tablename__ = "clips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    client_clip_id: Mapped[str] = mapped_column(String(36))
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    original_filename: Mapped[str] = mapped_column(String(500))
    stored_filename: Mapped[str] = mapped_column(String(200))
    order_index: Mapped[int] = mapped_column(Integer)
    exercise_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer)
    upload_status: Mapped[ClipUploadStatus] = mapped_column(
        Enum(ClipUploadStatus, native_enum=False), default=ClipUploadStatus.WAITING
    )
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    original_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_metadata_json: Mapped[str] = mapped_column(Text, default="{}")

    session: Mapped[WorkoutSession] = relationship(back_populates="clips")
    timestamp: Mapped[Timestamp | None] = relationship(back_populates="clip")

    __table_args__ = (
        UniqueConstraint("session_id", "client_clip_id", name="uq_clip_client_id_per_session"),
        UniqueConstraint("session_id", "order_index", name="uq_clip_order_per_session"),
        CheckConstraint("order_index >= 0", name="clip_order_nonnegative"),
    )


class Timestamp(Base):
    __tablename__ = "timestamps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"))
    clip_id: Mapped[str] = mapped_column(ForeignKey("clips.id", ondelete="CASCADE"), unique=True)
    order_index: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(300))
    start_seconds: Mapped[int] = mapped_column(Integer)
    youtube_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    session: Mapped[WorkoutSession] = relationship(back_populates="timestamps")
    clip: Mapped[Clip] = relationship(back_populates="timestamp")

    __table_args__ = (
        UniqueConstraint("session_id", "order_index", name="uq_timestamp_order_per_session"),
    )


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AppSetting(Base):
    """Legacy global key/value store; per-user preferences now live in ``UserSetting``."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class ActiveWorkoutReminder(Base):
    __tablename__ = "active_workout_reminders"

    endpoint: Mapped[str] = mapped_column(String(2000), primary_key=True)
    user_id: Mapped[str | None] = user_id_column()
    timer_id: Mapped[str] = mapped_column(String(100))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)


class BodyMeasurement(Base):
    __tablename__ = "body_measurements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    measurement_date: Mapped[date] = mapped_column(Date)
    weight_kg: Mapped[float] = mapped_column(Float)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "measurement_date", name="uq_body_measurement_user_date"),
        CheckConstraint("weight_kg > 0 AND weight_kg <= 500", name="body_weight_range"),
        CheckConstraint(
            "body_fat_pct IS NULL OR (body_fat_pct >= 1 AND body_fat_pct <= 70)",
            name="body_fat_range",
        ),
    )


class BodyWeightGoal(Base):
    __tablename__ = "body_weight_goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    start_date: Mapped[date] = mapped_column(Date)
    target_date: Mapped[date] = mapped_column(Date)
    start_weight_kg: Mapped[float] = mapped_column(Float)
    target_weight_kg: Mapped[float] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "start_weight_kg > 0 AND target_weight_kg > 0", name="body_goal_weights_positive"
        ),
        CheckConstraint("target_date >= start_date", name="body_goal_dates_ordered"),
    )


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[WorkoutCategory] = mapped_column(Enum(WorkoutCategory, native_enum=False))
    kind: Mapped[ExerciseKind] = mapped_column(
        Enum(ExerciseKind, native_enum=False), default=ExerciseKind.STRENGTH
    )
    muscle_group: Mapped[str] = mapped_column(String(100))
    equipment: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    movements: Mapped[list[WorkoutMovement]] = relationship(back_populates="exercise")
    machine_photos: Mapped[list[MachinePhoto]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan"
    )
    muscle_contributions: Mapped[list[ExerciseMuscleContribution]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
        order_by="ExerciseMuscleContribution.muscle_name",
    )

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_exercise_user_name"),)


class ExerciseMuscleContribution(Base):
    __tablename__ = "exercise_muscle_contributions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    exercise_id: Mapped[str] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), index=True
    )
    muscle_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[MuscleRole] = mapped_column(Enum(MuscleRole, native_enum=False))
    contribution_factor: Mapped[float] = mapped_column(Float)

    exercise: Mapped[Exercise] = relationship(back_populates="muscle_contributions")

    __table_args__ = (
        UniqueConstraint("exercise_id", "muscle_name", name="uq_exercise_muscle"),
        CheckConstraint(
            "contribution_factor > 0 AND contribution_factor <= 1",
            name="exercise_muscle_factor_range",
        ),
    )


class MachinePhoto(Base):
    __tablename__ = "machine_photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    exercise_id: Mapped[str] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), index=True
    )
    caption: Mapped[str] = mapped_column(String(160))
    original_filename: Mapped[str] = mapped_column(String(500))
    full_filename: Mapped[str] = mapped_column(String(200), unique=True)
    thumbnail_filename: Mapped[str] = mapped_column(String(200), unique=True)
    media_type: Mapped[str] = mapped_column(String(100), default="image/webp")
    file_size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )

    exercise: Mapped[Exercise] = relationship(back_populates="machine_photos")
    movements: Mapped[list[WorkoutMovement]] = relationship(
        secondary=movement_machine_photos,
        back_populates="machine_photos",
    )

    @property
    def thumbnail_url(self) -> str:
        return f"/api/machine-photos/{self.id}/image?variant=thumbnail"

    @property
    def full_url(self) -> str:
        return f"/api/machine-photos/{self.id}/image?variant=full"

    __table_args__ = (
        CheckConstraint("file_size > 0", name="machine_photo_file_size_positive"),
        CheckConstraint("width > 0", name="machine_photo_width_positive"),
        CheckConstraint("height > 0", name="machine_photo_height_positive"),
    )


class WorkoutType(Base):
    __tablename__ = "workout_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(40, collation="NOCASE"))
    color: Mapped[str] = mapped_column(String(7))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    @property
    def is_custom(self) -> bool:
        return True

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_workout_type_user_name"),)


class TrainingWorkout(Base):
    __tablename__ = "training_workouts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    client_session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    workout_date: Mapped[date] = mapped_column(Date)
    category: Mapped[WorkoutCategory] = mapped_column(Enum(WorkoutCategory, native_enum=False))
    workout_type_id: Mapped[str | None] = mapped_column(
        ForeignKey("workout_types.id", ondelete="RESTRICT"), nullable=True
    )
    workout_type: Mapped[WorkoutType | None] = relationship()
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), onupdate=func.now()
    )

    movements: Mapped[list[WorkoutMovement]] = relationship(
        back_populates="workout",
        cascade="all, delete-orphan",
        order_by="WorkoutMovement.order_index",
    )
    superset_groups: Mapped[list[SupersetGroup]] = relationship(
        back_populates="workout", cascade="all, delete-orphan", order_by="SupersetGroup.order_index"
    )
    personal_records: Mapped[list[PersonalRecord]] = relationship(
        back_populates="workout", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "uq_training_workout_user_client_session",
            "user_id",
            "client_session_id",
            unique=True,
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes >= 0",
            name="training_workout_duration_nonnegative",
        ),
        CheckConstraint(
            "(start_time IS NULL AND end_time IS NULL) OR "
            "(start_time IS NOT NULL AND end_time IS NOT NULL)",
            name="training_workout_times_together",
        ),
    )


class WorkoutMovement(Base):
    __tablename__ = "workout_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    workout_id: Mapped[str] = mapped_column(ForeignKey("training_workouts.id", ondelete="CASCADE"))
    exercise_id: Mapped[str] = mapped_column(ForeignKey("exercises.id"))
    order_index: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    machine_settings: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, default=list, server_default="[]"
    )
    superset_group_id: Mapped[str | None] = mapped_column(
        ForeignKey("superset_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )

    workout: Mapped[TrainingWorkout] = relationship(back_populates="movements")
    exercise: Mapped[Exercise] = relationship(back_populates="movements")
    sets: Mapped[list[WorkoutSet]] = relationship(
        back_populates="movement", cascade="all, delete-orphan", order_by="WorkoutSet.order_index"
    )
    machine_photos: Mapped[list[MachinePhoto]] = relationship(
        secondary=movement_machine_photos,
        back_populates="movements",
        order_by="MachinePhoto.created_at",
    )
    superset_group: Mapped[SupersetGroup | None] = relationship(back_populates="movements")

    @property
    def superset_name(self) -> str | None:
        return self.superset_group.name if self.superset_group else None

    __table_args__ = (
        UniqueConstraint("workout_id", "order_index", name="uq_workout_movement_order"),
        CheckConstraint("order_index >= 0", name="workout_movement_order_nonnegative"),
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    movement_id: Mapped[str] = mapped_column(ForeignKey("workout_movements.id", ondelete="CASCADE"))
    order_index: Mapped[int] = mapped_column(Integer)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    rest_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    calories_kcal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_heart_rate_bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    incline_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_kph: Mapped[float | None] = mapped_column(Float, nullable=True)
    bodyweight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    percentile: Mapped[float | None] = mapped_column(Float, nullable=True)
    warmup: Mapped[bool] = mapped_column(Boolean, default=False)
    set_type: Mapped[SetType] = mapped_column(
        Enum(SetType, native_enum=False), default=SetType.NORMAL
    )
    failed: Mapped[bool] = mapped_column(Boolean, default=False)
    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=True)

    movement: Mapped[WorkoutMovement] = relationship(back_populates="sets")
    personal_records: Mapped[list[PersonalRecord]] = relationship(
        back_populates="workout_set", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("movement_id", "order_index", name="uq_workout_set_order"),
        CheckConstraint("order_index >= 0", name="workout_set_order_nonnegative"),
        CheckConstraint("reps IS NULL OR reps >= 0", name="workout_set_reps_nonnegative"),
        CheckConstraint(
            "target_reps IS NULL OR target_reps >= 0", name="workout_set_target_reps_nonnegative"
        ),
        CheckConstraint(
            "weight_kg IS NULL OR weight_kg >= 0", name="workout_set_weight_nonnegative"
        ),
        CheckConstraint(
            "calories_kcal IS NULL OR (calories_kcal >= 0 AND calories_kcal <= 100000)",
            name="workout_set_calories_range",
        ),
        CheckConstraint(
            "average_heart_rate_bpm IS NULL OR "
            "(average_heart_rate_bpm >= 20 AND average_heart_rate_bpm <= 250)",
            name="workout_set_average_heart_rate_range",
        ),
        CheckConstraint("rpe IS NULL OR (rpe >= 1 AND rpe <= 10)", name="workout_set_rpe_range"),
        CheckConstraint(
            "rest_seconds IS NULL OR rest_seconds >= 0", name="workout_set_rest_nonnegative"
        ),
        CheckConstraint(
            "incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 100)",
            name="workout_set_incline_range",
        ),
        CheckConstraint(
            "speed_kph IS NULL OR (speed_kph >= 0 AND speed_kph <= 100)",
            name="workout_set_speed_range",
        ),
        CheckConstraint(
            "bodyweight_kg IS NULL OR bodyweight_kg >= 0",
            name="workout_set_bodyweight_nonnegative",
        ),
        CheckConstraint(
            "percentile IS NULL OR (percentile >= 0 AND percentile <= 100)",
            name="workout_set_percentile_range",
        ),
    )


class SupersetGroup(Base):
    __tablename__ = "superset_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    workout_id: Mapped[str] = mapped_column(
        ForeignKey("training_workouts.id", ondelete="CASCADE"), index=True
    )
    order_index: Mapped[int] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    workout: Mapped[TrainingWorkout] = relationship(back_populates="superset_groups")
    movements: Mapped[list[WorkoutMovement]] = relationship(back_populates="superset_group")

    __table_args__ = (
        UniqueConstraint("workout_id", "order_index", name="uq_workout_superset_order"),
        CheckConstraint("order_index >= 0", name="superset_order_nonnegative"),
    )


class PersonalRecord(Base):
    __tablename__ = "personal_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    exercise_id: Mapped[str] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), index=True
    )
    workout_id: Mapped[str] = mapped_column(
        ForeignKey("training_workouts.id", ondelete="CASCADE"), index=True
    )
    set_id: Mapped[str] = mapped_column(
        ForeignKey("workout_sets.id", ondelete="CASCADE"), index=True
    )
    achieved_date: Mapped[date] = mapped_column(Date, index=True)
    record_type: Mapped[PersonalRecordType] = mapped_column(
        Enum(PersonalRecordType, native_enum=False)
    )
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(30))
    normalized_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    formula: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )

    exercise: Mapped[Exercise] = relationship()
    workout: Mapped[TrainingWorkout] = relationship(back_populates="personal_records")
    workout_set: Mapped[WorkoutSet] = relationship(back_populates="personal_records")

    @property
    def exercise_name(self) -> str:
        return self.exercise.name

    @property
    def weight_kg(self) -> float | None:
        return self.workout_set.weight_kg

    __table_args__ = (
        UniqueConstraint(
            "set_id", "record_type", "normalized_weight", name="uq_pr_set_type_weight"
        ),
        CheckConstraint("value >= 0", name="personal_record_value_nonnegative"),
    )


class CardioSession(Base):
    __tablename__ = "cardio_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = user_id_column()
    session_date: Mapped[date] = mapped_column(Date, index=True)
    activity_type: Mapped[str] = mapped_column(String(100))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    calories_kcal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_heart_rate_bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_speed_kph: Mapped[float | None] = mapped_column(Float, nullable=True)
    incline_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_power_watts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_mets: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_exercise_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    intensity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    qualifies_zone2: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_workout_id: Mapped[str | None] = mapped_column(
        ForeignKey("training_workouts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    source_movement_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), onupdate=func.now()
    )

    source_workout: Mapped[TrainingWorkout | None] = relationship()

    @property
    def workout_context(self) -> str:
        if not self.source_workout:
            return "pure_cardio"
        has_strength_movement = any(
            movement.exercise.kind != ExerciseKind.CARDIO
            for movement in self.source_workout.movements
        )
        return "workout_plus_cardio" if has_strength_movement else "pure_cardio"

    @property
    def performed_after_strength(self) -> bool:
        if not self.source_workout or self.source_movement_index is None:
            return False
        return any(
            movement.order_index < self.source_movement_index
            and movement.exercise.kind != ExerciseKind.CARDIO
            for movement in self.source_workout.movements
        )

    @property
    def source_workout_name(self) -> str | None:
        return self.source_workout.name if self.source_workout else None

    __table_args__ = (
        CheckConstraint(
            "calories_kcal IS NULL OR (calories_kcal >= 0 AND calories_kcal <= 100000)",
            name="cardio_calories_range",
        ),
        CheckConstraint(
            "average_heart_rate_bpm IS NULL OR "
            "(average_heart_rate_bpm >= 20 AND average_heart_rate_bpm <= 250)",
            name="cardio_average_heart_rate_range",
        ),
        CheckConstraint(
            "distance_km IS NULL OR (distance_km >= 0 AND distance_km <= 10000)",
            name="cardio_distance_range",
        ),
        CheckConstraint(
            "average_speed_kph IS NULL OR (average_speed_kph >= 0 AND average_speed_kph <= 100)",
            name="cardio_average_speed_range",
        ),
        CheckConstraint(
            "incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 100)",
            name="cardio_incline_range",
        ),
        CheckConstraint(
            "average_power_watts IS NULL OR "
            "(average_power_watts >= 1 AND average_power_watts <= 3000)",
            name="cardio_average_power_range",
        ),
        CheckConstraint(
            "average_mets IS NULL OR (average_mets > 0 AND average_mets <= 50)",
            name="cardio_average_mets_range",
        ),
        CheckConstraint(
            "duration_minutes > 0 AND duration_minutes <= 1440", name="cardio_duration_range"
        ),
        CheckConstraint(
            "(source_workout_id IS NULL AND source_movement_index IS NULL) OR "
            "(source_workout_id IS NOT NULL AND source_movement_index IS NOT NULL)",
            name="cardio_source_fields_together",
        ),
        UniqueConstraint(
            "source_workout_id",
            "source_movement_index",
            name="uq_cardio_source_workout_movement",
        ),
    )
