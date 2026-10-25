"""Registration, sign-in, profile management, and account deletion."""

from __future__ import annotations

import hmac
import re
import shutil
import threading
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .account_limits import load_account_limits
from .auth import (
    ACCOUNT_LOGIN_MAX_FAILURES,
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    AppSettings,
    AuthContextDependency,
    CurrentUser,
    LoginThrottle,
    as_utc,
    burn_password_check,
    can_upload_videos,
    clear_session_cookie,
    client_ip,
    create_user_session,
    get_current_user,
    get_login_throttle,
    hash_password,
    password_needs_rehash,
    revoke_session_token,
    set_session_cookie,
    too_many_attempts,
    verify_password,
)
from .config import Settings
from .database import get_db
from .errors import api_error
from .models import (
    AccountBackup,
    ActiveWorkoutReminder,
    AppSetting,
    BodyMeasurement,
    BodyWeightGoal,
    CardioSession,
    Clip,
    Exercise,
    ExerciseMuscleContribution,
    Friendship,
    LiveWorkout,
    MachinePhoto,
    PersonalRecord,
    ProfileBlock,
    ProfileSharing,
    PushSubscription,
    SupersetGroup,
    Timestamp,
    TrainingWorkout,
    User,
    UserSession,
    UserSetting,
    WorkoutMovement,
    WorkoutSession,
    WorkoutSet,
    WorkoutType,
    YouTubeConnection,
    YouTubeOAuthState,
    movement_machine_photos,
)
from .photo_storage import (
    PhotoValidationError,
    delete_machine_photo_files,
    delete_profile_photo_file,
    profile_photo_path,
    store_profile_photo,
)
from .server_settings import load_runtime_settings
from .storage import remove_session_files
from .tracker import (
    bump_workout_cache_revision,
    seed_default_exercises,
    sync_all_workout_cardio_sessions,
)
from .tracker_seed import seed_sample_body_measurements, seed_sample_workouts
from .training_metrics import rebuild_personal_records
from .youtube_connections import YouTubeConnectionError, decrypt_credentials, revoke_credentials

DbDependency = Annotated[Session, Depends(get_db)]
Throttle = Annotated[LoginThrottle, Depends(get_login_throttle)]
USERNAME_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{2,31}")
REGISTRATION_LOCK = threading.Lock()

# Every table that carries its own user_id. Rows with a NULL user_id predate accounts and are
# claimed by the first account ever created.
LEGACY_OWNED_MODELS = (
    WorkoutSession,
    PushSubscription,
    ActiveWorkoutReminder,
    BodyMeasurement,
    BodyWeightGoal,
    Exercise,
    MachinePhoto,
    TrainingWorkout,
    PersonalRecord,
    CardioSession,
)


class UsernameTakenError(Exception):
    pass


def normalize_username(value: str) -> str:
    username = value.strip()
    if not USERNAME_PATTERN.fullmatch(username):
        raise ValueError(
            "Use 3-32 letters, numbers, dots, underscores or hyphens, "
            "starting with a letter or number."
        )
    return username.lower()


def _clean_display_name(value: object) -> object:
    return " ".join(value.split()) if isinstance(value, str) else value


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    display_name: str = Field(min_length=1, max_length=80)
    invite_code: str | None = Field(default=None, max_length=200)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("display_name", mode="before")
    @classmethod
    def clean_display_name(cls, value: object) -> object:
        return _clean_display_name(value)


class LoginRequest(BaseModel):
    username: str = Field(max_length=320)
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    username: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        return None if value is None else normalize_username(value)

    @field_validator("display_name", mode="before")
    @classmethod
    def clean_display_name(cls, value: object) -> object:
        return _clean_display_name(value)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)


class AccountDelete(BaseModel):
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class AuthConfigRead(BaseModel):
    registration_open: bool
    invite_code_required: bool


class UserRead(BaseModel):
    id: str
    username: str
    display_name: str
    is_admin: bool
    can_upload_videos: bool
    created_at: datetime
    # Versioned by the stored file's name, so a new photo never shows a cached old one.
    profile_photo_url: str | None = None


def user_to_read(db: Session, user: User, settings: Settings) -> UserRead:
    video_uploads = load_runtime_settings(db, settings).video_uploads
    return UserRead(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_admin=user.is_admin,
        can_upload_videos=can_upload_videos(user, video_uploads),
        created_at=as_utc(user.created_at),
        profile_photo_url=(
            f"/api/profile/photo?v={user.profile_photo_filename.removesuffix('.webp')}"
            if user.profile_photo_filename
            else None
        ),
    )


def claim_legacy_data(db: Session, user: User) -> None:
    """Assign every pre-accounts row to ``user`` (no commit; runs in the caller's transaction)."""
    for model in LEGACY_OWNED_MODELS:
        db.execute(update(model).where(model.user_id.is_(None)).values(user_id=user.id))
    for setting in db.scalars(select(AppSetting)).all():
        db.add(UserSetting(user_id=user.id, key=setting.key, value=setting.value))
        db.delete(setting)
    db.flush()


def seed_new_account(db: Session, settings: Settings, user: User) -> None:
    """Give a new account the default exercise catalog and, optionally, sample data."""
    seed_default_exercises(db, user.id)
    if settings.seed_sample_data and seed_sample_workouts(db, user.id):
        seed_sample_body_measurements(db, user.id)
        sync_all_workout_cardio_sessions(db, user.id)
        rebuild_personal_records(db, user.id)
        bump_workout_cache_revision(db, user.id)
        db.commit()


def create_user(
    db: Session,
    settings: Settings,
    *,
    username: str,
    display_name: str,
    password: str,
    force_admin: bool = False,
) -> User:
    """Create an account. The first account becomes admin and claims all legacy data."""
    username = normalize_username(username)
    password_hash = hash_password(password)
    with REGISTRATION_LOCK:
        first_user = db.scalar(select(func.count(User.id))) == 0
        if db.scalar(select(User.id).where(User.username == username)) is not None:
            raise UsernameTakenError
        user = User(
            username=username,
            display_name=display_name,
            password_hash=password_hash,
            is_admin=first_user or force_admin,
        )
        db.add(user)
        try:
            db.flush()
            # Only newly created accounts start public. Missing choices on older accounts
            # continue to mean private; never widen an existing member's visibility.
            db.add(ProfileSharing(user_id=user.id, visibility="public"))
            if first_user:
                claim_legacy_data(db, user)
            # A unique starting revision stops one account's cached snapshot from ever being
            # mistaken for another's on a shared browser.
            bump_workout_cache_revision(db, user.id)
            db.commit()
        except IntegrityError as error:
            db.rollback()
            raise UsernameTakenError from error
    seed_new_account(db, settings, user)
    return user


def delete_account(db: Session, settings: Settings, user: User, app_state=None) -> None:
    """Delete a user and everything they own, including files on disk."""
    user_id = user.id
    youtube_credentials = None
    youtube_connection = db.get(YouTubeConnection, user_id)
    if youtube_connection:
        try:
            youtube_credentials = decrypt_credentials(settings, youtube_connection)
        except YouTubeConnectionError:
            pass
    profile_photo_filename = user.profile_photo_filename
    photo_files = [
        (row.full_filename, row.thumbnail_filename)
        for row in db.execute(
            select(MachinePhoto.full_filename, MachinePhoto.thumbnail_filename).where(
                MachinePhoto.user_id == user_id
            )
        )
    ]
    session_ids = list(
        db.scalars(select(WorkoutSession.id).where(WorkoutSession.user_id == user_id))
    )
    endpoints = list(
        db.scalars(select(PushSubscription.endpoint).where(PushSubscription.user_id == user_id))
    )

    workout_ids = select(TrainingWorkout.id).where(TrainingWorkout.user_id == user_id)
    movement_ids = select(WorkoutMovement.id).where(WorkoutMovement.workout_id.in_(workout_ids))
    exercise_ids = select(Exercise.id).where(Exercise.user_id == user_id)
    video_session_ids = select(WorkoutSession.id).where(WorkoutSession.user_id == user_id)
    # Explicit, ordered deletes keep this correct even where SQLite foreign keys are not enforced.
    statements = (
        delete(PersonalRecord).where(PersonalRecord.user_id == user_id),
        delete(CardioSession).where(CardioSession.user_id == user_id),
        delete(movement_machine_photos).where(
            movement_machine_photos.c.movement_id.in_(movement_ids)
        ),
        delete(WorkoutSet).where(WorkoutSet.movement_id.in_(movement_ids)),
        delete(WorkoutMovement).where(WorkoutMovement.workout_id.in_(workout_ids)),
        delete(SupersetGroup).where(SupersetGroup.workout_id.in_(workout_ids)),
        delete(TrainingWorkout).where(TrainingWorkout.user_id == user_id),
        delete(WorkoutType).where(WorkoutType.user_id == user_id),
        delete(MachinePhoto).where(MachinePhoto.user_id == user_id),
        delete(ExerciseMuscleContribution).where(
            ExerciseMuscleContribution.exercise_id.in_(exercise_ids)
        ),
        delete(Exercise).where(Exercise.user_id == user_id),
        delete(Timestamp).where(Timestamp.session_id.in_(video_session_ids)),
        delete(Clip).where(Clip.session_id.in_(video_session_ids)),
        delete(WorkoutSession).where(WorkoutSession.user_id == user_id),
        delete(BodyMeasurement).where(BodyMeasurement.user_id == user_id),
        delete(BodyWeightGoal).where(BodyWeightGoal.user_id == user_id),
        delete(ActiveWorkoutReminder).where(ActiveWorkoutReminder.user_id == user_id),
        delete(LiveWorkout).where(LiveWorkout.user_id == user_id),
        delete(PushSubscription).where(PushSubscription.user_id == user_id),
        delete(UserSetting).where(UserSetting.user_id == user_id),
        delete(ProfileSharing).where(ProfileSharing.user_id == user_id),
        delete(Friendship).where(
            (Friendship.member_a_id == user_id) | (Friendship.member_b_id == user_id)
        ),
        delete(ProfileBlock).where(
            (ProfileBlock.blocker_id == user_id) | (ProfileBlock.blocked_id == user_id)
        ),
        delete(YouTubeOAuthState).where(YouTubeOAuthState.user_id == user_id),
        delete(YouTubeConnection).where(YouTubeConnection.user_id == user_id),
        delete(UserSession).where(UserSession.user_id == user_id),
        delete(AccountBackup).where(AccountBackup.user_id == user_id),
        delete(User).where(User.id == user_id),
    )
    for statement in statements:
        db.execute(statement)
    db.commit()
    if youtube_credentials:
        revoke_credentials(youtube_credentials)

    for full_filename, thumbnail_filename in photo_files:
        delete_machine_photo_files(settings, full_filename, thumbnail_filename)
    delete_profile_photo_file(settings, profile_photo_filename)
    for session_id in session_ids:
        remove_session_files(session_id, settings)
    shutil.rmtree(settings.account_backups_dir / user_id, ignore_errors=True)
    rest_timers = getattr(app_state, "rest_timer_notifications", None)
    if rest_timers is not None:
        for endpoint in endpoints:
            rest_timers.cancel_endpoint(endpoint)


def browser_bootstrap_allowed(settings: Settings) -> bool:
    """Whether the first account may be created from the browser.

    The first account becomes admin and claims all pre-accounts data, so on a server that is
    reachable before its owner signs up it must not go to whoever arrives first. Without an
    invite code, the first account can only be created with the admin CLI.
    """
    return settings.registration_invite_code is not None


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


auth_router = APIRouter(prefix="/api/auth", tags=["auth"], dependencies=[Depends(no_store)])
profile_router = APIRouter(
    prefix="/api/profile",
    tags=["profile"],
    dependencies=[Depends(no_store), Depends(get_current_user)],
)


@auth_router.get("/config", response_model=AuthConfigRead)
def auth_config(db: DbDependency, settings: AppSettings) -> AuthConfigRead:
    has_users = db.scalar(select(func.count(User.id))) > 0
    return AuthConfigRead(
        registration_open=(
            load_runtime_settings(db, settings).allow_registration
            if has_users
            else browser_bootstrap_allowed(settings)
        ),
        invite_code_required=settings.registration_invite_code is not None,
    )


@auth_router.post("/register", response_model=UserRead, status_code=201)
def register(
    payload: RegisterRequest,
    request: Request,
    db: DbDependency,
    settings: AppSettings,
    throttle: Throttle,
) -> UserRead:
    has_users = db.scalar(select(func.count(User.id))) > 0
    if not has_users and not browser_bootstrap_allowed(settings):
        raise api_error(
            403,
            "setup_required",
            "This server is not set up yet. Set GYM_REGISTRATION_INVITE_CODE, or create the "
            "first account with `python -m app.manage create-user`.",
        )
    if has_users and not load_runtime_settings(db, settings).allow_registration:
        raise api_error(403, "registration_closed", "Registration is closed.")
    invite_code = settings.registration_invite_code
    if invite_code is not None:
        ip_key = f"ip:{client_ip(request)}"
        if throttle.is_blocked(ip_key):
            raise too_many_attempts()
        supplied = (payload.invite_code or "").encode("utf-8")
        if not hmac.compare_digest(supplied, invite_code.encode("utf-8")):
            throttle.record_failure(ip_key)
            raise api_error(403, "invalid_invite_code", "That invite code is not valid.")
    try:
        user = create_user(
            db,
            settings,
            username=payload.username,
            display_name=payload.display_name,
            password=payload.password,
        )
    except UsernameTakenError as error:
        raise api_error(
            409, "username_taken", "An account with that username already exists."
        ) from error
    return user_to_read(db, user, settings)


@auth_router.post("/login", response_model=UserRead)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DbDependency,
    settings: AppSettings,
    throttle: Throttle,
) -> UserRead:
    username = payload.username.strip().lower()
    ip_key, username_key = f"ip:{client_ip(request)}", f"username:{username}"
    if throttle.is_blocked(ip_key) or throttle.is_blocked(
        username_key, max_failures=ACCOUNT_LOGIN_MAX_FAILURES
    ):
        raise too_many_attempts()
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        burn_password_check(payload.password)  # Equalize timing so unknown usernames look alike.
        valid = False
    else:
        valid = verify_password(payload.password, user.password_hash)
    if not valid or user is None:
        throttle.record_failure(ip_key, username_key)
        raise api_error(401, "invalid_credentials", "Incorrect username or password.")
    throttle.reset(username_key)
    if user.disabled_at is not None:
        # Only reported after a correct password, so it reveals nothing to a guesser.
        raise api_error(
            403, "account_disabled", "This account has been disabled. Contact the server's admin."
        )
    if password_needs_rehash(user.password_hash):
        # Upgrade hashes made with older cost settings; committed with the new session.
        user.password_hash = hash_password(payload.password)
    token = create_user_session(db, user, settings, request.headers.get("user-agent"))
    set_session_cookie(response, token, settings)
    return user_to_read(db, user, settings)


@auth_router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbDependency, settings: AppSettings) -> None:
    revoke_session_token(db, request.cookies.get(settings.session_cookie))
    clear_session_cookie(response, settings)


@auth_router.get("/me", response_model=UserRead)
def me(user: CurrentUser, db: DbDependency, settings: AppSettings) -> UserRead:
    return user_to_read(db, user, settings)


@profile_router.patch("", response_model=UserRead)
def update_profile(
    payload: ProfileUpdate, user: CurrentUser, db: DbDependency, settings: AppSettings
) -> UserRead:
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.username is not None and payload.username != user.username:
        taken = db.scalar(
            select(User.id).where(User.username == payload.username, User.id != user.id)
        )
        if taken is not None:
            raise api_error(409, "username_taken", "An account with that username already exists.")
        user.username = payload.username
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise api_error(
            409, "username_taken", "An account with that username already exists."
        ) from error
    db.refresh(user)
    return user_to_read(db, user, settings)


@profile_router.put("/photo", response_model=UserRead)
async def upload_profile_photo(
    user: CurrentUser,
    db: DbDependency,
    settings: AppSettings,
    file: Annotated[UploadFile, File(...)],
) -> UserRead:
    limits = load_account_limits(db, settings)
    try:
        filename = await store_profile_photo(
            upload=file, settings=settings, max_bytes=limits.photo_upload_megabytes * 1024 * 1024
        )
    except PhotoValidationError as error:
        raise api_error(error.status_code, error.code, error.message) from error
    previous = user.profile_photo_filename
    user.profile_photo_filename = filename
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_profile_photo_file(settings, filename)
        raise
    delete_profile_photo_file(settings, previous)
    db.refresh(user)
    return user_to_read(db, user, settings)


@profile_router.delete("/photo", response_model=UserRead)
def delete_profile_photo(user: CurrentUser, db: DbDependency, settings: AppSettings) -> UserRead:
    previous = user.profile_photo_filename
    user.profile_photo_filename = None
    db.commit()
    delete_profile_photo_file(settings, previous)
    db.refresh(user)
    return user_to_read(db, user, settings)


@profile_router.get("/photo")
def get_profile_photo(user: CurrentUser, settings: AppSettings) -> FileResponse:
    path = (
        profile_photo_path(settings, user.profile_photo_filename)
        if user.profile_photo_filename
        else None
    )
    if path is None or not path.is_file():
        raise api_error(404, "profile_photo_not_found", "No profile photo has been added.")
    # Each upload has a new URL, so the browser may keep this one; it is never shared.
    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


def _check_current_password(user: User, password: str, throttle: LoginThrottle) -> None:
    key = f"user:{user.id}"
    if throttle.is_blocked(key):
        raise too_many_attempts()
    if not verify_password(password, user.password_hash):
        throttle.record_failure(key)
        raise api_error(400, "invalid_password", "That password is not correct.")
    throttle.reset(key)


@profile_router.put("/password", status_code=204)
def change_password(
    payload: PasswordChange,
    context: AuthContextDependency,
    db: DbDependency,
    throttle: Throttle,
) -> None:
    user = context.user
    _check_current_password(user, payload.current_password, throttle)
    user.password_hash = hash_password(payload.new_password)
    # A password change signs out every other device.
    db.execute(
        delete(UserSession).where(
            UserSession.user_id == user.id, UserSession.id != context.session.id
        )
    )
    db.commit()


@profile_router.delete("", status_code=204)
def delete_profile(
    payload: AccountDelete,
    request: Request,
    response: Response,
    user: CurrentUser,
    db: DbDependency,
    settings: AppSettings,
    throttle: Throttle,
) -> None:
    _check_current_password(user, payload.password, throttle)
    delete_account(db, settings, user, request.app.state)
    clear_session_cookie(response, settings)
