"""Workout discussion, always checked against current sharing access."""

from collections import Counter
from typing import get_args

from fastapi import HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from .auth import CurrentUser, as_utc
from .errors import api_error
from .models import (
    CommentNotification,
    CommentReaction,
    TrainingWorkout,
    User,
    WorkoutComment,
    WorkoutReaction,
    utc_now,
)
from .presence import hub
from .sharing import (
    Db,
    FeedFriend,
    Reaction,
    ReactionChoice,
    ReactionCount,
    WorkoutReactions,
    blocked_member_ids,
    photo_url,
    reaction_summaries,
    sharing_router,
    viewable_member,
)


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=280)

    @field_validator("body")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a comment.")
        return value.strip()


class CommentCreate(CommentBody):
    reply_to_id: str | None = None
    reaction: Reaction | None = None


def discussion_workout(db, user, workout_id):
    workout = db.get(TrainingWorkout, workout_id)
    if workout is None or workout.is_sample or workout.user_id is None:
        raise api_error(404, "workout_not_found", "That workout is not shared with you.")
    if workout.user_id != user.id:
        viewable_member(db, user, workout.user_id)
    return workout


def member_visible(db, user, member_id):
    if member_id == user.id:
        return True
    try:
        viewable_member(db, user, member_id)
        return True
    except HTTPException:
        return False


def visible_comments(db, user, workout_id):
    rows = list(db.scalars(select(WorkoutComment).where(WorkoutComment.workout_id == workout_id)))
    visible_members = {
        member_id: member_visible(db, user, member_id)
        for member_id in {row.user_id for row in rows}
    }
    cache = {}
    pending = list(rows)
    while pending:
        remaining = []
        for row in pending:
            targets = {row.parent_id, row.reply_to_id} - {None}
            if not visible_members[row.user_id]:
                cache[row.id] = False
            elif targets.issubset(cache):
                cache[row.id] = all(cache[target] for target in targets)
            else:
                remaining.append(row)
        if len(remaining) == len(pending):
            break
        pending = remaining
    return [row for row in rows if cache.get(row.id, False)]


def checked_comment(db, user, comment_id):
    comment = db.get(WorkoutComment, comment_id)
    if comment is not None:
        discussion_workout(db, user, comment.workout_id)
        if any(row.id == comment_id for row in visible_comments(db, user, comment.workout_id)):
            return comment
    raise api_error(404, "comment_not_found", "That comment is not available.")


def person(db, user_id):
    member = db.get(User, user_id)
    return FeedFriend(
        id=member.id, display_name=member.display_name, profile_photo_url=photo_url(member)
    )


def read_comment(db, user, row):
    counts = Counter()
    yours = None
    blocked = blocked_member_ids(db, user.id)
    for reaction, actor in db.execute(
        select(CommentReaction, User)
        .join(User, User.id == CommentReaction.user_id)
        .where(
            CommentReaction.comment_id == row.id,
            User.disabled_at.is_(None),
            User.id.not_in(blocked),
        )
    ):
        counts[reaction.reaction] += 1
        if actor.id == user.id:
            yours = reaction.reaction
    target = db.get(WorkoutComment, row.reply_to_id) if row.reply_to_id else None
    return dict(
        id=row.id,
        author=person(db, row.user_id),
        body=row.body,
        reaction=row.reaction,
        parent_id=row.parent_id,
        reply_to=person(db, target.user_id) if target else None,
        created_at=as_utc(row.created_at),
        edited_at=as_utc(row.edited_at) if row.edited_at else None,
        can_edit=row.user_id == user.id,
        can_delete=row.user_id == user.id
        or db.get(TrainingWorkout, row.workout_id).user_id == user.id,
        reactions=WorkoutReactions(
            counts=[
                ReactionCount(reaction=kind, count=counts[kind])
                for kind in get_args(Reaction)
                if counts[kind]
            ],
            yours=yours,
        ),
    )


@sharing_router.get("/workouts/{workout_id}/comments")
def comments(workout_id: str, user: CurrentUser, db: Db, offset: int = Query(0, ge=0)):
    discussion_workout(db, user, workout_id)
    rows = sorted(visible_comments(db, user, workout_id), key=lambda row: (row.created_at, row.id))
    roots = [row for row in rows if row.parent_id is None]
    page = roots[offset : offset + 20]
    ids = {row.id for row in page}
    return dict(
        total=len(rows),
        reactions=reaction_summaries(db, user.id, [workout_id])[workout_id],
        next_offset=offset + 20 if len(roots) > offset + 20 else None,
        items=[
            read_comment(db, user, row) for row in rows if row.id in ids or row.parent_id in ids
        ],
    )


def notify(db, row, actor_id, recipient_id, kind, reaction=None):
    if actor_id != recipient_id:
        db.add(
            CommentNotification(
                comment_id=row.id,
                actor_id=actor_id,
                recipient_id=recipient_id,
                kind=kind,
                reaction=reaction,
            )
        )


@sharing_router.post("/workouts/{workout_id}/comments", status_code=201)
def create_comment(workout_id: str, payload: CommentCreate, user: CurrentUser, db: Db):
    workout = discussion_workout(db, user, workout_id)
    target = checked_comment(db, user, payload.reply_to_id) if payload.reply_to_id else None
    if target and target.workout_id != workout_id:
        raise api_error(404, "comment_not_found", "That comment is not available.")
    row = WorkoutComment(
        workout_id=workout_id,
        user_id=user.id,
        body=payload.body,
        reaction=payload.reaction,
        parent_id=(target.parent_id or target.id) if target else None,
        reply_to_id=target.id if target else None,
    )
    db.add(row)
    db.flush()
    if payload.reaction and workout.user_id != user.id:
        existing = db.get(WorkoutReaction, (workout_id, user.id))
        if existing is None:
            db.add(
                WorkoutReaction(workout_id=workout_id, user_id=user.id, reaction=payload.reaction)
            )
        elif existing.reaction != payload.reaction:
            existing.reaction = payload.reaction
            existing.created_at = utc_now()
            existing.notification_seen = False
    recipients = {workout.user_id, target.user_id if target else workout.user_id}
    for recipient in recipients:
        notify(db, row, user.id, recipient, "reply" if target else "comment")
    db.commit()
    hub.notifications_changed(*(recipients - {user.id}))
    return read_comment(db, user, row)


@sharing_router.patch("/comments/{comment_id}")
def edit_comment(comment_id: str, payload: CommentBody, user: CurrentUser, db: Db):
    row = checked_comment(db, user, comment_id)
    if row.user_id != user.id:
        raise api_error(403, "comment_owner_required", "You can only edit your own comments.")
    row.body, row.edited_at = payload.body, utc_now()
    db.commit()
    hub.notifications_changed(*notice_recipients(db, row.workout_id))
    return read_comment(db, user, row)


@sharing_router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: str, user: CurrentUser, db: Db):
    row = checked_comment(db, user, comment_id)
    if row.user_id != user.id and db.get(TrainingWorkout, row.workout_id).user_id != user.id:
        raise api_error(403, "comment_owner_required", "You cannot delete that comment.")
    recipients = notice_recipients(db, row.workout_id)
    db.delete(row)
    db.commit()
    hub.notifications_changed(*recipients)


@sharing_router.put("/comments/{comment_id}/reaction")
def react(comment_id: str, payload: ReactionChoice, user: CurrentUser, db: Db):
    row = checked_comment(db, user, comment_id)
    current = db.get(CommentReaction, (comment_id, user.id))
    if current is None or current.reaction != payload.reaction:
        if current:
            current.reaction = payload.reaction
        else:
            db.add(
                CommentReaction(comment_id=comment_id, user_id=user.id, reaction=payload.reaction)
            )
        db.execute(
            delete(CommentNotification).where(
                CommentNotification.comment_id == comment_id,
                CommentNotification.actor_id == user.id,
                CommentNotification.kind == "comment_reaction",
            )
        )
        notify(db, row, user.id, row.user_id, "comment_reaction", payload.reaction)
        try:
            db.commit()
            if row.user_id != user.id:
                hub.notifications_changed(row.user_id)
        except IntegrityError:
            db.rollback()
    return read_comment(db, user, row)


@sharing_router.delete("/comments/{comment_id}/reaction")
def unreact(comment_id: str, user: CurrentUser, db: Db):
    row = checked_comment(db, user, comment_id)
    db.execute(
        delete(CommentReaction).where(
            CommentReaction.comment_id == comment_id, CommentReaction.user_id == user.id
        )
    )
    db.execute(
        delete(CommentNotification).where(
            CommentNotification.comment_id == comment_id,
            CommentNotification.actor_id == user.id,
            CommentNotification.kind == "comment_reaction",
        )
    )
    db.commit()
    if row.user_id != user.id:
        hub.notifications_changed(row.user_id)
    return read_comment(db, user, row)


def notice_recipients(db, workout_id):
    """Include reply recipients whose notices change when a thread is edited or deleted."""
    return set(
        db.scalars(
            select(CommentNotification.recipient_id)
            .join(WorkoutComment, WorkoutComment.id == CommentNotification.comment_id)
            .where(WorkoutComment.workout_id == workout_id)
        )
    )


def comment_notices(db, user):
    result = []
    for notice in db.scalars(
        select(CommentNotification)
        .where(CommentNotification.recipient_id == user.id)
        .order_by(CommentNotification.created_at.desc())
        .limit(100)
    ):
        try:
            row = checked_comment(db, user, notice.comment_id)
            if not member_visible(db, user, notice.actor_id):
                continue
            actor = person(db, notice.actor_id)
            result.append(
                dict(
                    **actor.model_dump(),
                    notice_id=notice.id,
                    kind=notice.kind,
                    since=as_utc(notice.created_at),
                    is_read=notice.is_read,
                    comment_id=row.id,
                    workout_id=row.workout_id,
                    workout_name=db.get(TrainingWorkout, row.workout_id).name,
                    body=row.body,
                    reaction=notice.reaction,
                )
            )
        except HTTPException:
            continue
        if len(result) == 20:
            break
    return result
