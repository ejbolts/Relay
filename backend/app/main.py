from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import comments  # noqa: F401 -- registers discussion routes on sharing_router
from .account_limits import SaveRateLimiter
from .accounts import auth_router, profile_router
from .admin import admin_router
from .auth import (
    CsrfOriginMiddleware,
    CurrentUser,
    LoginThrottle,
    get_current_user,
    require_video_access,
)
from .config import Settings, get_settings
from .database import Base, SessionLocal, engine, get_db
from .errors import api_error
from .feedback import admin_feedback_router, feedback_router
from .frontend import FrontendFiles
from .home_layout import router as home_layout_router
from .models import (
    Clip,
    ClipUploadStatus,
    PushSubscription,
    SessionStatus,
    User,
    WorkoutSession,
)
from .notifications import (
    ActiveWorkoutReminderScheduler,
    RestTimerNotificationScheduler,
    push_available,
    send_push_notification,
    vapid_public_key,
)
from .presence import presence_router
from .processing import ProcessingValidationError, SessionProcessor, validate_batch_ready
from .schemas import (
    ActiveWorkoutReminderCreate,
    ClipPatch,
    ClipRead,
    HealthRead,
    PushConfigRead,
    PushSubscriptionCreate,
    PushSubscriptionDelete,
    ReorderRequest,
    RestTimerNotificationCancel,
    RestTimerNotificationCreate,
    SessionCreate,
    SessionRead,
)
from .sharing import sharing_router
from .storage import (
    UploadValidationError,
    clean_abandoned_partials,
    remove_session_files,
    stream_upload_to_disk,
)
from .tracker import router as tracker_router
from .tracker import seed_default_exercises, sync_all_workout_cardio_sessions
from .training_metrics import rebuild_personal_records
from .youtube_connections import OAuthAccessLogFilter, YouTubeConnectionError, require_connection
from .youtube_connections import router as youtube_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def load_session(db: Session, user_id: str, session_id: str) -> WorkoutSession:
    session = db.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        .options(selectinload(WorkoutSession.clips), selectinload(WorkoutSession.timestamps))
    )
    if not session:
        raise api_error(404, "session_not_found", "Session was not found.")
    return session


def can_accept_uploads(session: WorkoutSession) -> bool:
    return session.status in {
        SessionStatus.DRAFT,
        SessionStatus.UPLOADING,
        SessionStatus.UPLOAD_FAILED,
    }


def check_youtube_connection(db: Session, settings: Settings, session: WorkoutSession) -> None:
    try:
        require_connection(db, settings, session.user_id, session.youtube_channel_id)
        if not settings.youtube_mock_mode and not session.youtube_channel_id:
            raise YouTubeConnectionError(
                "This older batch has no personal channel connection. Start a new upload."
            )
    except YouTubeConnectionError as error:
        raise api_error(409, "youtube_connection_required", str(error)) from error


def owns_subscription(db: Session, user_id: str, endpoint: str) -> bool:
    return (
        db.scalar(
            select(PushSubscription.id).where(
                PushSubscription.endpoint == endpoint, PushSubscription.user_id == user_id
            )
        )
        is not None
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, OAuthAccessLogFilter) for item in access_logger.filters):
        access_logger.addFilter(OAuthAccessLogFilter())

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.ensure_directories()
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            user_ids = list(db.scalars(select(User.id)))
            for user_id in user_ids:
                seed_default_exercises(db, user_id)
            sync_all_workout_cardio_sessions(db)
            for user_id in user_ids:
                rebuild_personal_records(db, user_id)
            db.commit()
        removed = clean_abandoned_partials(settings)
        if removed:
            logger.info("Removed abandoned partial uploads", extra={"count": removed})
        processor = SessionProcessor(SessionLocal, settings)
        rest_timer_notifications = RestTimerNotificationScheduler(SessionLocal, settings)
        workout_reminders = ActiveWorkoutReminderScheduler(SessionLocal, settings)
        app.state.workout_reminders = workout_reminders
        workout_reminders.start()
        app.state.processor = processor
        app.state.rest_timer_notifications = rest_timer_notifications
        await processor.start()
        try:
            yield
        finally:
            await workout_reminders.stop()
            await rest_timer_notifications.stop()
            await processor.stop()

    # The interactive docs describe every endpoint, so a public server keeps them off by default.
    docs = settings.api_docs
    app = FastAPI(
        title="Relay",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.state.login_throttle = LoginThrottle()
    app.state.save_rate_limiter = SaveRateLimiter()
    app.add_middleware(CsrfOriginMiddleware)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if not isinstance(detail, dict) or "error" not in detail:
            detail = {"error": {"code": "http_error", "message": str(detail)}}
        return JSONResponse(status_code=exc.status_code, content=detail, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = exc.errors()
        for detail in details:
            detail.pop("ctx", None)
            # Malformed non-JSON requests can carry bytes, which JSONResponse cannot encode.
            if isinstance(detail.get("input"), bytes):
                detail.pop("input")
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Request validation failed.",
                    "details": details,
                }
            },
        )

    # Public routes are registered directly on the app (health) or through the auth router.
    # Everything else hangs off a router that requires a signed-in user, so a new endpoint is
    # protected unless someone deliberately moves it here.
    protected = APIRouter(dependencies=[Depends(get_current_user)])
    video = APIRouter(prefix="/api/sessions", dependencies=[Depends(require_video_access)])

    @app.get("/api/health", response_model=HealthRead)
    def health() -> HealthRead:
        return HealthRead(
            status="ok",
            upload_concurrency=settings.upload_concurrency,
            youtube_mock_mode=settings.youtube_mock_mode,
        )

    @protected.get("/api/notifications/push/config", response_model=PushConfigRead)
    def push_config() -> PushConfigRead:
        enabled = push_available(settings)
        return PushConfigRead(
            enabled=enabled, public_key=vapid_public_key(settings) if enabled else None
        )

    @protected.post("/api/notifications/push/subscriptions", status_code=204)
    async def save_push_subscription(
        payload: PushSubscriptionCreate,
        request: Request,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> None:
        subscription = db.scalar(
            select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
        )
        reassigned = False
        if subscription:
            # A browser endpoint belongs to whoever registered it last (shared device, new login).
            reassigned = subscription.user_id != user.id
            subscription.user_id = user.id
            subscription.p256dh = payload.p256dh
            subscription.auth = payload.auth
        else:
            db.add(PushSubscription(user_id=user.id, **payload.model_dump()))
        db.commit()
        if reassigned:
            request.app.state.rest_timer_notifications.cancel_endpoint(payload.endpoint)
            request.app.state.workout_reminders.cancel(endpoint=payload.endpoint)

    @protected.delete("/api/notifications/push/subscriptions", status_code=204)
    async def delete_push_subscription(
        payload: PushSubscriptionDelete,
        request: Request,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> None:
        subscription = db.scalar(
            select(PushSubscription).where(
                PushSubscription.endpoint == payload.endpoint,
                PushSubscription.user_id == user.id,
            )
        )
        if subscription:
            db.delete(subscription)
            db.commit()
            request.app.state.rest_timer_notifications.cancel_endpoint(payload.endpoint)
            request.app.state.workout_reminders.cancel(endpoint=payload.endpoint, user_id=user.id)

    @protected.post("/api/notifications/push/test", status_code=204)
    def send_test_push_notification(user: CurrentUser) -> None:
        send_push_notification(
            SessionLocal,
            settings,
            title="Relay alerts are ready",
            body="This phone will be notified when YouTube finishes processing a workout.",
            user_id=user.id,
        )

    @protected.put("/api/notifications/push/rest-timer", status_code=204)
    async def schedule_rest_timer_notification(
        payload: RestTimerNotificationCreate,
        request: Request,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> None:
        if not owns_subscription(db, user.id, payload.endpoint):
            raise api_error(404, "push_subscription_not_found", "This phone is not subscribed.")
        request.app.state.rest_timer_notifications.schedule(**payload.model_dump(), user_id=user.id)

    @protected.post("/api/notifications/push/rest-timer/cancel", status_code=204)
    async def cancel_rest_timer_notification(
        payload: RestTimerNotificationCancel,
        request: Request,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> None:
        if owns_subscription(db, user.id, payload.endpoint):
            request.app.state.rest_timer_notifications.cancel(**payload.model_dump())

    @protected.put("/api/notifications/push/active-workout", status_code=204)
    def schedule_workout_reminder(
        payload: ActiveWorkoutReminderCreate,
        request: Request,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> None:
        if not owns_subscription(db, user.id, payload.endpoint):
            raise api_error(404, "push_subscription_not_found", "This phone is not subscribed.")
        request.app.state.workout_reminders.schedule(**payload.model_dump(), user_id=user.id)

    @protected.post("/api/notifications/push/active-workout/cancel", status_code=204)
    def cancel_workout_reminder(
        payload: RestTimerNotificationCancel,
        request: Request,
        user: CurrentUser,
    ) -> None:
        request.app.state.workout_reminders.cancel(**payload.model_dump(), user_id=user.id)

    @video.post("", response_model=SessionRead, status_code=201)
    def create_session(
        payload: SessionCreate, user: CurrentUser, db: Session = Depends(get_db)
    ) -> WorkoutSession:
        try:
            connection = require_connection(db, settings, user.id)
        except YouTubeConnectionError as error:
            raise api_error(409, "youtube_connection_required", str(error)) from error
        session = WorkoutSession(
            user_id=user.id,
            youtube_channel_id=connection.channel_id if connection else None,
            **payload.model_dump(),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @video.get("", response_model=list[SessionRead])
    def list_sessions(user: CurrentUser, db: Session = Depends(get_db)) -> list[WorkoutSession]:
        return list(
            db.scalars(
                select(WorkoutSession)
                .where(WorkoutSession.user_id == user.id)
                .options(
                    selectinload(WorkoutSession.clips), selectinload(WorkoutSession.timestamps)
                )
                .order_by(WorkoutSession.workout_date.desc(), WorkoutSession.created_at.desc())
            )
        )

    @video.get("/{session_id}", response_model=SessionRead)
    def get_session(
        session_id: str, user: CurrentUser, db: Session = Depends(get_db)
    ) -> WorkoutSession:
        return load_session(db, user.id, session_id)

    @video.delete("/{session_id}", status_code=204)
    def delete_session(session_id: str, user: CurrentUser, db: Session = Depends(get_db)) -> None:
        session = load_session(db, user.id, session_id)
        if session.status in {
            SessionStatus.QUEUED,
            SessionStatus.NORMALIZING,
            SessionStatus.STITCHING,
            SessionStatus.UPLOADING_TO_YOUTUBE,
            SessionStatus.YOUTUBE_PROCESSING,
        }:
            raise api_error(409, "session_processing", "A processing session cannot be deleted.")
        db.delete(session)
        db.commit()
        remove_session_files(session_id, settings)

    @video.post("/{session_id}/clips", response_model=ClipRead)
    async def upload_clip(
        session_id: str,
        user: CurrentUser,
        client_clip_id: Annotated[str, Form(min_length=1, max_length=100)],
        order_index: Annotated[int, Form(ge=0)],
        file: Annotated[UploadFile, File(...)],
        exercise_label: Annotated[str | None, Form(max_length=200)] = None,
        db: Session = Depends(get_db),
    ) -> Clip:
        session = load_session(db, user.id, session_id)
        if not can_accept_uploads(session):
            raise api_error(
                409, "uploads_not_allowed", "This session is no longer accepting uploads."
            )
        if order_index >= session.expected_clip_count:
            raise api_error(
                422, "invalid_order", "Clip order index is outside this session's expected range."
            )
        existing = db.scalar(
            select(Clip).where(Clip.session_id == session_id, Clip.client_clip_id == client_clip_id)
        )
        if existing:
            # A successful first request wins; the same client ID never creates a duplicate clip.
            return existing
        occupied_order = db.scalar(
            select(Clip.id).where(Clip.session_id == session_id, Clip.order_index == order_index)
        )
        if occupied_order:
            raise api_error(
                409, "duplicate_order", "Another clip already uses this order position."
            )
        existing_bytes = db.scalar(
            select(func.coalesce(func.sum(Clip.file_size), 0)).where(
                Clip.session_id == session_id, Clip.upload_status == ClipUploadStatus.UPLOADED
            )
        )
        try:
            stored = await stream_upload_to_disk(
                upload=file,
                session_id=session_id,
                existing_session_bytes=int(existing_bytes or 0),
                settings=settings,
            )
        except UploadValidationError as error:
            session.status = SessionStatus.UPLOAD_FAILED
            db.commit()
            raise api_error(400, error.code, error.message) from error

        if (int(existing_bytes or 0) + stored.file_size) > settings.max_session_size_bytes:
            stored.path.unlink(missing_ok=True)
            session.status = SessionStatus.UPLOAD_FAILED
            db.commit()
            raise api_error(413, "session_too_large", "This upload exceeds the session size limit.")

        clip = Clip(
            client_clip_id=client_clip_id,
            session_id=session_id,
            original_filename=stored.original_filename,
            stored_filename=stored.stored_filename,
            order_index=order_index,
            exercise_label=exercise_label.strip() or None if exercise_label else None,
            file_size=stored.file_size,
            upload_status=ClipUploadStatus.UPLOADED,
            duration_ms=stored.duration_ms,
            original_path=str(stored.path),
        )
        try:
            db.add(clip)
            db.flush()
            session.uploaded_clip_count = (
                db.scalar(
                    select(func.count(Clip.id)).where(
                        Clip.session_id == session_id,
                        Clip.upload_status == ClipUploadStatus.UPLOADED,
                    )
                )
                or 0
            )
            session.status = SessionStatus.UPLOADING
            db.commit()
            db.refresh(clip)
            return clip
        except IntegrityError as error:
            db.rollback()
            stored.path.unlink(missing_ok=True)
            # Concurrent retries can hit either unique constraint.
            # Preserve the existing idempotent clip if present.
            existing = db.scalar(
                select(Clip).where(
                    Clip.session_id == session_id, Clip.client_clip_id == client_clip_id
                )
            )
            if existing:
                return existing
            raise api_error(
                409, "duplicate_order", "Another clip already uses this order position."
            ) from error

    @video.patch("/{session_id}/clips/{clip_id}", response_model=ClipRead)
    def patch_clip(
        session_id: str,
        clip_id: str,
        payload: ClipPatch,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> Clip:
        session = load_session(db, user.id, session_id)
        if not can_accept_uploads(session):
            raise api_error(
                409, "clips_locked", "Clips cannot be changed after processing is queued."
            )
        clip = db.get(Clip, clip_id)
        if not clip or clip.session_id != session.id:
            raise api_error(404, "clip_not_found", "Clip was not found in this session.")
        clip.exercise_label = payload.exercise_label
        db.commit()
        db.refresh(clip)
        return clip

    @video.delete("/{session_id}/clips/{clip_id}", status_code=204)
    def delete_clip(
        session_id: str, clip_id: str, user: CurrentUser, db: Session = Depends(get_db)
    ) -> None:
        session = load_session(db, user.id, session_id)
        if not can_accept_uploads(session):
            raise api_error(
                409, "clips_locked", "Clips cannot be changed after processing is queued."
            )
        clip = db.get(Clip, clip_id)
        if not clip or clip.session_id != session.id:
            raise api_error(404, "clip_not_found", "Clip was not found in this session.")
        path = Path(clip.original_path) if clip.original_path else None
        db.delete(clip)
        db.flush()
        session.uploaded_clip_count = (
            db.scalar(
                select(func.count(Clip.id)).where(
                    Clip.session_id == session_id, Clip.upload_status == ClipUploadStatus.UPLOADED
                )
            )
            or 0
        )
        db.commit()
        if path:
            path.unlink(missing_ok=True)

    @video.post("/{session_id}/clips/reorder", response_model=SessionRead)
    def reorder_clips(
        session_id: str,
        payload: ReorderRequest,
        user: CurrentUser,
        db: Session = Depends(get_db),
    ) -> WorkoutSession:
        session = load_session(db, user.id, session_id)
        if not can_accept_uploads(session):
            raise api_error(
                409, "clips_locked", "Clips cannot be changed after processing is queued."
            )
        clips = sorted(session.clips, key=lambda clip: clip.order_index)
        supplied_ids = [item.clip_id for item in payload.clips]
        supplied_indexes = [item.order_index for item in payload.clips]
        if set(supplied_ids) != {clip.id for clip in clips} or len(supplied_ids) != len(
            set(supplied_ids)
        ):
            raise api_error(
                422, "invalid_reorder", "Reorder must include every session clip exactly once."
            )
        if sorted(supplied_indexes) != list(range(len(clips))):
            raise api_error(
                422, "invalid_reorder", "Order indexes must form a complete zero-based sequence."
            )
        for clip in clips:
            clip.order_index = -clip.order_index - 1
        db.flush()
        requested = {item.clip_id: item.order_index for item in payload.clips}
        for clip in clips:
            clip.order_index = requested[clip.id]
        db.commit()
        return load_session(db, user.id, session_id)

    @video.post("/{session_id}/process", response_model=SessionRead, status_code=202)
    def process_session(
        session_id: str, user: CurrentUser, db: Session = Depends(get_db)
    ) -> WorkoutSession:
        session = load_session(db, user.id, session_id)
        check_youtube_connection(db, settings, session)
        if session.status in {
            SessionStatus.QUEUED,
            SessionStatus.NORMALIZING,
            SessionStatus.STITCHING,
            SessionStatus.UPLOADING_TO_YOUTUBE,
            SessionStatus.YOUTUBE_PROCESSING,
        }:
            raise api_error(409, "already_processing", "This session is already processing.")
        if session.status == SessionStatus.COMPLETE:
            raise api_error(409, "already_complete", "This session has already completed.")
        if session.status in {SessionStatus.FAILED, SessionStatus.CANCELLED}:
            raise api_error(
                409, "use_retry_or_new_session", "Use retry processing or create a new session."
            )
        try:
            validate_batch_ready(session)
        except ProcessingValidationError as error:
            raise api_error(409, "incomplete_batch", str(error)) from error
        session.status = SessionStatus.QUEUED
        session.processing_error = None
        db.commit()
        app.state.processor.enqueue(session.id)
        return load_session(db, user.id, session.id)

    @video.post("/{session_id}/retry-processing", response_model=SessionRead, status_code=202)
    def retry_processing(
        session_id: str, user: CurrentUser, db: Session = Depends(get_db)
    ) -> WorkoutSession:
        session = load_session(db, user.id, session_id)
        check_youtube_connection(db, settings, session)
        if session.status != SessionStatus.FAILED:
            raise api_error(409, "not_failed", "Only failed sessions can be retried.")
        try:
            validate_batch_ready(session)
        except ProcessingValidationError as error:
            raise api_error(409, "incomplete_batch", str(error)) from error
        session.status = SessionStatus.QUEUED
        session.processing_error = None
        db.commit()
        app.state.processor.enqueue(session.id)
        return load_session(db, user.id, session.id)

    @video.post(
        "/{session_id}/retry-youtube-processing",
        response_model=SessionRead,
        status_code=202,
    )
    def retry_youtube_processing(
        session_id: str, user: CurrentUser, db: Session = Depends(get_db)
    ) -> WorkoutSession:
        session = load_session(db, user.id, session_id)
        check_youtube_connection(db, settings, session)
        if session.status != SessionStatus.FAILED or not session.youtube_video_id:
            raise api_error(
                409,
                "not_youtube_processing_failure",
                "Only a failed session with an uploaded YouTube video can be checked again.",
            )
        session.status = SessionStatus.YOUTUBE_PROCESSING
        session.processing_error = None
        db.commit()
        return load_session(db, user.id, session.id)

    @video.post("/{session_id}/cancel", response_model=SessionRead)
    def cancel_session(
        session_id: str, user: CurrentUser, db: Session = Depends(get_db)
    ) -> WorkoutSession:
        session = load_session(db, user.id, session_id)
        if not can_accept_uploads(session):
            raise api_error(
                409, "cannot_cancel", "Only a session still uploading can be cancelled."
            )
        session.status = SessionStatus.CANCELLED
        session.processing_error = None
        db.commit()
        return load_session(db, user.id, session.id)

    app.include_router(auth_router)
    app.include_router(profile_router)
    app.include_router(admin_router)
    app.include_router(feedback_router)
    app.include_router(admin_feedback_router)
    app.include_router(sharing_router)
    app.include_router(presence_router)
    app.include_router(protected)
    app.include_router(video)
    app.include_router(tracker_router)
    app.include_router(home_layout_router)
    app.include_router(youtube_router)

    frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/", FrontendFiles(directory=frontend_dist, html=True), name="frontend")

    return app


app = create_app()
