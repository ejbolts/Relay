"""The native app's push registrations: one Expo push token per installed app and sign-in.

Each token is bound to the sign-in that registered it. Signing out of the app removes it, and
alerts only go to tokens whose sign-in is still current (`notifications.py`), so a token can never
outlive the session it belongs to, even when the app could not reach the server to remove it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .auth import AuthContextDependency, CurrentUser
from .database import get_db
from .errors import api_error
from .models import ExpoPushToken, UserSession
from .push_security import MAX_EXPO_PUSH_TOKENS
from .schemas import ExpoLocalReminderUpdate, ExpoPushTokenCreate, ExpoPushTokenDelete

DbDependency = Annotated[Session, Depends(get_db)]

expo_push_router = APIRouter(prefix="/api/notifications/expo")


def limit_token_changes(request: Request, user: CurrentUser) -> None:
    # Shares the web's allowance for alert changes.
    if not request.app.state.push_rate_limiter.allow(f"{user.id}:change", 60):
        raise api_error(429, "push_rate_limited", "Wait a moment before trying alerts again.")


def remove_ended_tokens(db: Session, user_id: str) -> None:
    """Drops the account's tokens whose sign-in has ended, so they no longer count."""
    current = select(UserSession.id).where(
        UserSession.user_id == user_id, UserSession.expires_at > datetime.now(UTC)
    )
    db.execute(
        delete(ExpoPushToken).where(
            ExpoPushToken.user_id == user_id,
            or_(ExpoPushToken.session_id.is_(None), ExpoPushToken.session_id.not_in(current)),
        )
    )


def remove_session_tokens(db: Session, session_id: str) -> None:
    """Called as a sign-in ends; the caller commits."""
    db.execute(delete(ExpoPushToken).where(ExpoPushToken.session_id == session_id))


def remove_account_tokens(db: Session, user_id: str) -> None:
    """Called as an account signs out everywhere or is deleted; the caller commits."""
    db.execute(delete(ExpoPushToken).where(ExpoPushToken.user_id == user_id))


@expo_push_router.post("/tokens", status_code=204, dependencies=[Depends(limit_token_changes)])
def save_expo_push_token(
    payload: ExpoPushTokenCreate,
    context: AuthContextDependency,
    user: CurrentUser,
    db: DbDependency,
) -> None:
    """Registers this app for alerts, or refreshes it; repeating it changes nothing else."""
    remove_ended_tokens(db, user.id)
    row = db.scalar(select(ExpoPushToken).where(ExpoPushToken.token == payload.token))
    if row is None or row.user_id != user.id:
        count = db.scalar(
            select(func.count()).select_from(ExpoPushToken).where(ExpoPushToken.user_id == user.id)
        )
        if count >= MAX_EXPO_PUSH_TOKENS:
            raise api_error(409, "push_device_limit", "The alert device limit has been reached.")
    if row is None:
        row = ExpoPushToken(token=payload.token)
        db.add(row)
    elif row.user_id != user.id:
        # A phone belongs to whoever signed in on it last; the last account's reminder state goes.
        row.local_reminder_workout = None
        row.local_reminder_due_ms = None
    row.user_id = user.id
    row.session_id = context.session.id
    row.platform = payload.platform
    row.local_alerts = payload.local_alerts
    db.commit()


@expo_push_router.delete("/tokens", status_code=204)
def delete_expo_push_token(
    payload: ExpoPushTokenDelete, context: AuthContextDependency, db: DbDependency
) -> None:
    # Works while a new password is required too, since signing out removes the token first.
    db.execute(
        delete(ExpoPushToken).where(
            ExpoPushToken.token == payload.token, ExpoPushToken.user_id == context.user.id
        )
    )
    db.commit()


@expo_push_router.put(
    "/tokens/local-reminder", status_code=204, dependencies=[Depends(limit_token_changes)]
)
def save_local_reminder(
    payload: ExpoLocalReminderUpdate, user: CurrentUser, db: DbDependency
) -> None:
    """Records the "Still working out?" the phone has scheduled, so the server skips that phone."""
    row = db.scalar(
        select(ExpoPushToken).where(
            ExpoPushToken.token == payload.token, ExpoPushToken.user_id == user.id
        )
    )
    if row is None:
        raise api_error(404, "push_token_not_found", "This phone is not registered for alerts.")
    scheduled = payload.workout_started_at is not None and payload.due_at_ms is not None
    row.local_reminder_workout = payload.workout_started_at if scheduled else None
    row.local_reminder_due_ms = payload.due_at_ms if scheduled else None
    db.commit()
