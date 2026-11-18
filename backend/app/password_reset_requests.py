"""Forgotten passwords: a signed-out person asks the administrators for a temporary password.

A request only flags the account for the admin console. It never changes the password, so
naming someone else's username cannot lock them out; the admin still decides whether to reset.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import ColumnElement, and_, select
from sqlalchemy.orm import Session

from .accounts import no_store
from .auth import (
    LoginThrottle,
    as_utc,
    client_ip,
    get_login_throttle,
    require_admin,
    utc_now,
)
from .database import get_db
from .errors import api_error
from .models import User

DbDependency = Annotated[Session, Depends(get_db)]
Throttle = Annotated[LoginThrottle, Depends(get_login_throttle)]

# An unanswered request stops showing after a week; asking again then starts a new one.
REQUEST_LIFETIME = timedelta(days=7)
# Requests one address may send within the sign-in throttle's window.
MAX_REQUESTS_PER_ADDRESS = 5

request_router = APIRouter(prefix="/api/auth", tags=["auth"], dependencies=[Depends(no_store)])
admin_request_router = APIRouter(
    prefix="/api/admin/password-reset-requests",
    tags=["admin"],
    dependencies=[Depends(no_store), Depends(require_admin)],
)


class PasswordResetRequestCreate(BaseModel):
    username: str = Field(min_length=1, max_length=320)


class PasswordResetRequestRead(BaseModel):
    user_id: str
    username: str
    display_name: str
    requested_at: datetime


def open_request_cutoff(now: datetime | None = None) -> datetime:
    return (now or utc_now()) - REQUEST_LIFETIME


def open_request_time(user: User, now: datetime | None = None) -> datetime | None:
    """When the account asked for a reset, while that request is still waiting for an admin."""
    requested = user.password_reset_requested_at
    if requested is None or user.disabled_at is not None:
        return None
    requested = as_utc(requested)
    return requested if requested > open_request_cutoff(now) else None


def open_request_condition() -> ColumnElement[bool]:
    return and_(
        User.password_reset_requested_at > open_request_cutoff(),
        User.disabled_at.is_(None),
    )


def too_many_requests():
    return api_error(429, "too_many_attempts", "Too many requests. Try again later.")


@request_router.post("/password-reset-request", status_code=204)
def request_password_reset(
    payload: PasswordResetRequestCreate,
    request: Request,
    db: DbDependency,
    throttle: Throttle,
) -> None:
    """Tell the admins someone forgot their password.

    The reply is the same whether or not the username exists, so the form cannot be used to
    discover accounts. The per-address limit also keeps response timing from revealing it.
    """
    ip_key = f"password-reset-request:ip:{client_ip(request)}"
    if throttle.is_blocked(ip_key, max_failures=MAX_REQUESTS_PER_ADDRESS):
        raise too_many_requests()
    throttle.record_failure(ip_key)
    username = payload.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if user is None or user.disabled_at is not None:
        return
    # Asking again keeps the first time, so the admin sees how long the person has waited.
    if open_request_time(user) is None:
        user.password_reset_requested_at = utc_now()
        db.commit()


@admin_request_router.get("", response_model=list[PasswordResetRequestRead])
def list_password_reset_requests(db: DbDependency) -> list[PasswordResetRequestRead]:
    users = db.scalars(
        select(User)
        .where(open_request_condition())
        .order_by(User.password_reset_requested_at.desc(), User.username)
    )
    return [
        PasswordResetRequestRead(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            requested_at=as_utc(user.password_reset_requested_at),
        )
        for user in users
    ]


@admin_request_router.delete("/{user_id}", status_code=204)
def dismiss_password_reset_request(user_id: str, db: DbDependency) -> None:
    """Clear a request without changing the password, such as one the person did not send."""
    user = db.get(User, user_id)
    if user is None:
        raise api_error(404, "user_not_found", "That account was not found.")
    if user.password_reset_requested_at is not None:
        user.password_reset_requested_at = None
        db.commit()
