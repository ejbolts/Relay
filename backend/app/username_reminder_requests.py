"""Forgotten usernames: a signed-out person asks the administrators to tell them their username.

There is no email address to send it to, so the person gives the name on their profile. Display
names are unique, so that normally flags one account for the admin console; accounts that shared a
name before names had to be unique are all flagged. The username is never shown to
the person asking, and nothing about the account changes; an admin passes the username on.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .accounts import comparable_display_name, no_store
from .auth import (
    AppSettings,
    LoginThrottle,
    as_utc,
    client_ip,
    get_login_throttle,
    require_admin,
    utc_now,
)
from .database import SessionLocal, get_db
from .errors import api_error
from .models import User
from .password_reset_requests import (
    MAX_REQUESTS_PER_ADDRESS,
    PasswordResetRequestRead,
    notify_admins,
    open_condition,
    open_since,
    too_many_requests,
)

DbDependency = Annotated[Session, Depends(get_db)]
Throttle = Annotated[LoginThrottle, Depends(get_login_throttle)]

username_request_router = APIRouter(
    prefix="/api/auth", tags=["auth"], dependencies=[Depends(no_store)]
)
admin_username_request_router = APIRouter(
    prefix="/api/admin/username-reminder-requests",
    tags=["admin"],
    dependencies=[Depends(no_store), Depends(require_admin)],
)


class UsernameReminderRequestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class UsernameReminderRequestRead(PasswordResetRequestRead):
    """The same details as a password reset request."""


def open_username_request_time(user: User, now: datetime | None = None) -> datetime | None:
    """When the account asked for its username, while that request is still waiting."""
    return open_since(user.username_reminder_requested_at, user, now)


@username_request_router.post("/username-reminder-request", status_code=204)
def request_username_reminder(
    payload: UsernameReminderRequestCreate,
    request: Request,
    background: BackgroundTasks,
    db: DbDependency,
    settings: AppSettings,
    throttle: Throttle,
) -> None:
    """Tell the admins someone forgot their username.

    The reply is the same whether or not any account has that name, so the form cannot be used to
    discover accounts, and one address may only ask a few times. Phone alerts go out only after the
    reply has been sent.
    """
    ip_key = f"username-reminder-request:ip:{client_ip(request)}"
    if throttle.is_blocked(ip_key, max_failures=MAX_REQUESTS_PER_ADDRESS):
        raise too_many_requests()
    throttle.record_failure(ip_key)
    wanted = comparable_display_name(payload.name)
    if not wanted:
        return
    matching = [
        user_id
        for user_id, display_name in db.execute(
            select(User.id, User.display_name).where(User.disabled_at.is_(None))
        )
        if comparable_display_name(display_name) == wanted
    ]
    if not matching:
        return
    alerts = []
    for user in db.scalars(select(User).where(User.id.in_(matching))):
        # Asking again keeps the first time, so the admin sees how long the person has waited.
        if open_username_request_time(user) is None:
            user.username_reminder_requested_at = utc_now()
            alerts.append((user.id, user.username, user.display_name))
    if not alerts:
        return
    db.commit()
    for user_id, username, display_name in alerts:
        background.add_task(
            notify_admins,
            SessionLocal,
            settings,
            user_id=user_id,
            title="Username request",
            body=f"{display_name} asked for their username: @{username}.",
            tag=f"username-reminder-{user_id}",
        )


@admin_username_request_router.get("", response_model=list[UsernameReminderRequestRead])
def list_username_reminder_requests(db: DbDependency) -> list[UsernameReminderRequestRead]:
    users = db.scalars(
        select(User)
        .where(open_condition(User.username_reminder_requested_at))
        .order_by(User.username_reminder_requested_at.desc(), User.username)
    )
    return [
        UsernameReminderRequestRead(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            requested_at=as_utc(user.username_reminder_requested_at),
        )
        for user in users
    ]


@admin_username_request_router.delete("/{user_id}", status_code=204)
def dismiss_username_reminder_request(user_id: str, db: DbDependency) -> None:
    """Clear a request once the admin has passed the username on, or it was not theirs."""
    user = db.get(User, user_id)
    if user is None:
        raise api_error(404, "user_not_found", "That account was not found.")
    if user.username_reminder_requested_at is not None:
        user.username_reminder_requested_at = None
        db.commit()
