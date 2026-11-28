"""Train together: friends at the gym link their live workouts, and either phone logs for either.

A session links two to four friends. One member shows a code (an invite) that lasts five
minutes; scanning it is the consent, so joining is instant. Each member keeps their own live
draft (``active_workouts``); a partner's edit is applied as if it came from another of the
owner's devices, through the same three-way ``change_draft`` merge. The owner's apps receive it
through their existing draft sync, and nothing new is stored inside the draft.

A partner may change only the movements and the activity times of someone's draft, and never
creates, finishes, discards or replaces it. Every read and write re-checks that both accounts
are active members of the same session and are still friends.

Expired sessions and invites are ended lazily, when they are next read or written.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.orm import Session, aliased

from .active_workouts import DraftChange, change_draft
from .auth import CurrentUser, as_utc, get_current_user, hash_token
from .database import get_db
from .errors import api_error
from .exercise_merge import exercise_aliases
from .lift_comparison import lift_key
from .models import (
    ActiveWorkoutSync,
    Exercise,
    MachinePhoto,
    ProfileSharing,
    TrainingWorkout,
    TrainTogetherInvite,
    TrainTogetherMember,
    TrainTogetherSession,
    User,
    utc_now,
)
from .presence import hub
from .sharing import (
    ACCEPTED,
    PRIVATE,
    blocked_member_ids,
    can_view,
    find_friendship,
    friendships_of,
    photo_url,
)
from .tracker import hidden_exercise_ids
from .tracker_schemas import TrainedWithRead

MAX_MEMBERS = 4
INVITE_LIFETIME = timedelta(minutes=5)
SESSION_LIFETIME = timedelta(hours=12)
# How long the reason a session ended is reported, for one notice on each device.
ENDED_NOTICE = timedelta(minutes=10)
TOKEN = re.compile(r"[A-Za-z0-9_-]{16,64}")
# The top-level draft fields a partner may change; everything else stays the owner's.
PARTNER_FIELDS = frozenset({"movements", "updatedAt", "lastActiveAt", "inactiveFinishAt"})

Reason = Literal["left", "finished", "discarded", "expired", "unfriended"]
Db = Annotated[Session, Depends(get_db)]

router = APIRouter(prefix="/api/train-together", dependencies=[Depends(get_current_user)])


class TrainExercise(BaseModel):
    # The exercise's owner's id; exercise ids are per account.
    id: str
    name: str
    kind: str
    category: str
    muscle_group: str
    equipment: str | None = None
    # The viewer's own exercise that is the same lift, or None when they have none.
    same_as_exercise_id: str | None = None


class TrainPartnerWorkout(BaseModel):
    revision: int
    draft: dict[str, Any]
    exercises: list[TrainExercise]


class TrainMember(BaseModel):
    user_id: str
    username: str
    display_name: str
    photo_url: str | None = None
    is_self: bool
    joined_at: datetime
    # None for the caller (their app has their own draft) and for a partner with no workout.
    workout: TrainPartnerWorkout | None = None


class TrainSession(BaseModel):
    id: str
    started_at: datetime
    expires_at: datetime
    created_by: str
    max_members: int = MAX_MEMBERS
    # Active members, the caller first.
    members: list[TrainMember]


class TrainEnded(BaseModel):
    session_id: str
    reason: Reason
    by_user_id: str | None = None
    by_name: str | None = None


class TrainTogetherRead(BaseModel):
    session: TrainSession | None = None
    ended: TrainEnded | None = None


class TrainInviteRead(BaseModel):
    token: str
    expires_at: datetime
    session_id: str


class TrainJoin(BaseModel):
    # Any malformed code reads as expired, rather than as a validation error.
    token: str = Field(max_length=200)


class PartnerDraftChange(DraftChange):
    """A partner's edit: the same shape as a draft sync, checked by allowed_partner_change."""

    model_config = ConfigDict(extra="forbid")


class TrainPartnerWriteRead(BaseModel):
    revision: int
    draft: dict[str, Any] | None
    conflict: bool
    exercises: list[TrainExercise]


# Session state


def _active_members(db: Session, session_id: str) -> list[TrainTogetherMember]:
    return list(
        db.scalars(
            select(TrainTogetherMember)
            .where(
                TrainTogetherMember.session_id == session_id,
                TrainTogetherMember.left_at.is_(None),
            )
            .order_by(TrainTogetherMember.joined_at, TrainTogetherMember.user_id)
        )
    )


def _membership(db: Session, user_id: str) -> TrainTogetherMember | None:
    """The account's current member row, in a session that has not ended."""
    return db.scalar(
        select(TrainTogetherMember)
        .join(TrainTogetherSession, TrainTogetherSession.id == TrainTogetherMember.session_id)
        .where(
            TrainTogetherMember.user_id == user_id,
            TrainTogetherMember.left_at.is_(None),
            TrainTogetherSession.ended_at.is_(None),
        )
        .order_by(TrainTogetherMember.joined_at.desc())
        .limit(1)
    )


def _end(
    db: Session, session: TrainTogetherSession, reason: Reason, by: str | None, now: datetime
) -> set[str]:
    """End the session; everyone still in it leaves with the session's reason."""
    session.ended_at, session.ended_reason, session.ended_by = now, reason, by
    affected = set()
    for member in _active_members(db, session.id):
        member.left_at, member.left_reason = now, reason
        affected.add(member.user_id)
    return affected


def _leave(db: Session, member: TrainTogetherMember, reason: Reason, now: datetime) -> set[str]:
    """One member leaves; fewer than two left ends the session. Returns who to tell."""
    session = db.get(TrainTogetherSession, member.session_id)
    remaining = [
        other for other in _active_members(db, member.session_id) if other.user_id != member.user_id
    ]
    member.left_at, member.left_reason = now, reason
    affected = {member.user_id, *(other.user_id for other in remaining)}
    if session is not None and session.ended_at is None and len(remaining) < 2:
        _end(db, session, reason, member.user_id, now)
    return affected


def _has_live_invite(db: Session, session_id: str, now: datetime) -> bool:
    return any(
        as_utc(expires) > now
        for expires in db.scalars(
            select(TrainTogetherInvite.expires_at).where(
                TrainTogetherInvite.session_id == session_id,
                TrainTogetherInvite.used_at.is_(None),
            )
        )
    )


def _refresh(db: Session, session: TrainTogetherSession, now: datetime) -> set[str]:
    """End what has lapsed: the 12 hours, disabled members, or a lone creator's last invite."""
    if session.ended_at is not None:
        return set()
    if as_utc(session.expires_at) <= now:
        return _end(db, session, "expired", None, now)
    affected: set[str] = set()
    members = _active_members(db, session.id)
    for member in members:
        account = db.get(User, member.user_id)
        if account is None or account.disabled_at is not None:
            affected |= _leave(db, member, "left", now)
    if session.ended_at is not None:
        return affected
    members = _active_members(db, session.id)
    waiting = (
        len(members) == 1
        and members[0].user_id == session.created_by
        and _has_live_invite(db, session.id, now)
    )
    if len(members) < 2 and not waiting:
        affected |= _end(db, session, "expired", None, now)
    return affected


def _notify(db: Session, affected: set[str]) -> None:
    if affected:
        db.commit()
        hub.train_together_changed(*affected)


def current_membership(
    db: Session, user_id: str
) -> tuple[TrainTogetherSession, TrainTogetherMember] | None:
    """The account's live session, ending it first if it has lapsed."""
    member = _membership(db, user_id)
    if member is None:
        return None
    session = db.get(TrainTogetherSession, member.session_id)
    affected = _refresh(db, session, utc_now())
    _notify(db, affected)
    if session.ended_at is not None or member.left_at is not None:
        return None
    return session, member


def _draft_session(db: Session, user_id: str) -> str | None:
    row = db.get(ActiveWorkoutSync, user_id)
    return row.draft["clientSessionId"] if row and row.draft else None


# Friendship


def _friends(db: Session, user_id: str, other_id: str, blocked: set[str]) -> bool:
    """Accepted friends, neither has blocked the other, and the other account is enabled."""
    if other_id in blocked:
        return False
    friendship = find_friendship(db, user_id, other_id)
    other = db.get(User, other_id)
    return (
        friendship is not None
        and friendship.status == ACCEPTED
        and other is not None
        and other.disabled_at is None
    )


def _partner(
    db: Session, user: User, user_id: str
) -> tuple[TrainTogetherSession, TrainTogetherMember]:
    """The caller's active partner ``user_id``, re-checking membership and friendship."""
    refused = api_error(404, "train_not_partner", "You are not training with them now.")
    current = current_membership(db, user.id)
    if current is None or user_id == user.id:
        raise refused
    session, _ = current
    partner = next(
        (member for member in _active_members(db, session.id) if member.user_id == user_id), None
    )
    if partner is None or not _friends(db, user.id, user_id, blocked_member_ids(db, user.id)):
        raise refused
    return session, partner


# Exercises


def _same_lift_index(db: Session, viewer_id: str) -> dict[tuple[str, str], str]:
    """The viewer's exercise for each lift, matched as lift comparison matches them."""
    hidden = hidden_exercise_ids(db, viewer_id)
    rows = db.execute(
        select(Exercise.id, Exercise.name, Exercise.kind, Exercise.is_favorite).where(
            Exercise.user_id == viewer_id
        )
    ).all()
    index: dict[tuple[str, str], str] = {}
    # A visible, then favourite, exercise wins when the viewer has two of the same lift.
    for row in sorted(
        rows, key=lambda row: (row.id in hidden, not row.is_favorite, row.name.casefold(), row.id)
    ):
        index.setdefault((lift_key(row.name), str(row.kind)), row.id)
    return index


def _train_exercise(
    exercise: Exercise, index: dict[tuple[str, str], str], as_id: str | None = None
) -> TrainExercise:
    return TrainExercise(
        id=as_id or exercise.id,
        name=exercise.name,
        kind=str(exercise.kind),
        category=str(exercise.category),
        muscle_group=exercise.muscle_group,
        equipment=exercise.equipment,
        same_as_exercise_id=index.get((lift_key(exercise.name), str(exercise.kind))),
    )


def draft_exercises(
    db: Session, owner_id: str, viewer_id: str, draft: dict | None
) -> list[TrainExercise]:
    """Every exercise the owner's draft uses, with the viewer's matching lift."""
    ids = list(
        dict.fromkeys(movement["exerciseId"] for movement in (draft or {}).get("movements", []))
    )
    if not ids:
        return []
    merged = exercise_aliases(db, owner_id)
    resolved = {exercise_id: merged.get(exercise_id, exercise_id) for exercise_id in ids}
    owned = {
        exercise.id: exercise
        for exercise in db.scalars(
            select(Exercise).where(
                Exercise.user_id == owner_id, Exercise.id.in_(set(resolved.values()))
            )
        )
    }
    index = _same_lift_index(db, viewer_id)
    # Keep the id the draft refers to, even when the exercise has since been merged.
    return [
        _train_exercise(owned[resolved[exercise_id]], index, exercise_id)
        for exercise_id in ids
        if resolved[exercise_id] in owned
    ]


# Reading a session


def _ended(db: Session, user_id: str, now: datetime) -> TrainEnded | None:
    member = db.scalar(
        select(TrainTogetherMember)
        .where(TrainTogetherMember.user_id == user_id, TrainTogetherMember.left_at.is_not(None))
        .order_by(TrainTogetherMember.left_at.desc())
        .limit(1)
    )
    if member is None or as_utc(member.left_at) < now - ENDED_NOTICE:
        return None
    session = db.get(TrainTogetherSession, member.session_id)
    if session is None:
        return None
    if session.ended_at is not None and as_utc(session.ended_at) == as_utc(member.left_at):
        # Removed because the session ended: say why, and whose action it was.
        reason, by = session.ended_reason, session.ended_by
    else:
        # They left a session that carried on without them.
        reason, by = member.left_reason, user_id
    account = db.get(User, by) if by else None
    return TrainEnded(
        session_id=session.id,
        reason=reason or "left",
        by_user_id=account.id if account else None,
        by_name=account.display_name if account else None,
    )


def read_session(db: Session, user: User) -> TrainTogetherRead:
    now = utc_now()
    current = current_membership(db, user.id)
    if current is None:
        return TrainTogetherRead(session=None, ended=_ended(db, user.id, now))
    session, _ = current
    blocked = blocked_member_ids(db, user.id)
    members = _active_members(db, session.id)
    members.sort(key=lambda member: member.user_id != user.id)
    read: list[TrainMember] = []
    for member in members:
        account = db.get(User, member.user_id)
        is_self = member.user_id == user.id
        workout = None
        if not is_self and _friends(db, user.id, member.user_id, blocked):
            row = db.get(ActiveWorkoutSync, member.user_id)
            if row is not None and row.draft is not None:
                workout = TrainPartnerWorkout(
                    revision=row.revision,
                    draft=row.draft,
                    exercises=draft_exercises(db, member.user_id, user.id, row.draft),
                )
        read.append(
            TrainMember(
                user_id=account.id,
                username=account.username,
                display_name=account.display_name,
                photo_url=photo_url(account),
                is_self=is_self,
                joined_at=as_utc(member.joined_at),
                workout=workout,
            )
        )
    return TrainTogetherRead(
        session=TrainSession(
            id=session.id,
            started_at=as_utc(session.created_at),
            expires_at=as_utc(session.expires_at),
            created_by=session.created_by,
            members=read,
        ),
        ended=None,
    )


# Partner writes


def allowed_partner_change(stored: dict, change: DraftChange) -> bool:
    """Whether a partner may make this change to the owner's stored draft (contract rule 7).

    Only the movements and the activity times may change. The partner can never create,
    discard or replace a draft, send a prepared auto-save, or edit another workout session.
    """
    if change.base is None or change.draft is None or change.replace:
        return False
    # Even an invalid copy (which the draft sync drops silently) means the caller meant to send one.
    if "autoSave" in change.model_fields_set:
        return False
    session = stored.get("clientSessionId")
    if (
        change.base.get("clientSessionId") != session
        or change.draft.get("clientSessionId") != session
    ):
        return False
    missing = object()
    return all(
        change.base.get(key, missing) == change.draft.get(key, missing)
        for key in (change.base.keys() | change.draft.keys()) - PARTNER_FIELDS
    )


def _references(draft: dict) -> tuple[set[str], set[str]]:
    exercises: set[str] = set()
    photos: set[str] = set()
    for movement in draft.get("movements", []):
        exercises.add(movement["exerciseId"])
        photos.update(movement.get("machinePhotoIds") or [])
        photos.update(
            item["machine_photo_id"] for item in movement["sets"] if item.get("machine_photo_id")
        )
    return exercises, photos


def _owns_new_references(db: Session, owner_id: str, base: dict, draft: dict) -> bool:
    """A partner may add only the owner's own exercises and machine photos."""
    old_exercises, old_photos = _references(base)
    new_exercises, new_photos = _references(draft)
    added_exercises, added_photos = new_exercises - old_exercises, new_photos - old_photos
    if added_exercises:
        owned = set(
            db.scalars(
                select(Exercise.id).where(
                    Exercise.user_id == owner_id, Exercise.id.in_(added_exercises)
                )
            )
        )
        if owned != added_exercises:
            return False
    if added_photos:
        owned = set(
            db.scalars(
                select(MachinePhoto.id).where(
                    MachinePhoto.user_id == owner_id, MachinePhoto.id.in_(added_photos)
                )
            )
        )
        if owned != added_photos:
            return False
    return True


# Hooks from existing code, each called after that code has committed


def draft_changed(db: Session, user_id: str, draft: dict | None) -> None:
    """Keep the member's draft session current, leave on discard, and tell the partners."""
    member = _membership(db, user_id)
    if member is None:
        return
    if draft is None:
        affected = _leave(db, member, "discarded", utc_now())
    else:
        member.draft_session_id = draft["clientSessionId"]
        affected = {other.user_id for other in _active_members(db, member.session_id)}
    _notify(db, affected)


def workout_saved(db: Session, user_id: str, draft_session_id: str | None, workout_id: str) -> None:
    """Link a workout saved from a draft to its member row, and leave the session as finished.

    This also links a workout saved after its session ended (the partner finished first).
    """
    if not draft_session_id:
        return
    member = db.scalar(
        select(TrainTogetherMember)
        .where(
            TrainTogetherMember.user_id == user_id,
            TrainTogetherMember.draft_session_id == draft_session_id,
            TrainTogetherMember.workout_id.is_(None),
        )
        .order_by(TrainTogetherMember.joined_at.desc())
        .limit(1)
    )
    if member is None:
        return
    member.workout_id = workout_id
    affected = {user_id}
    session = db.get(TrainTogetherSession, member.session_id)
    if member.left_at is None and session is not None and session.ended_at is None:
        affected |= _leave(db, member, "finished", utc_now())
    db.commit()
    hub.train_together_changed(*affected)


def friendship_ended(db: Session, user_id: str, other_id: str) -> None:
    """Unfriending or blocking a partner: the member who did it leaves their shared session."""
    member = _membership(db, user_id)
    if member is None:
        return
    if any(other.user_id == other_id for other in _active_members(db, member.session_id)):
        _notify(db, _leave(db, member, "unfriended", utc_now()))


def account_removed(db: Session, user_id: str) -> None:
    """Before an account is deleted, it leaves its session so its partners are told."""
    member = _membership(db, user_id)
    if member is not None:
        _notify(db, _leave(db, member, "left", utc_now()))


def account_rows(user_id: str) -> tuple:
    """Deletes for a deleted account's rows, in order (explicit, like the other tables)."""
    created = select(TrainTogetherSession.id).where(TrainTogetherSession.created_by == user_id)
    return (
        delete(TrainTogetherInvite).where(
            or_(
                TrainTogetherInvite.created_by == user_id,
                TrainTogetherInvite.session_id.in_(created),
            )
        ),
        update(TrainTogetherInvite)
        .where(TrainTogetherInvite.used_by == user_id)
        .values(used_by=None),
        delete(TrainTogetherMember).where(
            or_(
                TrainTogetherMember.user_id == user_id,
                TrainTogetherMember.session_id.in_(created),
            )
        ),
        update(TrainTogetherSession)
        .where(TrainTogetherSession.ended_by == user_id)
        .values(ended_by=None),
        delete(TrainTogetherSession).where(TrainTogetherSession.created_by == user_id),
    )


# Saved workouts: who you trained with


def attach_trained_with[T](db: Session, viewer: User, workouts: T) -> T:
    """Set ``trained_with`` and ``trained_with_count`` on a page of workouts, in one query.

    The count is everyone who was in the session at the same time as the workout's owner; the
    list holds only the viewer and members the viewer may see.
    """
    items = [workouts] if isinstance(workouts, TrainingWorkout) else list(workouts)
    ids = [workout.id for workout in items]
    if not ids:
        return workouts
    mine, other = aliased(TrainTogetherMember), aliased(TrainTogetherMember)
    rows = db.execute(
        select(mine.workout_id, User, ProfileSharing)
        .join(
            other,
            and_(other.session_id == mine.session_id, other.user_id != mine.user_id),
        )
        .join(User, User.id == other.user_id)
        .outerjoin(ProfileSharing, ProfileSharing.user_id == other.user_id)
        .where(
            mine.workout_id.in_(ids),
            or_(mine.left_at.is_(None), other.joined_at < mine.left_at),
            or_(other.left_at.is_(None), other.left_at > mine.joined_at),
        )
        .order_by(other.joined_at, other.user_id)
    ).all()
    found: dict[str, dict[str, User | None]] = {}
    if rows:
        blocked = blocked_member_ids(db, viewer.id)
        friendships = friendships_of(db, viewer.id)
    for workout_id, member, sharing in rows:
        visible = member.id == viewer.id or (
            member.disabled_at is None
            and member.id not in blocked
            and sharing is not None
            and sharing.visibility != PRIVATE
            and can_view(viewer, member, sharing, friendships.get(member.id))
        )
        found.setdefault(workout_id, {})[member.id] = member if visible else None
    for workout in items:
        members = found.get(workout.id, {})
        workout.trained_with = [
            TrainedWithRead(
                user_id=member.id,
                display_name=member.display_name,
                username=member.username,
                photo_url=photo_url(member),
            )
            for member in members.values()
            if member is not None
        ]
        workout.trained_with_count = len(members)
    return workouts


# Routes


@router.get("", response_model=TrainTogetherRead)
def get_train_together(user: CurrentUser, db: Db) -> TrainTogetherRead:
    return read_session(db, user)


@router.post("/invite", response_model=TrainInviteRead)
def create_invite(user: CurrentUser, db: Db) -> TrainInviteRead:
    now = utc_now()
    current = current_membership(db, user.id)
    if current is None:
        session = TrainTogetherSession(
            created_by=user.id, created_at=now, expires_at=now + SESSION_LIFETIME
        )
        db.add(session)
        db.flush()
        db.add(
            TrainTogetherMember(
                session_id=session.id,
                user_id=user.id,
                joined_at=now,
                draft_session_id=_draft_session(db, user.id),
            )
        )
    else:
        session, _ = current
        if len(_active_members(db, session.id)) >= MAX_MEMBERS:
            raise api_error(409, "train_full", "This session is full.")
    # A new code replaces the creator's unused one for this session.
    for previous in db.scalars(
        select(TrainTogetherInvite).where(
            TrainTogetherInvite.session_id == session.id,
            TrainTogetherInvite.created_by == user.id,
            TrainTogetherInvite.used_at.is_(None),
        )
    ):
        db.delete(previous)
    token = secrets.token_urlsafe(16)
    expires_at = now + INVITE_LIFETIME
    db.add(
        TrainTogetherInvite(
            token_hash=hash_token(token),
            session_id=session.id,
            created_by=user.id,
            created_at=now,
            expires_at=expires_at,
        )
    )
    db.commit()
    return TrainInviteRead(token=token, expires_at=expires_at, session_id=session.id)


@router.post("/join", response_model=TrainTogetherRead)
def join(payload: TrainJoin, user: CurrentUser, db: Db) -> TrainTogetherRead:
    now = utc_now()
    expired = api_error(404, "train_invite_expired", "This code has expired. Ask for a new one.")
    invite = (
        db.get(TrainTogetherInvite, hash_token(payload.token))
        if TOKEN.fullmatch(payload.token)
        else None
    )
    if invite is None or invite.used_at is not None or as_utc(invite.expires_at) <= now:
        raise expired
    session = db.get(TrainTogetherSession, invite.session_id)
    affected = _refresh(db, session, now)
    if session.ended_at is not None:
        _notify(db, affected)
        raise expired
    if invite.created_by == user.id:
        raise api_error(
            400, "train_own_invite", "That's your own code. Ask your friend to scan it."
        )
    members = _active_members(db, session.id)
    if any(member.user_id == user.id for member in members):
        _notify(db, affected)
        return read_session(db, user)
    blocked = blocked_member_ids(db, user.id)
    for member in members:
        if not _friends(db, user.id, member.user_id, blocked):
            account = db.get(User, member.user_id)
            error = api_error(
                403,
                "train_not_friends",
                f"Add {account.display_name} as a friend to train together.",
            )
            error.detail["error"]["member"] = {"user_id": account.id, "name": account.display_name}
            raise error
    if len(members) >= MAX_MEMBERS:
        raise api_error(409, "train_full", "This session is full.")
    previous = _membership(db, user.id)
    if previous is not None:
        affected |= _leave(db, previous, "left", now)
    rejoining = db.get(TrainTogetherMember, (session.id, user.id))
    draft_session = _draft_session(db, user.id)
    if rejoining is None:
        db.add(
            TrainTogetherMember(
                session_id=session.id,
                user_id=user.id,
                joined_at=now,
                draft_session_id=draft_session,
            )
        )
    else:
        rejoining.left_at = rejoining.left_reason = None
        rejoining.draft_session_id = draft_session
    invite.used_at, invite.used_by = now, user.id
    affected |= {user.id, *(member.user_id for member in members)}
    db.commit()
    hub.train_together_changed(*affected)
    return read_session(db, user)


@router.post("/leave", response_model=TrainTogetherRead)
def leave(user: CurrentUser, db: Db) -> TrainTogetherRead:
    current = current_membership(db, user.id)
    if current is not None:
        _notify(db, _leave(db, current[1], "left", utc_now()))
    return read_session(db, user)


@router.get("/members/{user_id}/exercises", response_model=list[TrainExercise])
def partner_exercises(user_id: str, user: CurrentUser, db: Db) -> list[TrainExercise]:
    _partner(db, user, user_id)
    hidden = hidden_exercise_ids(db, user_id)
    index = _same_lift_index(db, user.id)
    return [
        _train_exercise(exercise, index)
        for exercise in db.scalars(
            select(Exercise)
            .where(Exercise.user_id == user_id)
            .order_by(Exercise.is_favorite.desc(), Exercise.name)
        )
        if exercise.id not in hidden
    ]


@router.put("/members/{user_id}/workout", response_model=TrainPartnerWriteRead)
def change_partner_workout(
    user_id: str, payload: PartnerDraftChange, request: Request, user: CurrentUser, db: Db
) -> TrainPartnerWriteRead:
    _partner(db, user, user_id)
    if not request.app.state.save_rate_limiter.allow(f"train-together:{user.id}", 240):
        raise api_error(429, "draft_rate_limited", "Wait a moment before syncing again.")
    row = db.get(ActiveWorkoutSync, user_id)
    if row is None or row.draft is None:
        raise api_error(409, "train_no_workout", "They have no workout in progress.")
    if not allowed_partner_change(row.draft, payload) or not _owns_new_references(
        db, user_id, payload.base, payload.draft
    ):
        raise api_error(
            422, "train_change_not_allowed", "Only their sets and exercises can be changed."
        )
    result = change_draft(db, user_id, payload)
    return TrainPartnerWriteRead(
        **result, exercises=draft_exercises(db, user_id, user.id, result["draft"])
    )
