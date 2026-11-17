"""Private app feedback, submitted by signed-in users and read only by administrators."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from .account_limits import limit_save_rate
from .accounts import no_store
from .auth import AdminUser, CurrentUser, as_utc, get_current_user, require_admin
from .database import get_db
from .errors import api_error
from .models import AppFeedback, User, utc_now

Db = Annotated[Session, Depends(get_db)]
feedback_router = APIRouter(
    prefix="/api/feedback", dependencies=[Depends(get_current_user), Depends(limit_save_rate)]
)
admin_feedback_router = APIRouter(
    prefix="/api/admin/feedback", dependencies=[Depends(require_admin)]
)


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    submission_id: UUID

    @field_validator("message")
    @classmethod
    def nonblank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Write some feedback before sending.")
        return value.strip()


class FeedbackReceipt(BaseModel):
    id: str


class AdminFeedbackRead(FeedbackReceipt):
    username: str
    message: str
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None


class FeedbackSummary(BaseModel):
    open: int


class FeedbackResolution(BaseModel):
    resolved: bool


@feedback_router.post("", response_model=FeedbackReceipt, status_code=201)
def submit_feedback(payload: FeedbackCreate, user: CurrentUser, db: Db, response: Response):
    no_store(response)
    submission_id = str(payload.submission_id)

    def existing():
        return db.scalar(
            select(AppFeedback).where(
                AppFeedback.user_id == user.id, AppFeedback.submission_id == submission_id
            )
        )

    saved = existing()
    if saved:
        return FeedbackReceipt(id=saved.id)
    # Feedback is small, but do not allow unbounded storage from a scripted account.
    count = db.scalar(
        select(func.count()).select_from(AppFeedback).where(AppFeedback.user_id == user.id)
    )
    if (count or 0) >= 100:
        raise api_error(
            429, "feedback_not_saved", "Couldn't send feedback right now. Try again later."
        )
    saved = AppFeedback(user_id=user.id, submission_id=submission_id, message=payload.message)
    db.add(saved)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        saved = existing()
        if not saved:
            raise
    return FeedbackReceipt(id=saved.id)


def admin_feedback_query():
    resolver = aliased(User)
    return (
        select(AppFeedback, User.username, resolver.username)
        .join(User, AppFeedback.user_id == User.id)
        .outerjoin(resolver, AppFeedback.resolved_by_id == resolver.id)
    )


def admin_feedback_read(item: AppFeedback, username: str, resolver: str | None):
    return AdminFeedbackRead(
        id=item.id,
        username=username,
        message=item.message,
        created_at=as_utc(item.created_at),
        resolved_at=as_utc(item.resolved_at) if item.resolved_at else None,
        resolved_by=resolver if item.resolved_at else None,
    )


@admin_feedback_router.get("", response_model=list[AdminFeedbackRead])
def list_feedback(user: AdminUser, db: Db, response: Response):
    no_store(response)
    # Open messages come first, so older unresolved feedback is never pushed past the limit.
    rows = db.execute(
        admin_feedback_query()
        .order_by(
            AppFeedback.resolved_at.is_not(None),
            AppFeedback.created_at.desc(),
            AppFeedback.id.desc(),
        )
        .limit(100)
    )
    return [admin_feedback_read(*row) for row in rows]


@admin_feedback_router.get("/summary", response_model=FeedbackSummary)
def feedback_summary(user: AdminUser, db: Db, response: Response):
    no_store(response)
    count = db.scalar(
        select(func.count()).select_from(AppFeedback).where(AppFeedback.resolved_at.is_(None))
    )
    return FeedbackSummary(open=count or 0)


@admin_feedback_router.patch("/{feedback_id}", response_model=AdminFeedbackRead)
def resolve_feedback(
    feedback_id: str, payload: FeedbackResolution, user: AdminUser, db: Db, response: Response
):
    no_store(response)
    item = db.get(AppFeedback, feedback_id)
    if not item:
        raise api_error(404, "feedback_not_found", "That feedback no longer exists.")
    # Resolving twice keeps the first resolution, so a retried request reports the same result.
    if payload.resolved and item.resolved_at is None:
        item.resolved_at = utc_now()
        item.resolved_by_id = user.id
    elif not payload.resolved:
        item.resolved_at = None
        item.resolved_by_id = None
    db.commit()
    row = db.execute(admin_feedback_query().where(AppFeedback.id == item.id)).one()
    return admin_feedback_read(*row)
