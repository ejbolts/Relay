"""Lift comparisons between members who can already see each other's training.

Every account owns its own exercises, so a lift is matched by name: the same name, ignoring case,
or one of its known aliases. A lift's best is the completed working set with the highest estimated
one-rep max, the measure the progress screen charts, so sets at different reps compare fairly.
Sample workouts never count, and nothing here shows more than the member's shared workouts do.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .errors import api_error
from .exercise_aliases import canonical_exercise_name
from .models import (
    Exercise,
    ExerciseKind,
    TrainingWorkout,
    User,
    WorkoutMovement,
    WorkoutSet,
)
from .sharing import (
    Db,
    FeedFriend,
    photo_url,
    require_sharing,
    shared_friend_ids,
    sharing_router,
    viewable_member,
)
from .training_metrics import estimated_one_rep_max, is_pr_eligible


class LiftBest(BaseModel):
    """A member's best set of one lift."""

    # The member's own exercise, for opening their sessions of the lift.
    exercise_id: str
    weight_kg: float
    reps: int
    estimated_1rm: float
    achieved_date: date


class LiftComparison(BaseModel):
    # Named as the viewer's own exercise is.
    name: str
    muscle_group: str
    yours: LiftBest
    theirs: LiftBest


class LiftComparisonRead(BaseModel):
    """The lifts both members have logged, heaviest first."""

    lifts: list[LiftComparison]


class LiftRanking(BaseModel):
    member: FeedFriend
    is_you: bool
    best: LiftBest


class LiftLeaderboardRead(BaseModel):
    """The viewer and their friends who have logged one lift, strongest first."""

    entries: list[LiftRanking]


class _Lift(BaseModel):
    name: str
    muscle_group: str
    best: LiftBest


def lift_key(name: str) -> str:
    """What two accounts' exercises share when they are the same lift."""
    return canonical_exercise_name(name).casefold()


def best_lifts(db: Session, user_ids, exercise_ids=None) -> dict[str, dict[str, _Lift]]:
    """Per account and lift: the earliest set with its highest estimated one-rep max."""
    conditions = [
        TrainingWorkout.user_id.in_(user_ids),
        TrainingWorkout.is_sample.is_(False),
        TrainingWorkout.workout_date <= date.today(),
        Exercise.kind == ExerciseKind.STRENGTH,
        WorkoutSet.completed.is_(True),
        WorkoutSet.weight_kg > 0,
        # The estimate is defined for one to thirty reps.
        WorkoutSet.reps.between(1, 30),
    ]
    if exercise_ids is not None:
        conditions.append(Exercise.id.in_(exercise_ids))
    rows = db.execute(
        select(
            WorkoutSet,
            TrainingWorkout.user_id,
            TrainingWorkout.workout_date,
            Exercise.id,
            Exercise.name,
            Exercise.muscle_group,
        )
        .join(WorkoutMovement, WorkoutSet.movement_id == WorkoutMovement.id)
        .join(TrainingWorkout, WorkoutMovement.workout_id == TrainingWorkout.id)
        .join(Exercise, WorkoutMovement.exercise_id == Exercise.id)
        .where(*conditions)
        .order_by(TrainingWorkout.workout_date, TrainingWorkout.created_at, WorkoutSet.order_index)
    )
    bests: dict[str, dict[str, _Lift]] = {}
    for item, user_id, workout_date, exercise_id, name, muscle_group in rows:
        if not is_pr_eligible(item):
            continue
        estimate = round(estimated_one_rep_max(item.weight_kg, item.reps), 1)
        lifts = bests.setdefault(user_id, {})
        key = lift_key(name)
        if key in lifts and lifts[key].best.estimated_1rm >= estimate:
            continue
        lifts[key] = _Lift(
            name=name,
            muscle_group=muscle_group,
            best=LiftBest(
                exercise_id=exercise_id,
                weight_kg=item.weight_kg,
                reps=item.reps,
                estimated_1rm=estimate,
                achieved_date=workout_date,
            ),
        )
    return bests


@sharing_router.get("/profiles/{user_id}/lifts", response_model=LiftComparisonRead)
def compare_lifts(user_id: str, user: CurrentUser, db: Db) -> LiftComparisonRead:
    """Head to head: the viewer's best against the member's, for each lift both have logged."""
    member, _ = viewable_member(db, user, user_id)
    if member.id == user.id:
        return LiftComparisonRead(lifts=[])
    bests = best_lifts(db, [user.id, member.id])
    yours, theirs = bests.get(user.id, {}), bests.get(member.id, {})
    lifts = [
        LiftComparison(
            name=yours[key].name,
            muscle_group=yours[key].muscle_group,
            yours=yours[key].best,
            theirs=theirs[key].best,
        )
        for key in yours.keys() & theirs.keys()
    ]
    lifts.sort(
        key=lambda lift: (
            -max(lift.yours.estimated_1rm, lift.theirs.estimated_1rm),
            lift.name.casefold(),
        )
    )
    return LiftComparisonRead(lifts=lifts)


@sharing_router.get("/lifts/{exercise_id}", response_model=LiftLeaderboardRead)
def lift_leaderboard(exercise_id: str, user: CurrentUser, db: Db) -> LiftLeaderboardRead:
    """One of the viewer's lifts, ranked against the friends who have logged it too."""
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user.id:
        raise api_error(404, "exercise_not_found", "Exercise was not found.")
    require_sharing(db, user)
    friends = {
        friend.id: friend
        for friend in db.scalars(select(User).where(User.id.in_(shared_friend_ids(db, user.id))))
    }
    if not friends or exercise.kind != ExerciseKind.STRENGTH:
        return LiftLeaderboardRead(entries=[])
    members = {user.id: user, **friends}
    key = lift_key(exercise.name)
    matching = [
        candidate_id
        for candidate_id, name in db.execute(
            select(Exercise.id, Exercise.name).where(
                Exercise.user_id.in_(members), Exercise.kind == ExerciseKind.STRENGTH
            )
        )
        if lift_key(name) == key
    ]
    bests = best_lifts(db, list(members), matching)
    entries = [
        LiftRanking(
            member=FeedFriend(
                id=member.id,
                display_name=member.display_name,
                profile_photo_url=photo_url(member),
            ),
            is_you=member.id == user.id,
            best=bests[member.id][key].best,
        )
        for member in members.values()
        if key in bests.get(member.id, {})
    ]
    if all(entry.is_you for entry in entries):
        return LiftLeaderboardRead(entries=[])
    entries.sort(
        key=lambda entry: (
            -entry.best.estimated_1rm,
            entry.best.achieved_date,
            entry.member.display_name.casefold(),
        )
    )
    return LiftLeaderboardRead(entries=entries)
