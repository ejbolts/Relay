"""Lift comparisons between members who can already see each other's training.

Every account owns its own exercises, so a lift is matched by name: the same name, ignoring case,
or one of its known aliases. A lift's best is the completed working set with the highest estimated
one-rep max, the measure the progress screen charts, so sets at different reps compare fairly.
An account that normalises an exercise's machine weights is compared in its reference machine's
weights, as its own progress chart is; an account that does not is compared as logged. Sample
workouts never count, and nothing here shows more than the member's shared workouts do.

A head to head shows only the lifts the viewer has chosen. The choice is one list per account, so
it carries over to every member they compare with.
"""

from __future__ import annotations

import json
from datetime import date

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import CurrentUser
from .errors import api_error
from .exercise_aliases import canonical_exercise_name
from .exercise_merge import exercise_aliases
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
from .tracker import hidden_exercise_ids
from .training_metrics import estimated_one_rep_max, get_setting, is_pr_eligible, set_setting
from .weight_factors import normalising_factors

LIFT_SELECTION_KEY = "head_to_head_exercises"
MAX_SELECTED_LIFTS = 20


class LiftBest(BaseModel):
    """A member's best set of one lift."""

    # The member's own exercise, for opening their sessions of the lift.
    exercise_id: str
    weight_kg: float
    reps: int
    estimated_1rm: float
    achieved_date: date
    # The member normalises this exercise's machines, so the weights are its reference machine's.
    normalised: bool = False


class LiftComparison(BaseModel):
    """One of the viewer's exercises, with each member's best when they have logged it."""

    exercise_id: str
    name: str
    muscle_group: str
    equipment: str | None
    yours: LiftBest | None
    theirs: LiftBest | None


class LiftComparisonRead(BaseModel):
    # The viewer's chosen exercises, in the order they were added.
    selected: list[str]
    # Every strength exercise the viewer can choose, by name.
    lifts: list[LiftComparison]


class LiftSelection(BaseModel):
    exercise_ids: list[str] = Field(max_length=MAX_SELECTED_LIFTS)


class LiftRanking(BaseModel):
    member: FeedFriend
    is_you: bool
    best: LiftBest


class LiftLeaderboardRead(BaseModel):
    """The viewer and their friends who have logged one lift, strongest first."""

    entries: list[LiftRanking]


def lift_key(name: str) -> str:
    """What two accounts' exercises share when they are the same lift."""
    return canonical_exercise_name(name).casefold()


def best_lifts(
    db: Session, user_ids: list[str], exercise_ids=None
) -> dict[str, dict[str, LiftBest]]:
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
        )
        .join(WorkoutMovement, WorkoutSet.movement_id == WorkoutMovement.id)
        .join(TrainingWorkout, WorkoutMovement.workout_id == TrainingWorkout.id)
        .join(Exercise, WorkoutMovement.exercise_id == Exercise.id)
        .where(*conditions)
        .order_by(TrainingWorkout.workout_date, TrainingWorkout.created_at, WorkoutSet.order_index)
    )
    # Each account's own multipliers, as its progress chart's "All machines" view applies them.
    factors = {user_id: normalising_factors(db, user_id) for user_id in user_ids}
    bests: dict[str, dict[str, LiftBest]] = {}
    for item, user_id, workout_date, exercise_id, name in rows:
        if not is_pr_eligible(item):
            continue
        machines = factors[user_id].get(exercise_id)
        weight = item.weight_kg
        if machines is not None and item.machine_photo_id:
            weight = round(weight * machines.get(item.machine_photo_id, 1.0), 1)
        estimate = round(estimated_one_rep_max(weight, item.reps), 1)
        lifts = bests.setdefault(user_id, {})
        key = lift_key(name)
        if key in lifts and lifts[key].estimated_1rm >= estimate:
            continue
        lifts[key] = LiftBest(
            exercise_id=exercise_id,
            weight_kg=weight,
            reps=item.reps,
            estimated_1rm=estimate,
            achieved_date=workout_date,
            normalised=machines is not None,
        )
    return bests


def selected_lift_ids(db: Session, user_id: str, owned: set[str]) -> list[str]:
    """The account's chosen exercises that still exist, following any merges since."""
    try:
        stored = json.loads(get_setting(db, user_id, LIFT_SELECTION_KEY, "[]"))
    except ValueError:
        return []
    merged = exercise_aliases(db, user_id)
    selected: list[str] = []
    for value in stored if isinstance(stored, list) else []:
        exercise_id = merged.get(value, value) if isinstance(value, str) else None
        if exercise_id in owned and exercise_id not in selected:
            selected.append(exercise_id)
    return selected


def strength_exercises(db: Session, user_id: str):
    return db.execute(
        select(Exercise.id, Exercise.name, Exercise.muscle_group, Exercise.equipment)
        .where(Exercise.user_id == user_id, Exercise.kind == ExerciseKind.STRENGTH)
        .order_by(Exercise.name)
    ).all()


@sharing_router.get("/profiles/{user_id}/lifts", response_model=LiftComparisonRead)
def compare_lifts(user_id: str, user: CurrentUser, db: Db) -> LiftComparisonRead:
    """Head to head: the viewer's exercises with their best and the member's, and their choice."""
    member, _ = viewable_member(db, user, user_id)
    exercises = strength_exercises(db, user.id)
    selected = selected_lift_ids(db, user.id, {exercise.id for exercise in exercises})
    if member.id == user.id:
        return LiftComparisonRead(selected=selected, lifts=[])
    bests = best_lifts(db, [user.id, member.id])
    yours, theirs = bests.get(user.id, {}), bests.get(member.id, {})
    hidden = hidden_exercise_ids(db, user.id) - set(selected)
    return LiftComparisonRead(
        selected=selected,
        lifts=[
            LiftComparison(
                exercise_id=exercise.id,
                name=exercise.name,
                muscle_group=exercise.muscle_group,
                equipment=exercise.equipment,
                yours=yours.get(lift_key(exercise.name)),
                theirs=theirs.get(lift_key(exercise.name)),
            )
            for exercise in exercises
            if exercise.id not in hidden
        ],
    )


@sharing_router.put("/lifts", response_model=LiftSelection)
def choose_lifts(payload: LiftSelection, user: CurrentUser, db: Db) -> LiftSelection:
    """Save the exercises the viewer's head to heads show, for every member they compare with."""
    owned = {exercise.id for exercise in strength_exercises(db, user.id)}
    chosen = list(dict.fromkeys(payload.exercise_ids))
    if any(exercise_id not in owned for exercise_id in chosen):
        raise api_error(422, "exercise_not_found", "Choose your own strength exercises.")
    set_setting(db, user.id, LIFT_SELECTION_KEY, json.dumps(chosen))
    db.commit()
    return LiftSelection(exercise_ids=chosen)


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
            best=bests[member.id][key],
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
