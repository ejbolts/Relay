"""Train together: friends at the gym link their live workouts, and either phone logs for either.

A session links two to four friends. One member shows a code (an invite) that lasts five
minutes; scanning it is the consent, so joining is instant. Each member keeps their own live
draft (``active_workouts``); a partner's edit is applied as if it came from another of the
owner's devices, through the same three-way ``change_draft`` merge. The owner's apps receive it
through their existing draft sync, and nothing new is stored inside the draft.

A partner may change only the movements and the activity times of someone's draft, and never
creates, finishes, discards or replaces it. Every read and write re-checks that both accounts
are active members of the same session and are still friends.

Expired sessions and invites are ended lazily, when they are next read or written, and are
recorded as ending when they lapsed. Each attendance (a member row) is its own interval, so a
rejoin starts a new one; an account has at most one open attendance.
"""

from __future__ import annotations

import re
import secrets
import uuid
from collections import Counter
from datetime import datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, delete, literal, or_, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
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
    ProfileSharing,
    TrainingWorkout,
    TrainTogetherInvite,
    TrainTogetherMember,
    TrainTogetherSession,
    User,
    UserSetting,
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
from .tracker import WORKOUT_CACHE_REVISION_KEY, hidden_exercise_ids
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
    # None once the account that started it has been deleted.
    created_by: str | None = None
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
    # Any malformed code, however long, reads as expired rather than as a validation error.
    token: str = Field(max_length=10_000)


class PartnerDraftChange(DraftChange):
    """A partner's edit: the same shape as a draft sync, checked by allowed_partner_change."""

    model_config = ConfigDict(extra="forbid")


class TrainPartnerWriteRead(BaseModel):
    revision: int
    draft: dict[str, Any] | None
    conflict: bool
    exercises: list[TrainExercise]


# Session state
#
# Nothing here commits. A route commits once and then tells the affected accounts' windows;
# a hook called from existing code returns who to tell, and that code commits its own change
# together with the session change before notifying (see ``notify``).


def notify(affected: set[str]) -> None:
    """Tell members' windows to refetch; call only after the change has committed."""
    if affected:
        hub.train_together_changed(*affected)


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


def _open_row(db: Session, user_id: str) -> TrainTogetherMember | None:
    """The account's one open attendance, whether or not its session has lapsed yet."""
    return db.scalar(
        select(TrainTogetherMember).where(
            TrainTogetherMember.user_id == user_id, TrainTogetherMember.left_at.is_(None)
        )
    )


def _end(
    db: Session, session: TrainTogetherSession, reason: Reason, by: str | None, at: datetime
) -> set[str]:
    """End the session at ``at``; everyone still in it leaves with the session's reason."""
    session.ended_at, session.ended_reason, session.ended_by = at, reason, by
    affected = set()
    for member in _active_members(db, session.id):
        member.left_at, member.left_reason = at, reason
        affected.add(member.user_id)
    return affected


def _leave(db: Session, member: TrainTogetherMember, reason: Reason, now: datetime) -> set[str]:
    """One member leaves; fewer than two left ends the session. Returns who to tell."""
    session = db.get(TrainTogetherSession, member.session_id)
    remaining = [other for other in _active_members(db, member.session_id) if other.id != member.id]
    member.left_at, member.left_reason = now, reason
    affected = {member.user_id, *(other.user_id for other in remaining)}
    if session is not None and session.ended_at is None and len(remaining) < 2:
        _end(db, session, reason, member.user_id, now)
    # Sessions here do not autoflush: a later member query must not still see them in it.
    db.flush()
    return affected


def _last_invite_expiry(db: Session, session_id: str) -> datetime | None:
    expiries = [
        as_utc(expires)
        for expires in db.scalars(
            select(TrainTogetherInvite.expires_at).where(
                TrainTogetherInvite.session_id == session_id,
                TrainTogetherInvite.used_at.is_(None),
            )
        )
    ]
    return max(expiries, default=None)


def _refresh(db: Session, session: TrainTogetherSession, now: datetime) -> set[str]:
    """End what has lapsed: the 12 hours, disabled members, or a lone creator's last invite.

    A lapsed session ends at the time it lapsed, not when it is noticed, so the notice window
    and the attendance it records are the real ones.
    """
    if session.ended_at is not None:
        return set()
    if as_utc(session.expires_at) <= now:
        return _end(db, session, "expired", None, as_utc(session.expires_at))
    affected: set[str] = set()
    for member in _active_members(db, session.id):
        account = db.get(User, member.user_id)
        if account is None or account.disabled_at is not None:
            affected |= _leave(db, member, "left", now)
    if session.ended_at is not None:
        return affected
    members = _active_members(db, session.id)
    if len(members) >= 2:
        return affected
    last_invite = _last_invite_expiry(db, session.id)
    waiting = (
        len(members) == 1
        and members[0].user_id == session.created_by
        and last_invite is not None
        and last_invite > now
    )
    if not waiting:
        at = min(last_invite, now) if last_invite else now
        affected |= _end(db, session, "expired", None, at)
    return affected


def settle(db: Session, user_id: str, now: datetime) -> tuple[TrainTogetherMember | None, set[str]]:
    """The account's live attendance, after ending its session if that has lapsed."""
    member = _open_row(db, user_id)
    if member is None:
        return None, set()
    session = db.get(TrainTogetherSession, member.session_id)
    affected = _refresh(db, session, now)
    return (member if member.left_at is None else None), affected


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


def _partner(db: Session, user: User, user_id: str) -> TrainTogetherMember:
    """The caller's active partner ``user_id``, checking membership and friendship again."""
    refused = api_error(404, "train_not_partner", "You are not training with them now.")
    member, affected = settle(db, user.id, utc_now())
    if affected:
        db.commit()
        notify(affected)
    if member is None or user_id == user.id:
        raise refused
    partner = next(
        (other for other in _active_members(db, member.session_id) if other.user_id == user_id),
        None,
    )
    if partner is None or not _friends(db, user.id, user_id, blocked_member_ids(db, user.id)):
        raise refused
    return partner


def refresh_shared_histories(db: Session, user_id: str, *, include_self: bool = True) -> None:
    """Saved workouts name partners by what the viewer may see; a change to that must reach
    every cached history that names this account (or that this account reads).

    Nothing happens for an account that has never been in a session. Otherwise one upsert gives
    everyone it trained with (and, unless excluded, the account itself) a new workout cache
    revision, so it cannot race another bump into a duplicate row.
    """
    if (
        db.scalar(select(TrainTogetherMember.id).where(TrainTogetherMember.user_id == user_id))
        is None
    ):
        return
    mine, other = aliased(TrainTogetherMember), aliased(TrainTogetherMember)
    accounts = (
        select(
            other.user_id,
            literal(WORKOUT_CACHE_REVISION_KEY),
            literal(str(uuid.uuid4())),
        )
        .join(mine, mine.session_id == other.session_id)
        .where(mine.user_id == user_id)
        .distinct()
    )
    if not include_self:
        accounts = accounts.where(other.user_id != user_id)
    upsert = sqlite_insert(UserSetting).from_select(["user_id", "key", "value"], accounts)
    db.execute(
        upsert.on_conflict_do_update(
            index_elements=[UserSetting.user_id, UserSetting.key],
            set_={"value": upsert.excluded.value},
        )
    )


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
    if reason == "unfriended" and by != user_id:
        # Blocks and unfriending stay silent: to everyone else it reads as an ordinary leave.
        reason = "left"
    account = db.get(User, by) if by else None
    return TrainEnded(
        session_id=session.id,
        reason=reason or "left",
        by_user_id=account.id if account else None,
        by_name=account.display_name if account else None,
    )


def read_session(db: Session, user: User) -> TrainTogetherRead:
    """The caller's session. Nothing about a member they are no longer friends with is shown:
    finding one ends the caller's attendance instead (``unfriended``)."""
    now = utc_now()
    member, affected = settle(db, user.id, now)
    # One member list: the same rows are checked and then shown.
    members = _active_members(db, member.session_id) if member is not None else []
    if member is not None:
        blocked = blocked_member_ids(db, user.id)
        if any(
            not _friends(db, user.id, other.user_id, blocked)
            for other in members
            if other.user_id != user.id
        ):
            affected |= _leave(db, member, "unfriended", now)
            member = None
    if affected:
        db.commit()
        notify(affected)
    if member is not None:
        # Another request may have ended this attendance meanwhile: then show nothing.
        db.refresh(member)
        if member.left_at is not None:
            member = None
    if member is None:
        return TrainTogetherRead(session=None, ended=_ended(db, user.id, now))
    session = db.get(TrainTogetherSession, member.session_id)
    members.sort(key=lambda other: other.user_id != user.id)
    # Name the creator only while they are a partner here (and so a friend), or the caller.
    creator = (
        session.created_by
        if any(other.user_id == session.created_by for other in members)
        else None
    )
    read: list[TrainMember] = []
    for other in members:
        account = db.get(User, other.user_id)
        is_self = other.user_id == user.id
        workout = None
        if not is_self:
            row = db.get(ActiveWorkoutSync, other.user_id)
            if row is not None and row.draft is not None:
                workout = TrainPartnerWorkout(
                    revision=row.revision,
                    draft=row.draft,
                    exercises=draft_exercises(db, other.user_id, user.id, row.draft),
                )
        read.append(
            TrainMember(
                user_id=account.id,
                username=account.username,
                display_name=account.display_name,
                photo_url=photo_url(account),
                is_self=is_self,
                joined_at=as_utc(other.joined_at),
                workout=workout,
            )
        )
    return TrainTogetherRead(
        session=TrainSession(
            id=session.id,
            started_at=as_utc(session.created_at),
            expires_at=as_utc(session.expires_at),
            created_by=creator,
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


def allowed_references(db: Session, owner_id: str, stored: dict, draft: dict) -> bool:
    """Checked against the owner's stored draft, never the caller's own base.

    A partner may add only the owner's own exercises, may not change which exercise an existing
    movement is, and may not bring in a machine photo the workout does not already use.
    """
    stored_exercises, stored_photos = _references(stored)
    new_exercises, new_photos = _references(draft)
    if new_photos - stored_photos:
        return False
    existing = {movement["key"]: movement["exerciseId"] for movement in stored["movements"]}
    if any(
        existing.get(movement["key"], movement["exerciseId"]) != movement["exerciseId"]
        for movement in draft.get("movements", [])
    ):
        return False
    added = new_exercises - stored_exercises
    if not added:
        return True
    owned = set(
        db.scalars(select(Exercise.id).where(Exercise.user_id == owner_id, Exercise.id.in_(added)))
    )
    return owned == added


def readable_by_owner(draft: dict) -> bool:
    """Every set carries the fields the owner's apps require when they read the draft back."""
    return all(
        isinstance(item.get("completed"), bool)
        and "notes" in item
        and (item["notes"] is None or isinstance(item["notes"], str))
        for movement in draft.get("movements", [])
        for item in movement["sets"]
    )


def no_new_duplicate_exercises(stored: dict | None, merged: dict | None) -> bool:
    """A merged partner edit may not leave the same exercise in the workout twice (a workout
    with a repeated exercise cannot be saved), unless the owner already had it twice."""
    if merged is None:
        return True
    before = Counter(movement["exerciseId"] for movement in (stored or {}).get("movements", []))
    after = Counter(movement["exerciseId"] for movement in merged["movements"])
    return all(count <= max(1, before[exercise_id]) for exercise_id, count in after.items())


# Hooks from existing code. Each runs inside that code's transaction, before it commits, and
# returns who to tell; the caller commits, then passes the result to ``notify``.


def draft_changed(db: Session, user_id: str, previous: dict | None, draft: dict | None) -> set[str]:
    """Keep the member's draft session current, and leave when their session's draft is
    discarded. Discarding some other draft (from before they joined) leaves them in place."""
    member, affected = settle(db, user_id, utc_now())
    if member is None:
        return affected
    if draft is None:
        if previous is not None and member.draft_session_id == previous["clientSessionId"]:
            affected |= _leave(db, member, "discarded", utc_now())
        return affected
    member.draft_session_id = draft["clientSessionId"]
    return affected | {other.user_id for other in _active_members(db, member.session_id)}


def workout_saved(
    db: Session, user_id: str, draft_session_id: str | None, workout_id: str
) -> set[str]:
    """Link a workout saved from a draft to the attendance it came from, and leave as finished.

    This also links a workout saved after its session ended (the partner finished first, or the
    session lapsed), and repairs the link when a repeated finish finds it missing.
    """
    if not draft_session_id:
        return set()
    _, affected = settle(db, user_id, utc_now())
    member = db.scalar(
        select(TrainTogetherMember)
        .where(
            TrainTogetherMember.user_id == user_id,
            TrainTogetherMember.draft_session_id == draft_session_id,
            or_(
                TrainTogetherMember.workout_id.is_(None),
                TrainTogetherMember.workout_id == workout_id,
            ),
        )
        .order_by(TrainTogetherMember.joined_at.desc())
        .limit(1)
    )
    if member is None or member.workout_id == workout_id:
        return affected
    member.workout_id = workout_id
    affected.add(user_id)
    session = db.get(TrainTogetherSession, member.session_id)
    if member.left_at is None and session is not None and session.ended_at is None:
        affected |= _leave(db, member, "finished", utc_now())
    return affected


def friendship_ended(db: Session, user_id: str, other_id: str) -> set[str]:
    """Unfriending or blocking a partner: the member who did it leaves their shared session."""
    member, affected = settle(db, user_id, utc_now())
    if member is None:
        return affected
    if any(other.user_id == other_id for other in _active_members(db, member.session_id)):
        affected |= _leave(db, member, "unfriended", utc_now())
    return affected


def account_removed(db: Session, user_id: str) -> set[str]:
    """Before an account is deleted or disabled: it leaves its session, and the saved histories
    that name it are refreshed. Flushed, so raw deletes that follow see it."""
    member, affected = settle(db, user_id, utc_now())
    if member is not None:
        affected |= _leave(db, member, "left", utc_now())
    refresh_shared_histories(db, user_id, include_self=False)
    db.flush()
    return affected


def account_rows(user_id: str) -> tuple:
    """Deletes for a deleted account's own rows. Sessions and other members' rows stay, so a
    group carries on and everyone else's history keeps the rest of the group."""
    return (
        delete(TrainTogetherInvite).where(TrainTogetherInvite.created_by == user_id),
        update(TrainTogetherInvite)
        .where(TrainTogetherInvite.used_by == user_id)
        .values(used_by=None),
        delete(TrainTogetherMember).where(TrainTogetherMember.user_id == user_id),
        update(TrainTogetherSession)
        .where(TrainTogetherSession.ended_by == user_id)
        .values(ended_by=None),
        update(TrainTogetherSession)
        .where(TrainTogetherSession.created_by == user_id)
        .values(created_by=None),
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


def _write_lock(db: Session) -> None:
    """Take SQLite's write lock before reading, so admissions are decided one at a time."""
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")


@router.get("", response_model=TrainTogetherRead)
def get_train_together(user: CurrentUser, db: Db) -> TrainTogetherRead:
    return read_session(db, user)


@router.post("/invite", response_model=TrainInviteRead)
def create_invite(user: CurrentUser, db: Db) -> TrainInviteRead:
    _write_lock(db)
    now = utc_now()
    member, affected = settle(db, user.id, now)
    if member is None:
        db.flush()  # close a lapsed attendance before opening the new one
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
        session = db.get(TrainTogetherSession, member.session_id)
        if len(_active_members(db, session.id)) >= MAX_MEMBERS:
            db.rollback()
            raise api_error(409, "train_full", "This session is full.")
    # A new code replaces the creator's unused one for this session.
    db.execute(
        delete(TrainTogetherInvite).where(
            TrainTogetherInvite.session_id == session.id,
            TrainTogetherInvite.created_by == user.id,
            TrainTogetherInvite.used_at.is_(None),
        )
    )
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
    notify(affected)
    return TrainInviteRead(token=token, expires_at=expires_at, session_id=session.id)


@router.post("/join", response_model=TrainTogetherRead)
def join(payload: TrainJoin, user: CurrentUser, db: Db) -> TrainTogetherRead:
    expired = api_error(404, "train_invite_expired", "This code has expired. Ask for a new one.")
    if not TOKEN.fullmatch(payload.token):
        raise expired
    _write_lock(db)
    now = utc_now()
    token_hash = hash_token(payload.token)
    invite = db.get(TrainTogetherInvite, token_hash)
    session = db.get(TrainTogetherSession, invite.session_id) if invite else None
    # End a lapsed session before the code is claimed: a waiting creator's code keeps it open.
    if session is not None:
        _refresh(db, session, now)
    if session is None or session.ended_at is not None:
        db.rollback()
        raise expired
    # Claim the code: only one request can use it, and any refusal below rolls it back.
    claimed = db.execute(
        update(TrainTogetherInvite)
        .where(
            TrainTogetherInvite.token_hash == token_hash,
            TrainTogetherInvite.used_at.is_(None),
            TrainTogetherInvite.expires_at > now,
        )
        .values(used_at=now, used_by=user.id)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise expired
    if invite.created_by == user.id:
        db.rollback()
        raise api_error(
            400, "train_own_invite", "That's your own code. Ask your friend to scan it."
        )
    members = _active_members(db, session.id)
    if any(member.user_id == user.id for member in members):
        db.rollback()  # already here: the code stays unused
        return read_session(db, user)
    blocked = blocked_member_ids(db, user.id)
    for member in members:
        if not _friends(db, user.id, member.user_id, blocked):
            account = db.get(User, member.user_id)
            db.rollback()
            error = api_error(
                403,
                "train_not_friends",
                f"Add {account.display_name} as a friend to train together.",
            )
            error.detail["error"]["member"] = {"user_id": account.id, "name": account.display_name}
            raise error
    if len(members) >= MAX_MEMBERS:
        db.rollback()
        raise api_error(409, "train_full", "This session is full.")
    previous, affected = settle(db, user.id, now)
    if previous is not None:
        affected |= _leave(db, previous, "left", now)
    db.flush()  # close the earlier attendance before opening this one
    # A rejoin is a new attendance, so each stint keeps its own times, draft and workout.
    db.add(
        TrainTogetherMember(
            session_id=session.id,
            user_id=user.id,
            joined_at=now,
            draft_session_id=_draft_session(db, user.id),
        )
    )
    db.flush()
    if len(_active_members(db, session.id)) > MAX_MEMBERS:
        db.rollback()
        raise api_error(409, "train_full", "This session is full.")
    affected |= {user.id, *(member.user_id for member in members)}
    db.commit()
    notify(affected)
    return read_session(db, user)


@router.post("/leave", response_model=TrainTogetherRead)
def leave(user: CurrentUser, db: Db) -> TrainTogetherRead:
    _write_lock(db)
    now = utc_now()
    member, affected = settle(db, user.id, now)
    if member is not None:
        affected |= _leave(db, member, "left", now)
    db.commit()
    notify(affected)
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
    if (
        not allowed_partner_change(row.draft, payload)
        or not allowed_references(db, user_id, row.draft, payload.draft)
        or not readable_by_owner(payload.draft)
    ):
        raise api_error(
            422, "train_change_not_allowed", "Only their sets and exercises can be changed."
        )
    result = change_draft(db, user_id, payload, accept=no_new_duplicate_exercises)
    # Access may have ended while the write ran: then nothing about the workout goes back.
    db.expire_all()
    _partner(db, user, user_id)
    return TrainPartnerWriteRead(
        **result, exercises=draft_exercises(db, user_id, user.id, result["draft"])
    )
