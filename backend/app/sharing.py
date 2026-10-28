"""Profile sharing and friendships between members.

Each account chooses who can see its profile: nobody (``private``), its friends (stored as
``followers`` and shown as "Friends only"), or every sharing member (``public``). Only accounts
that share their own profile can see or add others. A shared profile always includes its workouts,
cardio sessions and profile photo; notes, body weight, goals and machine photos are optional.

Friendships are mutual: one member sends a request and both become friends once the other accepts
it. Requests always need accepting, even for public profiles, so nobody gains friends they did not
choose.

New accounts start public; existing accounts retain their choices, including private defaults.

Private, disabled and missing profiles all answer "not found". A friends-only profile shows only
its name and photo until the two members are friends. Public friend suggestions include usernames;
other shared-profile responses omit them. Videos and sample data are never shared.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta
from typing import Annotated, Literal, NamedTuple, get_args
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, case, delete, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .account_limits import limit_save_rate
from .accounts import no_store
from .auth import AppSettings, CurrentUser, as_utc, get_current_user
from .database import get_db
from .errors import api_error
from .models import (
    BodyMeasurement,
    BodyWeightGoal,
    CardioSession,
    Exercise,
    Friendship,
    MachinePhoto,
    PersonalRecord,
    PersonalRecordType,
    ProfileBlock,
    ProfileSharing,
    TrainingWorkout,
    User,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutReaction,
    movement_machine_photos,
    utc_now,
)
from .photo_storage import profile_photo_path
from .tracker import build_heatmap, training_preferences, workout_options, zone2_week
from .tracker_schemas import (
    HeatmapDay,
    MachinePhotoRead,
    PersonalRecordRead,
    TrainingTimeRead,
    TrainingWorkoutRead,
    WorkoutTypeRead,
    Zone2WeekRead,
)
from .training_metrics import start_of_week
from .training_time import past_year_start, training_time_totals
from .workout_types import workout_type_catalog

Db = Annotated[Session, Depends(get_db)]
sharing_router = APIRouter(
    prefix="/api/sharing",
    tags=["sharing"],
    dependencies=[Depends(no_store), Depends(get_current_user), Depends(limit_save_rate)],
)
PRIVATE, FOLLOWERS, PUBLIC = "private", "followers", "public"
PENDING, ACCEPTED = "pending", "accepted"
MAX_WORKOUT_PAGE = 50
FEED_SIZE = 5
MAX_REACTION_NOTICES = 20
RECENT_CARDIO_SESSIONS = 20
RECENT_DAYS = 30
# Friends list training days; one spare day covers members in time zones ahead of the server.
ACTIVITY_DAYS = 8

Visibility = Literal["private", "followers", "public"]
FriendStatus = Literal["none", "incoming", "outgoing", "friends"]


class SharingChoices(BaseModel):
    """Who can see the profile, and what it shares beyond its workouts, cardio and photo."""

    model_config = ConfigDict(from_attributes=True)

    visibility: Visibility = PRIVATE
    share_notes: bool = False
    share_body_weight: bool = False
    share_goals: bool = False
    share_machine_photos: bool = False


class SharingRead(SharingChoices):
    pending_requests: int = 0


class SharedContent(BaseModel):
    notes: bool
    body_weight: bool
    goals: bool
    machine_photos: bool


class SharedProfileSummary(BaseModel):
    id: str
    display_name: str
    profile_photo_url: str | None
    member_since: datetime
    # Private profiles are returned only to their owner.
    visibility: Visibility
    is_you: bool
    # Requests are ``incoming`` when they asked you, ``outgoing`` when you asked them.
    friend_status: FriendStatus
    friends_since: datetime | None = None
    # A friends-only profile of someone who is not your friend shows only its name and photo.
    can_view: bool
    workout_count: int | None = None
    recent_workout_count: int | None = None
    last_workout_date: date | None = None
    # Shared cardio sessions and weight and volume PRs, as counted on the member's Today.
    cardio_count: int | None = None
    record_count: int | None = None
    shares: SharedContent | None = None


class SuggestedProfileSummary(SharedProfileSummary):
    username: str


class SuggestedProfilePage(BaseModel):
    profiles: list[SuggestedProfileSummary]
    total: int
    page: int
    page_size: int = 8


class SharedBodyMeasurement(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    measurement_date: date
    weight_kg: float
    body_fat_pct: float | None


class SharedBodyWeightGoal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_date: date
    target_date: date
    start_weight_kg: float
    target_weight_kg: float


class SharedGoals(BaseModel):
    body_weight: SharedBodyWeightGoal | None
    zone2: Zone2WeekRead


class SharedCardioSession(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_date: date
    activity_type: str
    duration_minutes: int
    calories_kcal: int | None
    average_heart_rate_bpm: int | None
    distance_km: float | None
    average_speed_kph: float | None
    incline_percent: float | None
    average_power_watts: int | None
    average_mets: float | None
    zone: str | None
    qualifies_zone2: bool
    notes: str | None


class SharedConsistencyRead(BaseModel):
    heatmap: list[HeatmapDay]
    current_streak: int
    training_days: int
    workout_types: list[WorkoutTypeRead]


class SharedProfileRead(SharedProfileSummary):
    # None when the profile cannot be viewed or does not share that part.
    body_weight: list[SharedBodyMeasurement] | None = None
    goals: SharedGoals | None = None
    cardio_sessions: list[SharedCardioSession] | None = None
    training_time: TrainingTimeRead | None = None
    training_time_past_year: TrainingTimeRead | None = None
    consistency: SharedConsistencyRead | None = None


class SharedWorkoutPage(BaseModel):
    total: int
    workouts: list[TrainingWorkoutRead]
    personal_records: list[PersonalRecordRead]
    reactions: dict[str, WorkoutReactions] = {}


class SharedExerciseOption(BaseModel):
    id: str
    name: str


class SharedWorkoutFiltersRead(BaseModel):
    exercises: list[SharedExerciseOption]
    machines: list[MachinePhotoRead]
    workout_types: list[WorkoutTypeRead] = []


class FriendRequestRead(BaseModel):
    status: FriendStatus


class ConnectionRead(BaseModel):
    id: str
    display_name: str
    profile_photo_url: str | None
    since: datetime


Reaction = Literal["like", "love", "strong", "fire", "clap", "trophy"]


class ReactionChoice(BaseModel):
    reaction: Reaction


class ReactionCount(BaseModel):
    reaction: Reaction
    count: int


class WorkoutReactions(BaseModel):
    counts: list[ReactionCount]
    yours: Reaction | None = None
    comment_count: int = 0


class FeedFriend(BaseModel):
    id: str
    display_name: str
    profile_photo_url: str | None


class FriendFeedItem(BaseModel):
    friend: FeedFriend
    workout: TrainingWorkoutRead
    reactions: WorkoutReactions


class FriendFeedRead(BaseModel):
    """Each friend's latest session, plus how many friends share their profile."""

    items: list[FriendFeedItem]
    friends: int
    with_sessions: int


class FriendLatest(BaseModel):
    workout: TrainingWorkoutRead
    reactions: WorkoutReactions


class FriendActivity(ConnectionRead):
    """A friend, ``since`` you became friends, with their latest session and recent training."""

    latest: FriendLatest | None = None
    recent_workout_count: int = 0
    # Days with a shared workout in the last week or so, for a compact activity strip.
    training_dates: list[date] = []


class FriendsRead(BaseModel):
    """Friends with their latest activity, requests sent to you or by you, and blocked members.

    A private account is ``locked``: it sees only its blocked members, so it can still unblock.
    """

    locked: bool = False
    friends: list[FriendActivity] = []
    requests: list[ConnectionRead] = []
    sent: list[ConnectionRead] = []
    blocked: list[ConnectionRead] = []


class ReactionNotice(ConnectionRead):
    """A member's reaction to one of your workouts; ``since`` is when they reacted."""

    workout_id: str
    workout_name: str
    reaction: Reaction
    is_read: bool = False


class FriendNotice(ConnectionRead):
    is_read: bool = False


class NotificationsRead(BaseModel):
    # Requests waiting for you, and your requests that were accepted.
    requests: list[FriendNotice]
    accepted: list[FriendNotice]
    reactions: list[ReactionNotice] = []
    comments: list[dict] = []


def sharing_choices(db: Session, user_id: str) -> ProfileSharing:
    """The account's stored choices, or unsaved private defaults when it has none."""
    return db.get(ProfileSharing, user_id) or ProfileSharing(
        user_id=user_id,
        visibility=PRIVATE,
        share_notes=False,
        share_body_weight=False,
        share_goals=False,
        share_machine_photos=False,
    )


def require_sharing(db: Session, viewer: User) -> None:
    if sharing_choices(db, viewer.id).visibility == PRIVATE:
        raise api_error(
            403,
            "sharing_required",
            "Share your profile with friends or everyone to see other members' profiles.",
        )


def member_pair(first_id: str, second_id: str) -> tuple[str, str]:
    """A friendship's key: the two account ids, lowest first."""
    return (first_id, second_id) if first_id < second_id else (second_id, first_id)


def find_friendship(db: Session, user_id: str, other_id: str) -> Friendship | None:
    return db.get(Friendship, member_pair(user_id, other_id))


def friend_status(friendship: Friendship | None, viewer_id: str) -> FriendStatus:
    if friendship is None:
        return "none"
    if friendship.status == ACCEPTED:
        return "friends"
    return "outgoing" if friendship.requested_by_id == viewer_id else "incoming"


def involves(user_id: str):
    return or_(Friendship.member_a_id == user_id, Friendship.member_b_id == user_id)


def other_member(user_id: str):
    """The other member of a friendship row, as a SQL expression."""
    return case(
        (Friendship.member_a_id == user_id, Friendship.member_b_id),
        else_=Friendship.member_a_id,
    )


def friendships_of(db: Session, user_id: str) -> dict[str, Friendship]:
    """Every friendship and request involving the account, keyed by the other member."""
    return {
        friendship.other(user_id): friendship
        for friendship in db.scalars(select(Friendship).where(involves(user_id)))
    }


def blocked_member_ids(db: Session, user_id: str) -> set[str]:
    """A block prevents discovery and shared-data access in both directions."""
    return set(
        db.scalars(
            select(ProfileBlock.blocked_id)
            .where(ProfileBlock.blocker_id == user_id)
            .union(select(ProfileBlock.blocker_id).where(ProfileBlock.blocked_id == user_id))
        )
    )


def visible_member(db: Session, viewer: User, user_id: str) -> tuple[User, ProfileSharing]:
    """A sharing member the viewer can find: their name and photo, but maybe not their training."""
    # An owner can preview their own profile without making it visible to anyone else.
    if user_id == viewer.id:
        return viewer, sharing_choices(db, viewer.id)
    require_sharing(db, viewer)
    member = db.get(User, user_id)
    sharing = db.get(ProfileSharing, user_id)
    if (
        member is None
        or member.disabled_at is not None
        or sharing is None
        or sharing.visibility == PRIVATE
        or user_id in blocked_member_ids(db, viewer.id)
    ):
        raise api_error(404, "profile_not_found", "That profile is not shared.")
    return member, sharing


def can_view(
    viewer: User, member: User, sharing: ProfileSharing, friendship: Friendship | None
) -> bool:
    return (
        member.id == viewer.id
        or sharing.visibility == PUBLIC
        or (friendship is not None and friendship.status == ACCEPTED)
    )


def viewable_member(db: Session, viewer: User, user_id: str) -> tuple[User, ProfileSharing]:
    member, sharing = visible_member(db, viewer, user_id)
    if not can_view(viewer, member, sharing, find_friendship(db, viewer.id, member.id)):
        raise api_error(
            403,
            "friend_required",
            f"{member.display_name} shares with friends only. Send them a friend request first.",
        )
    return member, sharing


def photo_url(user: User) -> str | None:
    if not user.profile_photo_filename:
        return None
    version = user.profile_photo_filename.removesuffix(".webp")
    return f"/api/sharing/profiles/{user.id}/photo?v={version}"


class ActivityStats(NamedTuple):
    workouts: int = 0
    recent_workouts: int = 0
    last_workout_date: date | None = None
    cardio_sessions: int = 0
    records: int = 0


def workout_stats(db: Session, user_ids: list[str]) -> dict[str, ActivityStats]:
    """Per account: shared workouts, those in the last 30 days, the latest workout date, and
    totals of shared cardio sessions and weight and volume PRs, as counted on Today."""
    if not user_ids:
        return {}
    cutoff = date.today() - timedelta(days=RECENT_DAYS)
    rows = db.execute(
        select(
            TrainingWorkout.user_id,
            func.count(TrainingWorkout.id),
            func.sum(case((TrainingWorkout.workout_date >= cutoff, 1), else_=0)),
            func.max(TrainingWorkout.workout_date),
        )
        .where(TrainingWorkout.user_id.in_(user_ids), TrainingWorkout.is_sample.is_(False))
        .group_by(TrainingWorkout.user_id)
    )
    workouts = {user_id: (count, recent or 0, latest) for user_id, count, recent, latest in rows}
    cardio = dict(
        db.execute(
            select(CardioSession.user_id, func.count(CardioSession.id))
            .where(
                CardioSession.user_id.in_(user_ids),
                or_(
                    CardioSession.source_workout_id.is_(None),
                    CardioSession.source_workout_id.not_in(sample_workout_ids()),
                ),
            )
            .group_by(CardioSession.user_id)
        ).all()
    )
    records = dict(
        db.execute(
            select(PersonalRecord.user_id, func.count(PersonalRecord.id))
            .where(
                PersonalRecord.user_id.in_(user_ids),
                PersonalRecord.value > 0,
                PersonalRecord.record_type.in_(
                    [PersonalRecordType.WEIGHT, PersonalRecordType.REPS_AT_WEIGHT]
                ),
                PersonalRecord.workout_id.not_in(sample_workout_ids()),
            )
            .group_by(PersonalRecord.user_id)
        ).all()
    )
    return {
        user_id: ActivityStats(
            *workouts.get(user_id, (0, 0, None)),
            cardio_sessions=cardio.get(user_id, 0),
            records=records.get(user_id, 0),
        )
        for user_id in user_ids
    }


def friends_since(friendship: Friendship) -> datetime:
    return as_utc(friendship.accepted_at or friendship.created_at)


def profile_summary(
    viewer: User,
    member: User,
    sharing: ProfileSharing,
    friendship: Friendship | None,
    stats: ActivityStats | None,
) -> SharedProfileSummary:
    viewable = can_view(viewer, member, sharing, friendship)
    stats = stats or ActivityStats()
    status = "none" if member.id == viewer.id else friend_status(friendship, viewer.id)
    return SharedProfileSummary(
        id=member.id,
        display_name=member.display_name,
        profile_photo_url=photo_url(member),
        member_since=as_utc(member.created_at),
        visibility=sharing.visibility,
        is_you=member.id == viewer.id,
        friend_status=status,
        friends_since=friends_since(friendship) if friendship and status == "friends" else None,
        can_view=viewable,
        workout_count=stats.workouts if viewable else None,
        recent_workout_count=stats.recent_workouts if viewable else None,
        last_workout_date=stats.last_workout_date if viewable else None,
        cardio_count=stats.cardio_sessions if viewable else None,
        record_count=stats.records if viewable else None,
        shares=(
            SharedContent(
                notes=sharing.share_notes,
                body_weight=sharing.share_body_weight,
                goals=sharing.share_goals,
                machine_photos=sharing.share_machine_photos,
            )
            if viewable
            else None
        ),
    )


def sample_workout_ids():
    return select(TrainingWorkout.id).where(TrainingWorkout.is_sample.is_(True))


def shared_machine_photo(photo: MachinePhotoRead, user_id: str) -> MachinePhotoRead:
    for image in [photo, *photo.images]:
        base = f"/api/sharing/profiles/{user_id}/machine-photos/{image.id}"
        image.thumbnail_url = f"{base}?variant=thumbnail"
        image.full_url = f"{base}?variant=full"
    return photo


def shared_workout(workout: TrainingWorkout, sharing: ProfileSharing) -> TrainingWorkoutRead:
    """A workout with only what its owner shares: notes, body weight and photos on request."""
    shared = TrainingWorkoutRead.model_validate(workout)
    if not sharing.share_notes:
        shared.notes = None
    for movement in shared.movements:
        movement.exercise.is_favorite = False
        if sharing.share_machine_photos:
            for photo in movement.machine_photos:
                shared_machine_photo(photo, sharing.user_id)
        else:
            movement.machine_photos = []
        if not sharing.share_notes:
            movement.notes = None
            movement.machine_settings = []
        for item in movement.sets:
            if not sharing.share_notes:
                item.notes = None
            if not sharing.share_body_weight:
                item.bodyweight_kg = None
    return shared


def shared_goals(db: Session, user_id: str) -> SharedGoals:
    goal = db.scalar(
        select(BodyWeightGoal)
        .where(BodyWeightGoal.user_id == user_id, BodyWeightGoal.active.is_(True))
        .order_by(BodyWeightGoal.created_at.desc())
        .limit(1)
    )
    preferences = training_preferences(db, user_id)
    week = start_of_week(date.today(), preferences.week_start)
    sessions = list(
        db.scalars(
            select(CardioSession).where(
                CardioSession.user_id == user_id,
                CardioSession.session_date >= week,
                CardioSession.session_date <= week + timedelta(days=6),
            )
        )
    )
    return SharedGoals(
        body_weight=SharedBodyWeightGoal.model_validate(goal) if goal else None,
        zone2=zone2_week(sessions, week, preferences.zone2_goal_minutes),
    )


def shared_cardio(db: Session, user_id: str, sharing: ProfileSharing) -> list[SharedCardioSession]:
    sessions = db.scalars(
        select(CardioSession)
        .where(
            CardioSession.user_id == user_id,
            or_(
                CardioSession.source_workout_id.is_(None),
                CardioSession.source_workout_id.not_in(sample_workout_ids()),
            ),
        )
        .order_by(CardioSession.session_date.desc(), CardioSession.created_at.desc())
        .limit(RECENT_CARDIO_SESSIONS)
    )
    shared = [SharedCardioSession.model_validate(session) for session in sessions]
    if not sharing.share_notes:
        for session in shared:
            session.notes = None
    return shared


def pending_request_count(db: Session, user_id: str) -> int:
    """Friend requests other members sent this account, waiting for its answer."""
    return (
        db.scalar(
            select(func.count())
            .select_from(Friendship)
            .join(User, User.id == Friendship.requested_by_id)
            .where(
                involves(user_id),
                Friendship.status == PENDING,
                Friendship.requested_by_id != user_id,
                User.disabled_at.is_(None),
                User.id.not_in(blocked_member_ids(db, user_id)),
            )
        )
        or 0
    )


def sharing_read(db: Session, sharing: ProfileSharing) -> SharingRead:
    return SharingRead(
        **SharingChoices.model_validate(sharing).model_dump(),
        pending_requests=pending_request_count(db, sharing.user_id),
    )


@sharing_router.get("", response_model=SharingRead)
def get_sharing(user: CurrentUser, db: Db) -> SharingRead:
    return sharing_read(db, sharing_choices(db, user.id))


@sharing_router.put("", response_model=SharingRead)
def update_sharing(payload: SharingChoices, user: CurrentUser, db: Db) -> SharingRead:
    sharing = db.get(ProfileSharing, user.id)
    if sharing is None:
        sharing = ProfileSharing(user_id=user.id)
        db.add(sharing)
    for key, value in payload.model_dump().items():
        setattr(sharing, key, value)
    # Friend requests keep waiting: anyone can see a public profile, but friends are chosen.
    db.commit()
    db.refresh(sharing)
    return sharing_read(db, sharing)


@sharing_router.get("/suggestions", response_model=SuggestedProfilePage)
def suggested_profiles(user: CurrentUser, db: Db, page: int = Query(default=1, ge=1)):
    require_sharing(db, user)
    excluded = blocked_member_ids(db, user.id) | set(friendships_of(db, user.id))
    query = (
        select(User, ProfileSharing)
        .join(ProfileSharing, ProfileSharing.user_id == User.id)
        .where(
            ProfileSharing.visibility == PUBLIC,
            User.id != user.id,
            User.disabled_at.is_(None),
            User.id.not_in(excluded),
        )
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    # A request or privacy change can remove the last member on the current page.
    current_page = min(page, max(1, (total + 7) // 8))
    rows = db.execute(
        query.order_by(func.lower(User.display_name), User.id)
        .offset((current_page - 1) * 8)
        .limit(8)
    ).all()
    stats = workout_stats(db, [member.id for member, _ in rows])
    return SuggestedProfilePage(
        profiles=[
            SuggestedProfileSummary(
                **profile_summary(user, member, sharing, None, stats.get(member.id)).model_dump(),
                username=member.username,
            )
            for member, sharing in rows
        ],
        total=total,
        page=current_page,
    )


@sharing_router.get("/profiles", response_model=list[SharedProfileSummary])
def list_shared_profiles(
    user: CurrentUser, db: Db, q: str | None = Query(default=None, max_length=100)
) -> list[SharedProfileSummary]:
    require_sharing(db, user)
    query = (
        select(User, ProfileSharing)
        .join(ProfileSharing, ProfileSharing.user_id == User.id)
        .where(
            ProfileSharing.visibility != PRIVATE,
            User.disabled_at.is_(None),
            User.id.not_in(blocked_member_ids(db, user.id)),
        )
    )
    if q is not None:
        term = q.strip()
        if not term:
            return []
        try:
            account_id = str(UUID(term))
        except ValueError:
            account_id = None
    rows = db.execute(query).all()
    if q is not None:
        # Casefold handles Unicode display names, unlike SQLite's ASCII-only lower().
        folded = term.casefold()
        rows = [
            (member, sharing)
            for member, sharing in rows
            if member.id == account_id
            or folded in member.display_name.casefold()
            or folded in member.username.casefold()
        ]
    friendships = friendships_of(db, user.id)
    viewable_ids = [
        member.id
        for member, sharing in rows
        if can_view(user, member, sharing, friendships.get(member.id))
    ]
    stats = workout_stats(db, viewable_ids)
    profiles = [
        profile_summary(user, member, sharing, friendships.get(member.id), stats.get(member.id))
        for member, sharing in rows
    ]

    def group(item: SharedProfileSummary) -> int:
        if item.is_you:
            return 0
        if item.friend_status == "friends":
            return 1
        return 2 if item.can_view else 3

    # You, your friends, other public profiles, then friends-only profiles to request.
    profiles.sort(key=lambda item: item.display_name.casefold())
    profiles.sort(key=lambda item: item.last_workout_date or date.min, reverse=True)
    profiles.sort(key=group)
    return profiles


def shared_consistency(db: Session, user_id: str) -> SharedConsistencyRead:
    # Calendar history must not depend on the paginated/filtered shared workout list.
    workouts = list(
        db.scalars(
            select(TrainingWorkout)
            .where(TrainingWorkout.user_id == user_id, TrainingWorkout.is_sample.is_(False))
            .options(*workout_options())
        )
    )
    catalog = workout_type_catalog(db, user_id)
    heatmap = build_heatmap(workouts, [], catalog)
    # The grid needs counts and type colours only. Do not expose exercise/bodyweight details.
    for day in heatmap:
        day.workouts = []
    today = date.today()
    dates = {workout.workout_date for workout in workouts if workout.workout_date <= today}
    cursor = today if today in dates else today - timedelta(days=1)
    streak = 0
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    first_day = start_of_week(today, training_preferences(db, user_id).week_start) - timedelta(
        weeks=11
    )
    return SharedConsistencyRead(
        heatmap=heatmap,
        current_streak=streak,
        training_days=sum(first_day <= day <= today for day in dates),
        workout_types=catalog,
    )


@sharing_router.get("/profiles/{user_id}", response_model=SharedProfileRead)
def get_shared_profile(user_id: str, user: CurrentUser, db: Db) -> SharedProfileRead:
    member, sharing = visible_member(db, user, user_id)
    summary = profile_summary(
        user,
        member,
        sharing,
        find_friendship(db, user.id, member.id),
        workout_stats(db, [member.id]).get(member.id),
    )
    if not summary.can_view:
        return SharedProfileRead(**summary.model_dump())
    body_weight = (
        [
            SharedBodyMeasurement.model_validate(measurement)
            for measurement in db.scalars(
                select(BodyMeasurement)
                .where(BodyMeasurement.user_id == member.id, BodyMeasurement.is_sample.is_(False))
                .order_by(BodyMeasurement.measurement_date.desc())
            )
        ]
        if sharing.share_body_weight
        else None
    )
    return SharedProfileRead(
        **summary.model_dump(),
        body_weight=body_weight,
        goals=shared_goals(db, member.id) if sharing.share_goals else None,
        # Cardio is shared with workouts; its notes still follow the notes choice.
        cardio_sessions=shared_cardio(db, member.id, sharing),
        training_time=training_time_totals(db, member.id),
        training_time_past_year=training_time_totals(
            db, member.id, since=past_year_start(date.today())
        ),
        consistency=shared_consistency(db, member.id),
    )


@sharing_router.get("/profiles/{user_id}/workouts", response_model=SharedWorkoutPage)
def list_shared_workouts(
    user_id: str,
    user: CurrentUser,
    db: Db,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_WORKOUT_PAGE)] = 10,
    category: WorkoutCategory | None = None,
    workout_type_id: str | None = None,
    exercise_id: str | None = None,
    machine_photo_id: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> SharedWorkoutPage:
    member, sharing = viewable_member(db, user, user_id)
    if start_date and end_date and start_date > end_date:
        raise api_error(422, "invalid_date_range", "From date must not be after To date.")
    owned = [TrainingWorkout.user_id == member.id, TrainingWorkout.is_sample.is_(False)]
    if workout_type_id:
        owned.append(TrainingWorkout.workout_type_id == workout_type_id)
    elif category:
        owned.append(TrainingWorkout.category == category)
        owned.append(TrainingWorkout.workout_type_id.is_(None))
    if exercise_id:
        owned.append(TrainingWorkout.movements.any(WorkoutMovement.exercise_id == exercise_id))
    if machine_photo_id:
        if not sharing.share_machine_photos:
            raise api_error(
                403, "machine_photos_not_shared", "This member is not sharing machine photos."
            )
        owned.append(
            TrainingWorkout.movements.any(
                WorkoutMovement.machine_photos.any(MachinePhoto.id == machine_photo_id)
            )
        )
    if start_date:
        owned.append(TrainingWorkout.workout_date >= start_date)
    if end_date:
        owned.append(TrainingWorkout.workout_date <= end_date)
    total = db.scalar(select(func.count(TrainingWorkout.id)).where(*owned)) or 0
    workouts = list(
        db.scalars(
            select(TrainingWorkout)
            .where(*owned)
            .options(*workout_options())
            .order_by(TrainingWorkout.workout_date.desc(), TrainingWorkout.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    records = (
        db.scalars(
            select(PersonalRecord)
            .where(PersonalRecord.workout_id.in_([workout.id for workout in workouts]))
            .options(selectinload(PersonalRecord.exercise))
        )
        if workouts
        else []
    )
    return SharedWorkoutPage(
        total=total,
        workouts=[shared_workout(workout, sharing) for workout in workouts],
        personal_records=[PersonalRecordRead.model_validate(record) for record in records],
        reactions=reaction_summaries(db, user.id, [workout.id for workout in workouts]),
    )


@sharing_router.get("/profiles/{user_id}/workout-filters", response_model=SharedWorkoutFiltersRead)
def shared_workout_filters(user_id: str, user: CurrentUser, db: Db) -> SharedWorkoutFiltersRead:
    member, sharing = viewable_member(db, user, user_id)
    owned = [TrainingWorkout.user_id == member.id, TrainingWorkout.is_sample.is_(False)]
    exercises = db.execute(
        select(Exercise.id, Exercise.name)
        .join(WorkoutMovement, WorkoutMovement.exercise_id == Exercise.id)
        .join(TrainingWorkout, TrainingWorkout.id == WorkoutMovement.workout_id)
        .where(*owned)
        .distinct()
        .order_by(Exercise.name)
    )
    machines = []
    if sharing.share_machine_photos:
        photos = db.scalars(
            select(MachinePhoto)
            .join(
                movement_machine_photos,
                movement_machine_photos.c.machine_photo_id == MachinePhoto.id,
            )
            .join(WorkoutMovement, WorkoutMovement.id == movement_machine_photos.c.movement_id)
            .join(TrainingWorkout, TrainingWorkout.id == WorkoutMovement.workout_id)
            .where(*owned, MachinePhoto.user_id == member.id)
            .distinct()
            .order_by(MachinePhoto.caption)
        )
        for photo in photos:
            item = MachinePhotoRead.model_validate(photo)
            shared_machine_photo(item, member.id)
            machines.append(item)
    used_type_ids = set(db.scalars(select(TrainingWorkout.workout_type_id).where(*owned)))
    return SharedWorkoutFiltersRead(
        exercises=[SharedExerciseOption(id=row.id, name=row.name) for row in exercises],
        machines=machines,
        workout_types=[
            item
            for item in workout_type_catalog(db, member.id)
            if not item.is_custom or item.id in used_type_ids
        ],
    )


@sharing_router.get("/profiles/{user_id}/photo")
def get_shared_profile_photo(
    user_id: str, user: CurrentUser, db: Db, settings: AppSettings
) -> FileResponse:
    # The profile photo is always shared, including on friends-only profiles of non-friends.
    member, _sharing = visible_member(db, user, user_id)
    filename = member.profile_photo_filename
    path = profile_photo_path(settings, filename) if filename else None
    if path is None or not path.is_file():
        raise api_error(404, "profile_photo_not_found", "This profile has no photo.")
    # Revalidated on every use, so it disappears as soon as the owner stops sharing.
    return FileResponse(
        path, media_type="image/webp", headers={"Cache-Control": "private, no-cache"}
    )


@sharing_router.get("/profiles/{user_id}/machine-photos/{photo_id}")
def get_shared_machine_photo(
    user_id: str,
    photo_id: str,
    user: CurrentUser,
    db: Db,
    settings: AppSettings,
    variant: Annotated[str, Query(pattern="^(thumbnail|full)$")] = "full",
) -> FileResponse:
    member, sharing = viewable_member(db, user, user_id)
    in_shared_workout = exists(
        select(movement_machine_photos.c.movement_id)
        .join(WorkoutMovement, WorkoutMovement.id == movement_machine_photos.c.movement_id)
        .join(TrainingWorkout, TrainingWorkout.id == WorkoutMovement.workout_id)
        .where(
            movement_machine_photos.c.machine_photo_id
            == func.coalesce(MachinePhoto.merged_into_id, MachinePhoto.id),
            TrainingWorkout.user_id == member.id,
            TrainingWorkout.is_sample.is_(False),
        )
    )
    photo = (
        db.scalar(
            select(MachinePhoto).where(
                MachinePhoto.id == photo_id, MachinePhoto.user_id == member.id, in_shared_workout
            )
        )
        if sharing.share_machine_photos
        else None
    )
    if photo is None:
        raise api_error(404, "machine_photo_not_found", "That machine photo is not shared.")
    filename = photo.thumbnail_filename if variant == "thumbnail" else photo.full_filename
    root = settings.machine_photos_dir.resolve()
    path = (root / filename).resolve()
    if root not in path.parents or not path.is_file():
        raise api_error(404, "machine_photo_not_found", "That machine photo is not shared.")
    return FileResponse(
        path, media_type=photo.media_type, headers={"Cache-Control": "private, no-cache"}
    )


def accept_request(friendship: Friendship) -> None:
    friendship.status = ACCEPTED
    friendship.accepted_at = utc_now()
    # The requester now has news: their request was accepted.
    friendship.notification_seen = False


@sharing_router.post("/friends/{user_id}", response_model=FriendRequestRead)
def add_friend(user_id: str, user: CurrentUser, db: Db) -> FriendRequestRead:
    """Send a friend request, or accept theirs when they already asked you."""
    if user_id == user.id:
        raise api_error(422, "cannot_friend_yourself", "You cannot add yourself as a friend.")
    member, _sharing = visible_member(db, user, user_id)
    friendship = find_friendship(db, user.id, member.id)
    if friendship is None:
        member_a, member_b = member_pair(user.id, member.id)
        db.add(
            Friendship(
                member_a_id=member_a,
                member_b_id=member_b,
                requested_by_id=user.id,
                status=PENDING,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # A repeated tap, or their request, raced this one; that row stands.
            db.rollback()
        friendship = find_friendship(db, user.id, member.id)
    elif friendship.status == PENDING and friendship.requested_by_id != user.id:
        accept_request(friendship)
        db.commit()
    return FriendRequestRead(status=friend_status(friendship, user.id))


@sharing_router.post("/friends/{user_id}/accept", response_model=FriendRequestRead)
def accept_friend(user_id: str, user: CurrentUser, db: Db) -> FriendRequestRead:
    friendship = find_friendship(db, user.id, user_id)
    if (
        friendship is None
        or (friendship.status == PENDING and friendship.requested_by_id == user.id)
        or user_id in blocked_member_ids(db, user.id)
    ):
        raise api_error(404, "friend_request_not_found", "That friend request was withdrawn.")
    if friendship.status == PENDING:
        accept_request(friendship)
        db.commit()
    return FriendRequestRead(status="friends")


@sharing_router.delete("/friends/{user_id}", status_code=204)
def remove_friend(user_id: str, user: CurrentUser, db: Db) -> None:
    """Remove a friend, cancel your request or decline theirs. Always allowed."""
    db.execute(delete(Friendship).where(*friendship_key(user.id, user_id)))
    db.commit()


def friendship_key(user_id: str, other_id: str):
    member_a, member_b = member_pair(user_id, other_id)
    return Friendship.member_a_id == member_a, Friendship.member_b_id == member_b


def reaction_summaries(
    db: Session, viewer_id: str, workout_ids: list[str]
) -> dict[str, WorkoutReactions]:
    """Reaction totals for each workout, plus the viewer's own reaction."""
    summaries = {workout_id: WorkoutReactions(counts=[]) for workout_id in workout_ids}
    counts: dict[str, Counter[str]] = {workout_id: Counter() for workout_id in workout_ids}
    rows = (
        db.execute(
            select(WorkoutReaction.workout_id, WorkoutReaction.user_id, WorkoutReaction.reaction)
            .join(User, User.id == WorkoutReaction.user_id)
            .where(
                WorkoutReaction.workout_id.in_(workout_ids),
                User.disabled_at.is_(None),
                User.id.not_in(blocked_member_ids(db, viewer_id)),
            )
        ).all()
        if workout_ids
        else []
    )
    for workout_id, user_id, reaction in rows:
        counts[workout_id][reaction] += 1
        if user_id == viewer_id:
            summaries[workout_id].yours = reaction
    for workout_id, counter in counts.items():
        summaries[workout_id].counts = [
            ReactionCount(reaction=reaction, count=counter[reaction])
            for reaction in get_args(Reaction)
            if counter[reaction]
        ]
    from .comments import visible_comments

    viewer = db.get(User, viewer_id)
    for workout_id in workout_ids:
        summaries[workout_id].comment_count = len(visible_comments(db, viewer, workout_id))
    return summaries


def shared_friend_ids(db: Session, user_id: str):
    """Friends who still share their profile and are neither disabled nor blocked."""
    friend_id = other_member(user_id)
    return (
        select(friend_id)
        .join(User, User.id == friend_id)
        .join(ProfileSharing, ProfileSharing.user_id == friend_id)
        .where(
            involves(user_id),
            Friendship.status == ACCEPTED,
            User.disabled_at.is_(None),
            ProfileSharing.visibility != PRIVATE,
            User.id.not_in(blocked_member_ids(db, user_id)),
        )
    )


def latest_workouts(db: Session, user_ids) -> list[tuple[TrainingWorkout, User, ProfileSharing]]:
    """Each member's newest real workout, newest first."""
    newest = (
        select(
            TrainingWorkout.id,
            func.row_number()
            .over(
                partition_by=TrainingWorkout.user_id,
                order_by=(
                    TrainingWorkout.workout_date.desc(),
                    TrainingWorkout.created_at.desc(),
                    TrainingWorkout.id.desc(),
                ),
            )
            .label("position"),
        )
        .where(TrainingWorkout.user_id.in_(user_ids), TrainingWorkout.is_sample.is_(False))
        .subquery()
    )
    return [
        tuple(row)
        for row in db.execute(
            select(TrainingWorkout, User, ProfileSharing)
            .join(newest, newest.c.id == TrainingWorkout.id)
            .join(User, User.id == TrainingWorkout.user_id)
            .join(ProfileSharing, ProfileSharing.user_id == TrainingWorkout.user_id)
            .where(newest.c.position == 1)
            .options(*workout_options())
            .order_by(
                TrainingWorkout.workout_date.desc(),
                TrainingWorkout.created_at.desc(),
                TrainingWorkout.id.desc(),
            )
        ).all()
    ]


@sharing_router.get("/feed", response_model=FriendFeedRead)
def friend_feed(
    user: CurrentUser, db: Db, limit: int = Query(default=FEED_SIZE, ge=1)
) -> FriendFeedRead:
    """Home's Friends card: each friend's latest session, most recent first."""
    require_sharing(db, user)
    friend_ids = shared_friend_ids(db, user.id)
    friends = db.scalar(select(func.count()).select_from(friend_ids.subquery())) or 0
    sessions = latest_workouts(db, friend_ids)
    rows = sessions[:limit]
    reactions = reaction_summaries(db, user.id, [workout.id for workout, _, _ in rows])
    return FriendFeedRead(
        friends=friends,
        with_sessions=len(sessions),
        items=[
            FriendFeedItem(
                friend=FeedFriend(
                    id=member.id,
                    display_name=member.display_name,
                    profile_photo_url=photo_url(member),
                ),
                workout=shared_workout(workout, sharing),
                reactions=reactions[workout.id],
            )
            for workout, member, sharing in rows
        ],
    )


def reactable_workout(db: Session, user: User, workout_id: str) -> TrainingWorkout:
    """Another member's real workout that ``user`` is allowed to see."""
    workout = db.get(TrainingWorkout, workout_id)
    if workout is None or workout.is_sample or workout.user_id in (None, user.id):
        raise api_error(404, "workout_not_found", "That workout is not shared with you.")
    viewable_member(db, user, workout.user_id)
    return workout


class ReactionPerson(FeedFriend):
    reaction: Reaction


class ReactionPeoplePage(BaseModel):
    items: list[ReactionPerson]
    total: int
    next_offset: int | None


@sharing_router.get("/workouts/{workout_id}/reactions", response_model=ReactionPeoplePage)
def workout_reaction_people(
    workout_id: str, user: CurrentUser, db: Db, offset: int = Query(0, ge=0)
) -> ReactionPeoplePage:
    from .comments import discussion_workout

    workout = discussion_workout(db, user, workout_id)
    visible = (
        WorkoutReaction.workout_id == workout.id,
        User.disabled_at.is_(None),
        User.id.not_in(blocked_member_ids(db, user.id)),
    )
    total = (
        db.scalar(
            select(func.count())
            .select_from(WorkoutReaction)
            .join(User, User.id == WorkoutReaction.user_id)
            .where(*visible)
        )
        or 0
    )
    rows = db.execute(
        select(WorkoutReaction, User)
        .join(User, User.id == WorkoutReaction.user_id)
        .where(*visible)
        .order_by(WorkoutReaction.created_at.desc(), User.id)
        .offset(offset)
        .limit(30)
    ).all()
    return ReactionPeoplePage(
        items=[
            ReactionPerson(
                id=member.id,
                display_name=member.display_name,
                profile_photo_url=photo_url(member),
                reaction=reaction.reaction,
            )
            for reaction, member in rows
        ],
        total=total,
        next_offset=offset + len(rows) if offset + len(rows) < total else None,
    )


@sharing_router.put("/workouts/{workout_id}/reaction", response_model=WorkoutReactions)
def react_to_workout(
    workout_id: str, payload: ReactionChoice, user: CurrentUser, db: Db
) -> WorkoutReactions:
    workout = reactable_workout(db, user, workout_id)
    reaction = db.get(WorkoutReaction, (workout.id, user.id))
    if reaction is None:
        db.add(WorkoutReaction(workout_id=workout.id, user_id=user.id, reaction=payload.reaction))
    elif reaction.reaction != payload.reaction:
        # A changed reaction is new to the owner again.
        reaction.reaction = payload.reaction
        reaction.created_at = utc_now()
        reaction.notification_seen = False
    try:
        db.commit()
    except IntegrityError:
        # Another tab reacted first; that reaction stands.
        db.rollback()
    return reaction_summaries(db, user.id, [workout.id])[workout.id]


@sharing_router.delete("/workouts/{workout_id}/reaction", response_model=WorkoutReactions)
def remove_workout_reaction(workout_id: str, user: CurrentUser, db: Db) -> WorkoutReactions:
    workout = reactable_workout(db, user, workout_id)
    db.execute(
        delete(WorkoutReaction).where(
            WorkoutReaction.workout_id == workout.id, WorkoutReaction.user_id == user.id
        )
    )
    db.commit()
    return reaction_summaries(db, user.id, [workout.id])[workout.id]


def connection(member: User, since: datetime) -> ConnectionRead:
    return ConnectionRead(
        id=member.id,
        display_name=member.display_name,
        profile_photo_url=photo_url(member),
        since=as_utc(since),
    )


def friend_requests(db: Session, user: User) -> list[tuple[User, Friendship]]:
    """Requests involving the account, newest first, from members who are still reachable."""
    other_id = other_member(user.id)
    return [
        (member, friendship)
        for member, friendship in db.execute(
            select(User, Friendship)
            .join(Friendship, User.id == other_id)
            .where(
                involves(user.id),
                Friendship.status == PENDING,
                User.disabled_at.is_(None),
                User.id.not_in(blocked_member_ids(db, user.id)),
            )
            .order_by(Friendship.created_at.desc())
        )
    ]


def training_dates(db: Session, user_ids: list[str]) -> dict[str, list[date]]:
    if not user_ids:
        return {}
    cutoff = date.today() - timedelta(days=ACTIVITY_DAYS - 1)
    dates: dict[str, list[date]] = {user_id: [] for user_id in user_ids}
    for user_id, day in db.execute(
        select(TrainingWorkout.user_id, TrainingWorkout.workout_date)
        .where(
            TrainingWorkout.user_id.in_(user_ids),
            TrainingWorkout.is_sample.is_(False),
            TrainingWorkout.workout_date >= cutoff,
        )
        .distinct()
        .order_by(TrainingWorkout.workout_date)
    ):
        dates[user_id].append(day)
    return dates


def blocked_connections(db: Session, user: User) -> list[ConnectionRead]:
    return [
        ConnectionRead(
            id=member.id,
            display_name=member.display_name,
            profile_photo_url=None,
            since=as_utc(block.created_at),
        )
        for member, block in db.execute(
            select(User, ProfileBlock)
            .join(ProfileBlock, ProfileBlock.blocked_id == User.id)
            .where(ProfileBlock.blocker_id == user.id)
            .order_by(ProfileBlock.created_at.desc())
        )
    ]


@sharing_router.get("/friends", response_model=FriendsRead)
def list_friends(user: CurrentUser, db: Db) -> FriendsRead:
    """Social's Friends and Find tabs: friends by latest activity, requests and blocks."""
    if sharing_choices(db, user.id).visibility == PRIVATE:
        return FriendsRead(locked=True, blocked=blocked_connections(db, user))
    friendships = friendships_of(db, user.id)
    members = list(db.scalars(select(User).where(User.id.in_(shared_friend_ids(db, user.id)))))
    ids = [member.id for member in members]
    latest = {
        workout.user_id: (workout, sharing) for workout, _, sharing in latest_workouts(db, ids)
    }
    reactions = reaction_summaries(db, user.id, [workout.id for workout, _ in latest.values()])
    stats = workout_stats(db, ids)
    dates = training_dates(db, ids)
    friends = []
    for member in members:
        newest = latest.get(member.id)
        friends.append(
            FriendActivity(
                **connection(member, friends_since(friendships[member.id])).model_dump(),
                latest=(
                    FriendLatest(
                        workout=shared_workout(newest[0], newest[1]),
                        reactions=reactions[newest[0].id],
                    )
                    if newest
                    else None
                ),
                recent_workout_count=stats[member.id].recent_workouts,
                training_dates=dates[member.id],
            )
        )
    # Most recent activity first; friends without a session come last, by name.
    friends.sort(key=lambda item: item.display_name.casefold())
    friends.sort(
        key=lambda item: item.latest.workout.workout_date if item.latest else date.min,
        reverse=True,
    )
    requests = friend_requests(db, user)
    return FriendsRead(
        friends=friends,
        requests=[
            connection(member, friendship.created_at)
            for member, friendship in requests
            if friendship.requested_by_id != user.id
        ],
        sent=[
            connection(member, friendship.created_at)
            for member, friendship in requests
            if friendship.requested_by_id == user.id
        ],
        blocked=blocked_connections(db, user),
    )


@sharing_router.get("/notifications", response_model=NotificationsRead)
def friend_notifications(user: CurrentUser, db: Db) -> NotificationsRead:
    from .comments import comment_notices

    blocked = blocked_member_ids(db, user.id)
    requests = [
        FriendNotice(
            **connection(member, friendship.created_at).model_dump(),
            is_read=friendship.notification_seen,
        )
        for member, friendship in friend_requests(db, user)
        if friendship.requested_by_id != user.id
    ]
    other_id = other_member(user.id)
    accepted = [
        FriendNotice(
            **connection(member, friends_since(friendship)).model_dump(),
            is_read=friendship.notification_seen,
        )
        for member, friendship in db.execute(
            select(User, Friendship)
            .join(Friendship, User.id == other_id)
            .where(
                involves(user.id),
                Friendship.status == ACCEPTED,
                Friendship.requested_by_id == user.id,
                User.disabled_at.is_(None),
                User.id.not_in(blocked),
            )
            .order_by(Friendship.accepted_at.desc())
            .limit(MAX_REACTION_NOTICES)
        )
    ]
    reactions = db.execute(
        select(WorkoutReaction, User, TrainingWorkout.name)
        .join(User, User.id == WorkoutReaction.user_id)
        .join(TrainingWorkout, TrainingWorkout.id == WorkoutReaction.workout_id)
        .where(
            TrainingWorkout.user_id == user.id,
            User.disabled_at.is_(None),
            User.id.not_in(blocked),
        )
        .order_by(WorkoutReaction.created_at.desc())
        .limit(MAX_REACTION_NOTICES)
    ).all()
    return NotificationsRead(
        requests=requests,
        accepted=accepted,
        comments=comment_notices(db, user),
        reactions=[
            ReactionNotice(
                id=member.id,
                display_name=member.display_name,
                profile_photo_url=photo_url(member),
                since=as_utc(reaction.created_at),
                workout_id=reaction.workout_id,
                workout_name=workout_name,
                reaction=reaction.reaction,
                is_read=reaction.notification_seen,
            )
            for reaction, member, workout_name in reactions
        ],
    )


class NotificationReadReference(BaseModel):
    kind: Literal["request", "accepted", "reaction", "comment"]
    id: str
    since: datetime
    workout_id: str | None = None


class NotificationsSeen(BaseModel):
    items: list[NotificationReadReference]


def notice_matches(friendship: Friendship | None, user_id: str, kind: str, since: datetime) -> bool:
    """Whether the friendship still is the request or acceptance the client saw."""
    if friendship is None:
        return False
    if kind == "request":
        return (
            friendship.status == PENDING
            and friendship.requested_by_id != user_id
            and as_utc(friendship.created_at) == as_utc(since)
        )
    return (
        friendship.status == ACCEPTED
        and friendship.requested_by_id == user_id
        and friends_since(friendship) == as_utc(since)
    )


@sharing_router.post("/notifications/read", status_code=204)
def mark_notifications_read(payload: NotificationsSeen, user: CurrentUser, db: Db) -> None:
    """Mark the displayed events read; newer events and other accounts stay unread."""
    friendships = friendships_of(db, user.id)
    workout_ids = {item.workout_id for item in payload.items if item.kind == "reaction"}
    reactions = {
        (reaction.workout_id, reaction.user_id): reaction
        for reaction in db.scalars(
            select(WorkoutReaction)
            .join(TrainingWorkout, TrainingWorkout.id == WorkoutReaction.workout_id)
            .where(TrainingWorkout.user_id == user.id, WorkoutReaction.workout_id.in_(workout_ids))
        )
    }
    for item in payload.items:
        if item.kind == "comment":
            from .models import CommentNotification

            notice = db.get(CommentNotification, item.id)
            if (
                notice
                and notice.recipient_id == user.id
                and as_utc(notice.created_at) == as_utc(item.since)
            ):
                notice.is_read = True
        elif item.kind == "reaction":
            reaction = reactions.get((item.workout_id, item.id))
            if reaction is not None and as_utc(reaction.created_at) == as_utc(item.since):
                reaction.notification_seen = True
        else:
            friendship = friendships.get(item.id)
            if notice_matches(friendship, user.id, item.kind, item.since):
                friendship.notification_seen = True
    db.commit()


class NotificationDismiss(BaseModel):
    since: datetime


@sharing_router.post("/reactions/{workout_id}/{user_id}/dismiss", status_code=204)
def dismiss_reaction_notification(
    workout_id: str, user_id: str, payload: NotificationDismiss, user: CurrentUser, db: Db
) -> None:
    reaction = db.get(WorkoutReaction, (workout_id, user_id))
    workout = db.get(TrainingWorkout, workout_id)
    # Match the reaction the client saw, so a newer reaction from the same member stays unread.
    if (
        reaction is not None
        and workout is not None
        and workout.user_id == user.id
        and as_utc(reaction.created_at) == as_utc(payload.since)
    ):
        reaction.notification_seen = True
        db.commit()


@sharing_router.post("/notifications/{user_id}/dismiss", status_code=204)
def dismiss_friend_notification(
    user_id: str, payload: NotificationDismiss, user: CurrentUser, db: Db
) -> None:
    friendship = find_friendship(db, user.id, user_id)
    # Match the acceptance the client saw so a later friendship cannot be dismissed by a stale tab.
    if notice_matches(friendship, user.id, "accepted", payload.since):
        friendship.notification_seen = True
        db.commit()


@sharing_router.post("/blocks/{user_id}", status_code=204)
def block_member(user_id: str, user: CurrentUser, db: Db) -> None:
    if user_id == user.id:
        raise api_error(422, "cannot_block_yourself", "You cannot block yourself.")
    member = db.get(User, user_id)
    if member is None:
        raise api_error(404, "profile_not_found", "That account was not found.")
    if db.get(ProfileBlock, (user.id, user_id)) is None:
        db.add(ProfileBlock(blocker_id=user.id, blocked_id=user_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
    db.execute(delete(Friendship).where(*friendship_key(user.id, user_id)))
    # Reactions and their notifications between these two accounts disappear together.
    db.execute(
        delete(WorkoutReaction).where(
            or_(
                and_(
                    WorkoutReaction.user_id == user_id,
                    WorkoutReaction.workout_id.in_(
                        select(TrainingWorkout.id).where(TrainingWorkout.user_id == user.id)
                    ),
                ),
                and_(
                    WorkoutReaction.user_id == user.id,
                    WorkoutReaction.workout_id.in_(
                        select(TrainingWorkout.id).where(TrainingWorkout.user_id == user_id)
                    ),
                ),
            )
        )
    )
    db.commit()


@sharing_router.delete("/blocks/{user_id}", status_code=204)
def unblock_member(user_id: str, user: CurrentUser, db: Db) -> None:
    db.execute(
        delete(ProfileBlock).where(
            ProfileBlock.blocker_id == user.id, ProfileBlock.blocked_id == user_id
        )
    )
    db.commit()
