"""Profile borders: frames around an account's photo, earned from its own training.

Each border is one challenge with a single number to reach. The numbers come from the account's
whole history (its best streak, its heaviest lift, its biggest cardio week), so a border stays
earned for as long as the training behind it is logged. Sample workouts never count, and
neither does anything brought in by a CSV import: borders are earned by logging in Relay. Late
logging is fine, but only two backdated entries a week (saved more than two days after their
date) count towards borders.

Strength borders have a standard for each sex. That is why an account's sex is fixed once it is
chosen: it decides which standard the account is measured against. Strength is also where the
rarest look, mythic, lives: effort alone (more minutes, more sessions) tops out lower.

Yearly event borders can only be earned while their window is open:
training logged after the window closes does not count, but a border earned in time stays earned.
"""

from __future__ import annotations

import calendar
import re
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from functools import cache
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from .exercise_aliases import canonical_exercise_name
from .imported_entries import imported_ids
from .models import (
    BodyMeasurement,
    CardioSession,
    Exercise,
    ExerciseKind,
    PersonalRecord,
    PersonalRecordType,
    ProfileBorderUnlock,
    SetType,
    TrainingWorkout,
    User,
    WorkoutMovement,
    WorkoutSet,
)
from .profile_sex import Sex
from .relative_strength import BodyweightHistory
from .training_metrics import KG_TO_LB, get_setting, preferred_weight_unit, start_of_week

Rarity = Literal["common", "rare", "epic", "legendary", "mythic"]
Status = Literal["active", "upcoming", "ended"]

# Workouts that start from 4 am up to 7 am are early; from 9 pm until 4 am they are late.
EARLY_FROM, EARLY_UNTIL, LATE_FROM = time(4), time(7), time(21)

# The barbell lifts the strength borders read, by canonical exercise name.
LIFT_NAMES = {
    "bench": {"barbell bench press"},
    "squat": {"back squat"},
    "deadlift": {"deadlift", "conventional deadlift", "sumo deadlift"},
}


@dataclass(frozen=True)
class Metric:
    """One of an account's numbers that borders are earned against; see border_stats."""

    group: str
    # The challenge, where {target} stands for the number to reach.
    requirement: str
    unit: str = ""
    # A weight is kept in kg and shown in the account's own unit.
    weight: bool = False


PERCENT_BW = "% BW"

# Pull-ups, chin-ups and dips, by canonical exercise name: Gravity Defier's bodyweight strength.
BODYWEIGHT_MOVES = {
    "pull-up",
    "chin-up",
    "dips",
    "dip",
    "weighted pull-up",
    "weighted chin-up",
    "weighted dips",
    "weighted dip",
}

METRICS = {
    "workouts": Metric("Consistency", "Log {target} workouts", "workouts"),
    "log_streak": Metric(
        "Consistency", "Log a workout, cardio or weigh-in {target} days in a row", "days"
    ),
    "monday_streak": Metric("Consistency", "Train on {target} Mondays in a row", "Mondays"),
    "week_streak": Metric(
        "Consistency", "Train 3 or more days a week for {target} weeks running", "weeks"
    ),
    "early_starts": Metric("Consistency", "Start {target} workouts before 7 am", "workouts"),
    "late_starts": Metric("Consistency", "Start {target} workouts after 9 pm", "workouts"),
    "months_trained": Metric("Consistency", "Train in all {target} months of the year", "months"),
    "tonnes": Metric("Volume", "Lift {target} tonnes in total", "t"),
    "training_hours": Metric("Volume", "Train for {target} hours in total", "hours"),
    "bench_kg": Metric("Strength", "Bench press {target}", weight=True),
    "squat_kg": Metric("Strength", "Squat {target}", weight=True),
    "deadlift_kg": Metric("Strength", "Deadlift {target}", weight=True),
    "bodyweight_reps": Metric(
        "Bodyweight strength", "Do {target} in one set of pull-ups, chin-ups or dips", "reps"
    ),
    "bodyweight_added": Metric(
        "Bodyweight strength",
        "Do a pull-up, chin-up or dip with {target} of your body weight added",
        PERCENT_BW,
    ),
    "records_in_workout": Metric("Records", "Set {target} PRs in one workout", "PRs"),
    "records": Metric("Records", "Set {target} PRs", "PRs"),
    "cardio_month_km": Metric("Cardio", "Cover {target} km of cardio in one calendar month", "km"),
    "cardio_week_minutes": Metric("Cardio", "Do {target} minutes of cardio in one week", "min"),
    "hybrid_weeks": Metric(
        "Cardio",
        "Lift on 3 days and do 90 minutes of cardio in the same week, {target} times",
        "weeks",
    ),
    "climbed_m": Metric("Cardio", "Climb {target} m of elevation in total", "m"),
    # Limited editions: days with a workout or cardio inside the border's window.
    "window_days": Metric("Limited", "Train on {target} days", "days"),
}


@dataclass(frozen=True)
class Window:
    """When a limited border can be earned: from `starts` to `ends`, both days included."""

    kind: Literal["event"]
    starts: date
    ends: date

    def status(self, today: date) -> Status:
        if today < self.starts:
            return "upcoming"
        return "ended" if today > self.ends else "active"

    def describe(self) -> str:
        start, end = self.starts, self.ends
        if (start.year, start.month) == (end.year, end.month) and start.day == 1:
            if end.day == calendar.monthrange(end.year, end.month)[1]:
                return f"in {end:%B} {end.year}"
        first = f"{start.day} {start:%b}" + (f" {start.year}" if start.year != end.year else "")
        return f"between {first} and {end.day} {end:%b} {end.year}"


@dataclass(frozen=True)
class Border:
    key: str
    name: str
    rarity: Rarity
    metric: str
    # One target for everyone, or (male, female) where the standard depends on sex.
    target: float | tuple[float, float]
    # Extra colour for the challenge, added after its requirement.
    note: str = ""
    # Tiered borders share a family; tier 1 is the first to earn.
    family: str | None = None
    tier: int | None = None
    # Set for a limited edition: the only dates whose training counts.
    window: Window | None = None

    @property
    def measure(self) -> Metric:
        return METRICS[self.metric]

    def target_for(self, sex: str | None) -> float | None:
        if not isinstance(self.target, tuple):
            return self.target
        return {"male": self.target[0], "female": self.target[1]}.get(sex or "")


# A border family's tiers share an idea and a metric; each tier is its own border to earn and
# wear, and later tiers are harder and look grander.
def tiers(
    family: str,
    metric: str,
    *steps: tuple[str, str, Rarity, float | tuple[float, float]]
    | tuple[str, str, Rarity, float | tuple[float, float], str],
) -> tuple[Border, ...]:
    """A family's borders from (key, name, rarity, target[, note]), easiest first."""
    return tuple(
        Border(
            step[0],
            step[1],
            step[2],
            metric,
            step[3],
            step[4] if len(step) > 4 else "",
            family=family,
            tier=index,
        )
        for index, step in enumerate(steps, start=1)
    )


STRENGTH_RARITIES: tuple[Rarity, ...] = ("common", "rare", "epic", "legendary", "mythic")
NUMERALS = ("I", "II", "III", "IV", "V")


# (metric, target) for each Gravity Defier tier; (men, women) where the standard differs.
GRAVITY_DEFIER: tuple[tuple[str, float | tuple[float, float]], ...] = (
    ("bodyweight_reps", 1),
    ("bodyweight_reps", (10, 5)),
    ("bodyweight_added", (25, 10)),
    ("bodyweight_added", (50, 25)),
    ("bodyweight_added", (75, 40)),
)


def five_tiers(
    family: str, metric: str, key: str, name: str, targets: Iterable[tuple[float, float]]
) -> tuple[Border, ...]:
    """A strength family of five tiers, from common to mythic, as (men, women) targets."""
    return tiers(
        family,
        metric,
        *(
            (f"{key}-{index}", f"{name} {NUMERALS[index - 1]}", rarity, target)
            for index, (rarity, target) in enumerate(
                zip(STRENGTH_RARITIES, targets, strict=True), start=1
            )
        ),
    )


# Lift standards in kg as (men, women). A 20 kg bar with 20 kg plates: one plate a side is
# 60 kg, two is 100 kg, three is 140 kg, four is 180 kg, five is 220 kg and so on. Tier V of a
# lift is elite, which is why it is the only route to mythic.
# In the order the app lists them: by group, then roughly by how long each takes to earn.
BORDERS: tuple[Border, ...] = (
    Border("first-steps", "First Steps", "common", "workouts", 5),
    Border("seven-straight", "Seven Straight", "common", "log_streak", 7),
    *tiers(
        "streak",
        "log_streak",
        ("locked-in", "Locked In", "rare", 50),
        ("hundred-days", "Hundred Days", "epic", 100),
        ("unbreakable", "Unbreakable", "legendary", 500),
    ),
    *tiers(
        "workouts",
        "workouts",
        ("regular", "Regular", "common", 50),
        ("centurion", "Centurion", "rare", 100),
        ("iron-legion", "Iron Legion", "legendary", 500),
    ),
    Border("monday-club", "Never Miss a Monday", "rare", "monday_streak", 8),
    Border("dawn-patrol", "Dawn Patrol", "rare", "early_starts", 15),
    Border("night-shift", "Night Shift", "rare", "late_starts", 15),
    Border("iron-habit", "Iron Habit", "epic", "week_streak", 12),
    Border("four-seasons", "Four Seasons", "epic", "months_trained", 12),
    *tiers(
        "tonnes",
        "tonnes",
        ("whale-lifter", "Whale Lifter", "rare", 150, "the weight of a blue whale"),
        ("million-kilo", "Million Kilo Club", "legendary", 1000, "a million kilos"),
    ),
    *tiers(
        "hours",
        "training_hours",
        ("hundred-hours", "Hundred Hours", "rare", 100),
        ("time-under-tension", "Time Under Tension", "epic", 500),
        ("thousand-hours", "Thousand Hours", "legendary", 1000),
    ),
    *five_tiers(
        "bench",
        "bench_kg",
        "bench-club",
        "Bench Club",
        ((40, 25), (60, 35), (100, 50), (120, 65), (140, 80)),
    ),
    *five_tiers(
        "squat",
        "squat_kg",
        "squat-club",
        "Squat Club",
        ((60, 40), (100, 60), (140, 90), (180, 120), (220, 140)),
    ),
    *five_tiers(
        "deadlift",
        "deadlift_kg",
        "deadlift-club",
        "Deadlift Club",
        ((100, 60), (140, 100), (180, 120), (220, 140), (260, 180)),
    ),
    # Bodyweight strength, on pull-ups, chin-ups and dips: reps in one set first, then weight
    # added as a share of the body weight logged nearest the set.
    *(
        Border(
            f"gravity-defier-{index}",
            f"Gravity Defier {NUMERALS[index - 1]}",
            rarity,
            metric,
            target,
            family="bodyweight",
            tier=index,
        )
        for index, (rarity, (metric, target)) in enumerate(
            zip(STRENGTH_RARITIES, GRAVITY_DEFIER, strict=True), start=1
        )
    ),
    Border("hat-trick", "Hat-trick", "common", "records_in_workout", 3),
    *tiers(
        "records",
        "records",
        ("record-breaker-1", "Record Breaker I", "common", 50),
        ("record-breaker-2", "Record Breaker II", "rare", 250),
        ("record-breaker-3", "Record Breaker III", "epic", 1000),
    ),
    Border("marathon-month", "Marathon Month", "rare", "cardio_month_km", 42.2),
    # Minutes alone are effort anyone can put in, so this family stops at epic.
    *tiers(
        "cardio-week",
        "cardio_week_minutes",
        ("cardiomaniac-1", "Cardiomaniac I", "common", 150),
        ("cardiomaniac-2", "Cardiomaniac II", "rare", 300),
        ("cardiomaniac-3", "Cardiomaniac III", "epic", 600),
    ),
    Border("hybrid", "Hybrid Athlete", "epic", "hybrid_weeks", 4),
    Border("everest", "Everest", "legendary", "climbed_m", 8849),
)

BORDERS_BY_KEY = {border.key: border for border in BORDERS}

# Single lifts, whose targets also read as plates on the bar.
PLATE_LIFTS = {"bench_kg", "squat_kg", "deadlift_kg"}


@dataclass(frozen=True)
class Event:
    """A yearly limited edition, open from the first of `first_month` to the end of `last_month`.

    Summer and Winter follow the southern hemisphere, where Relay started.
    """

    slug: str
    name: str
    rarity: Rarity
    days: int
    first_month: int
    last_month: int

    def window(self, year: int) -> Window:
        end_year = year + (self.last_month < self.first_month)
        last_day = calendar.monthrange(end_year, self.last_month)[1]
        return Window(
            "event", date(year, self.first_month, 1), date(end_year, self.last_month, last_day)
        )

    def title(self, year: int) -> str:
        if self.last_month < self.first_month:
            return f"{self.name} {year}–{str(year + 1)[-2:]}"
        return f"{self.name} {year}"


EVENTS = (
    Event("new-year", "New Year", "common", 16, 1, 1),
    Event("winter", "Winter", "common", 36, 6, 8),
    Event("halloween", "Halloween", "common", 13, 10, 10),
    Event("christmas", "Christmas", "common", 12, 12, 12),
    Event("summer", "Summer", "common", 36, 12, 2),
)
EVENTS_BY_SLUG = {event.slug: event for event in EVENTS}
# Events open from Christmas 2026; earlier windows were never offered.
EVENTS_FROM = date(2026, 12, 1)
# How far ahead an event shows as coming soon.
UPCOMING_DAYS = 30
EVENT_KEY = re.compile(r"^([a-z-]+)-(\d{4})$")


def event_border(event: Event, year: int) -> Border:
    window = event.window(year)
    return Border(
        f"{event.slug}-{year}",
        event.title(year),
        event.rarity,
        "window_days",
        event.days,
        window.describe(),
        window=window,
    )


def limited_borders(today: date) -> tuple[Border, ...]:
    """Every limited border offered up to today, plus events opening within UPCOMING_DAYS."""
    events = [
        event_border(event, year)
        for year in range(EVENTS_FROM.year, today.year + 1)
        for event in EVENTS
        if EVENTS_FROM <= event.window(year).starts <= today + timedelta(days=UPCOMING_DAYS)
    ]
    return tuple(events)


def find_border(key: str | None, today: date | None = None) -> Border | None:
    """The border with this key, if the app offers it: always, or once its window is near."""
    if key is None:
        return None
    if key in BORDERS_BY_KEY:
        return BORDERS_BY_KEY[key]
    today = today or date.today()
    if (match := EVENT_KEY.match(key)) and (event := EVENTS_BY_SLUG.get(match[1])):
        year = int(match[2])
        starts = event.window(year).starts
        if EVENTS_FROM <= starts <= today + timedelta(days=UPCOMING_DAYS):
            return event_border(event, year)
    return None


class BorderProgress(BaseModel):
    current: float
    target: float
    unit: str


StreakUnit = Literal["days", "Mondays", "weeks"]


class BorderStreak(BaseModel):
    unit: StreakUnit
    current: int = 0
    current_start: date | None = None
    current_end: date | None = None
    active: bool = False
    broken_on: date | None = None
    best: int = 0
    best_start: date | None = None
    best_end: date | None = None


class BorderRead(BaseModel):
    key: str
    name: str
    group: str
    rarity: Rarity
    requirement: str
    unlocked: bool
    unlocked_on: date | None = None
    # Missing only for a strength border while the account has not set its sex.
    progress: BorderProgress | None = None
    needs_sex: bool = False
    streak: BorderStreak | None = None
    # A tiered border's family and its place in it, from 1; both are None for a single border.
    family: str | None = None
    tier: int | None = None
    # Limited editions only: an event, its window, and whether it is open.
    kind: Literal["event"] | None = None
    status: Status | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    # Days left including today while open, or days until it opens while upcoming.
    days_left: int | None = None


class BordersRead(BaseModel):
    selected: str | None
    sex: Sex | None
    borders: list[BorderRead]


def worn_border(user: User) -> str | None:
    """The border shown around the account's photo, if it is still one the app knows."""
    return user.profile_border if find_border(user.profile_border) else None


def worn_border_name(user: User) -> str | None:
    border = find_border(user.profile_border)
    return border.name if border else None


def longest_run(days: Iterable[date], step: int = 1) -> int:
    """The most dates in a row that are each ``step`` days after the one before."""
    return max((length for length, _, _ in streak_runs(days, step)), default=0)


def streak_runs(days: Iterable[date], step: int) -> Iterable[tuple[int, date, date]]:
    start = end = None
    length = 0
    for day in sorted(set(days)):
        if end is None or (day - end).days != step:
            if start is not None and end is not None:
                yield length, start, end
            start = day
            length = 0
        length += 1
        end = day
    if start is not None and end is not None:
        yield length, start, end


def streak_details(
    days: Iterable[date], unit: StreakUnit, step: int, active_since: date
) -> BorderStreak:
    streak = BorderStreak(unit=unit)
    for length, start, end in streak_runs(days, step):
        streak.current = length
        streak.current_start = start
        streak.current_end = end
        if length >= streak.best:
            streak.best = length
            streak.best_start = start
            streak.best_end = end
    if streak.current_end is not None:
        streak.active = streak.current_end >= active_since
        if not streak.active:
            streak.broken_on = streak.current_end + timedelta(days=step)
    return streak


def lift_of(exercise_name: str) -> str | None:
    name = canonical_exercise_name(exercise_name).casefold()
    return next((lift for lift, names in LIFT_NAMES.items() if name in names), None)


@dataclass
class Stats:
    """An account's numbers, plus the dated activity the limited editions are counted from."""

    values: dict[str, float]
    # (day trained, when it was logged), for every workout and cardio session.
    activity: list[tuple[date, datetime]]
    streaks: dict[str, BorderStreak] = field(default_factory=dict)


def _naive_utc(moment: datetime) -> datetime:
    # SQLite returns naive UTC timestamps; newly flushed rows can still carry tzinfo.
    return moment if moment.tzinfo is None else moment.astimezone(UTC).replace(tzinfo=None)


def window_days(activity: list[tuple[date, datetime]], window: Window) -> int:
    """Days trained inside the window, logged by the day after it ends.

    The extra day lets the last day's training be logged late; anything logged after that is a
    backfill, which a closed window does not accept.
    """
    deadline = datetime.combine(window.ends + timedelta(days=2), time())
    return len(
        {
            day
            for day, logged in activity
            if window.starts <= day <= window.ends and _naive_utc(logged) < deadline
        }
    )


# An entry saved more than this many days after its date is backdated.
BACKDATE_GRACE_DAYS = 2
# Backdated entries that still count towards borders, per week they were saved in.
BACKDATES_PER_WEEK = 2


def counted_entries(
    entries: Iterable[tuple[str, date, datetime | None]], week_of: Callable[[date], date]
) -> set[str]:
    """The (key, day, saved) entries that count: saved on time, or within the weekly allowance.

    Logging late is allowed, but only a few backdated entries a week earn border progress, in
    the order they were saved. The rest stay in the account and count for nothing here.
    """
    counted: set[str] = set()
    used: dict[date, int] = defaultdict(int)
    dated: list[tuple[str, date, datetime]] = []
    for key, day, saved in entries:
        if saved is None:
            counted.add(key)
        else:
            dated.append((key, day, _naive_utc(saved)))
    for key, day, saved in sorted(dated, key=lambda entry: entry[2]):
        if (saved.date() - day).days <= BACKDATE_GRACE_DAYS:
            counted.add(key)
            continue
        week = week_of(saved.date())
        if used[week] < BACKDATES_PER_WEEK:
            used[week] += 1
            counted.add(key)
    return counted


def border_stats(db: Session, user: User, today: date | None = None) -> Stats:
    """The account's number for every border metric, from the history it logged in Relay."""
    today = today or date.today()
    return load_border_history(db, user, today).stats_on(today)


@dataclass
class BorderHistory:
    week_of: Callable[[date], date]
    workouts: list[tuple[date, time | None, int | None, datetime]]
    cardio: list[CardioSession]
    weigh_in_days: list[date]
    sets: list[tuple[date, str | None, float, int, int, float]]
    records: list[tuple[date, int]]

    def stats_on(self, day: date) -> Stats:
        return compute_border_stats(self, day)

    def dates(self) -> list[date]:
        return sorted(
            {day for day, *_ in self.workouts}
            | {session.session_date for session in self.cardio}
            | set(self.weigh_in_days)
        )


def load_border_history(db: Session, user: User, today: date) -> BorderHistory:
    imported_workouts, imported_measurements = imported_ids(db, user.id)
    week_start = get_setting(db, user.id, "week_start", "monday")

    def week_of(day: date) -> date:
        return start_of_week(day, week_start)

    workout_rows = [
        row
        for row in db.execute(
            select(
                TrainingWorkout.id,
                TrainingWorkout.workout_date,
                TrainingWorkout.start_time,
                TrainingWorkout.duration_minutes,
                TrainingWorkout.created_at,
            ).where(
                TrainingWorkout.user_id == user.id,
                TrainingWorkout.is_sample.is_(False),
                TrainingWorkout.workout_date <= today,
            )
        )
        if row.id not in imported_workouts
    ]
    all_cardio = db.scalars(
        select(CardioSession)
        .outerjoin(TrainingWorkout, TrainingWorkout.id == CardioSession.source_workout_id)
        .where(
            CardioSession.user_id == user.id,
            CardioSession.session_date <= today,
            or_(
                CardioSession.source_workout_id.is_(None),
                TrainingWorkout.is_sample.is_(False),
            ),
        )
    ).all()
    weigh_in_rows = [
        row
        for row in db.execute(
            select(
                BodyMeasurement.id, BodyMeasurement.measurement_date, BodyMeasurement.created_at
            ).where(
                BodyMeasurement.user_id == user.id,
                BodyMeasurement.is_sample.is_(False),
                BodyMeasurement.measurement_date <= today,
            )
        )
        if row.id not in imported_measurements
    ]
    # Workouts, cardio of its own and weigh-ins share the weekly allowance for backdated entries.
    counted = counted_entries(
        [
            *((f"w{row.id}", row.workout_date, row.created_at) for row in workout_rows),
            *(
                (f"c{session.id}", session.session_date, session.created_at)
                for session in all_cardio
                if session.source_workout_id is None
            ),
            *((f"m{row.id}", row.measurement_date, row.created_at) for row in weigh_in_rows),
        ],
        week_of,
    )
    skipped_workouts = imported_workouts | {
        row.id for row in workout_rows if f"w{row.id}" not in counted
    }
    workouts = [
        (row.workout_date, row.start_time, row.duration_minutes, row.created_at)
        for row in workout_rows
        if row.id not in skipped_workouts
    ]
    # Cardio a skipped workout created earns nothing; cardio of its own needs its own place.
    cardio = [
        session
        for session in all_cardio
        if (
            session.source_workout_id not in skipped_workouts
            if session.source_workout_id
            else f"c{session.id}" in counted
        )
    ]
    weigh_in_days = [row.measurement_date for row in weigh_in_rows if f"m{row.id}" in counted]
    # Completed working sets of strength exercises: what counts as lifting.
    sets = db.execute(
        select(
            TrainingWorkout.id,
            TrainingWorkout.workout_date,
            Exercise.name,
            WorkoutSet.weight_kg,
            WorkoutSet.reps,
            WorkoutSet.bodyweight_kg,
        )
        .join(WorkoutMovement, WorkoutMovement.workout_id == TrainingWorkout.id)
        .join(Exercise, Exercise.id == WorkoutMovement.exercise_id)
        .join(WorkoutSet, WorkoutSet.movement_id == WorkoutMovement.id)
        .where(
            TrainingWorkout.user_id == user.id,
            TrainingWorkout.is_sample.is_(False),
            TrainingWorkout.workout_date <= today,
            Exercise.kind == ExerciseKind.STRENGTH,
            WorkoutSet.completed.is_(True),
            WorkoutSet.warmup.is_(False),
            WorkoutSet.set_type != SetType.WARMUP,
            WorkoutSet.failed.is_(False),
            WorkoutSet.reps >= 1,
        )
    ).all()
    body_weights = None
    prepared_sets = []
    lift_for_name = cache(lift_of)

    @cache
    def is_bodyweight(name: str) -> bool:
        return canonical_exercise_name(name).casefold() in BODYWEIGHT_MOVES

    for workout_id, day, name, weight, reps, set_body_weight in sets:
        if workout_id in skipped_workouts:
            continue
        bodyweight_reps = 0
        added_percent = 0.0
        if is_bodyweight(name):
            bodyweight_reps = reps
            if weight and weight > 0:
                if body_weights is None:
                    body_weights = BodyweightHistory(db, user.id)
                body_weight = body_weights.on(day, set_body_weight or None)
                if body_weight:
                    added_percent = weight / body_weight * 100
        weight = max(weight or 0, 0)
        prepared_sets.append(
            (day, lift_for_name(name), weight, reps, bodyweight_reps, added_percent)
        )

    records = db.execute(
        select(
            PersonalRecord.workout_id, TrainingWorkout.workout_date, func.count(PersonalRecord.id)
        )
        .join(TrainingWorkout, TrainingWorkout.id == PersonalRecord.workout_id)
        .where(
            PersonalRecord.user_id == user.id,
            PersonalRecord.value > 0,
            PersonalRecord.record_type.in_(
                [PersonalRecordType.WEIGHT, PersonalRecordType.REPS_AT_WEIGHT]
            ),
            TrainingWorkout.is_sample.is_(False),
            TrainingWorkout.workout_date <= today,
        )
        .group_by(PersonalRecord.workout_id, TrainingWorkout.workout_date)
    ).all()
    return BorderHistory(
        week_of,
        workouts,
        cardio,
        weigh_in_days,
        prepared_sets,
        [(day, count) for workout_id, day, count in records if workout_id not in skipped_workouts],
    )


def compute_border_stats(history: BorderHistory, through: date) -> Stats:
    week_of = history.week_of
    workouts = [row for row in history.workouts if row[0] <= through]
    cardio = [session for session in history.cardio if session.session_date <= through]
    weigh_in_days = [day for day in history.weigh_in_days if day <= through]
    training_days = {day for day, _, _, _ in workouts}
    starts = [start for _, start, _, _ in workouts if start is not None]
    lifted_kg = 0.0
    lifting_days: set[date] = set()
    best_lift = {lift: 0.0 for lift in LIFT_NAMES}
    bodyweight_reps = 0
    bodyweight_added = 0.0
    for day, lift, weight, reps, unassisted_reps, added_percent in history.sets:
        if day > through:
            continue
        lifting_days.add(day)
        lifted_kg += weight * reps
        bodyweight_reps = max(bodyweight_reps, unassisted_reps)
        bodyweight_added = max(bodyweight_added, added_percent)
        if lift is not None:
            best_lift[lift] = max(best_lift[lift], weight)

    cardio_week_minutes: dict[date, int] = defaultdict(int)
    cardio_month_km: dict[tuple[int, int], float] = defaultdict(float)
    climbed_m = 0.0
    for session in cardio:
        day = session.session_date
        cardio_week_minutes[week_of(day)] += session.duration_minutes or 0
        cardio_month_km[(day.year, day.month)] += session.distance_km or 0
        climbed_m += session.effective_elevation_gain_m or 0

    record_counts = [count for day, count in history.records if day <= through]

    days_per_week: dict[date, int] = defaultdict(int)
    for day in training_days:
        days_per_week[week_of(day)] += 1
    lifting_days_per_week: dict[date, int] = defaultdict(int)
    for day in lifting_days:
        lifting_days_per_week[week_of(day)] += 1

    monday = through - timedelta(days=through.weekday())
    if through == monday:
        monday -= timedelta(weeks=1)
    streaks = {
        "log_streak": streak_details(
            [*training_days, *(session.session_date for session in cardio), *weigh_in_days],
            "days",
            1,
            through - timedelta(days=1),
        ),
        "monday_streak": streak_details(
            (day for day in training_days if day.weekday() == 0), "Mondays", 7, monday
        ),
        "week_streak": streak_details(
            (week for week, days in days_per_week.items() if days >= 3),
            "weeks",
            7,
            week_of(through) - timedelta(weeks=1),
        ),
    }
    values = {
        "workouts": len(workouts),
        **{metric: streak.best for metric, streak in streaks.items()},
        "early_starts": sum(EARLY_FROM <= start < EARLY_UNTIL for start in starts),
        "late_starts": sum(start >= LATE_FROM or start < EARLY_FROM for start in starts),
        "months_trained": len({day.month for day in training_days}),
        "tonnes": lifted_kg / 1000,
        "training_hours": sum(minutes or 0 for _, _, minutes, _ in workouts) / 60,
        "bench_kg": best_lift["bench"],
        "squat_kg": best_lift["squat"],
        "deadlift_kg": best_lift["deadlift"],
        "bodyweight_reps": bodyweight_reps,
        "bodyweight_added": bodyweight_added,
        "records": sum(record_counts),
        "records_in_workout": max(record_counts, default=0),
        "cardio_week_minutes": max(cardio_week_minutes.values(), default=0),
        "cardio_month_km": max(cardio_month_km.values(), default=0.0),
        "climbed_m": climbed_m,
        "hybrid_weeks": sum(
            days >= 3 and cardio_week_minutes.get(week, 0) >= 90
            for week, days in lifting_days_per_week.items()
        ),
    }
    activity = [(day, created) for day, _, _, created in workouts] + [
        (session.session_date, session.created_at) for session in cardio
    ]
    return Stats(values, activity, streaks=streaks)


def value_of(border: Border, stats: Stats) -> float:
    if border.window is not None:
        return window_days(stats.activity, border.window)
    return stats.values[border.metric]


def _number(value: float, places: int = 1) -> str:
    text = f"{value:,.{places}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _shown(border: Border, value: float, unit: str) -> float:
    """A stored number as the account reads it: weights in its unit, to one decimal."""
    if border.measure.weight and unit == "lb":
        value *= KG_TO_LB
    return round(value, 1)


def plates(target_kg: float) -> int | None:
    """How many 20 kg plates a side load a 20 kg bar to this weight, when it is a whole number."""
    count = (target_kg - 20) / 40
    return int(count) if count >= 1 and count.is_integer() else None


def _target_text(border: Border, target: float, unit: str) -> str:
    if border.measure.weight:
        # A whole number of the account's unit: 100 kg reads as 220 lb.
        text = f"{_number(round(_shown(border, target, unit)))} {unit}"
        count = plates(target) if border.metric in PLATE_LIFTS else None
        return f"{text} · {count} plate{'s' if count > 1 else ''}" if count else text
    if border.measure.unit == PERCENT_BW:
        return f"{_number(target)}%"
    if border.metric == "bodyweight_reps":
        return f"{_number(target)} rep{'' if target == 1 else 's'}"
    return _number(target)


def _requirement(border: Border, target: str) -> str:
    text = border.measure.requirement.format(target=target)
    if not border.note:
        return text
    # A window reads as part of the sentence: "Train on 12 days in December 2026".
    return f"{text} {border.note}" if border.window else f"{text}, {border.note}"


def is_unlocked(border: Border, stats: Stats, sex: str | None) -> bool:
    target = border.target_for(sex)
    # A float sum can land a hair under a target it has reached.
    return target is not None and value_of(border, stats) + 1e-9 >= target


def _read(border: Border, stats: Stats, sex: str | None, unit: str, today: date) -> BorderRead:
    measure = border.measure
    read = BorderRead(
        key=border.key,
        name=border.name,
        group=measure.group,
        rarity=border.rarity,
        requirement="",
        unlocked=is_unlocked(border, stats, sex),
        family=border.family,
        tier=border.tier,
        streak=stats.streaks.get(border.metric),
    )
    target = border.target_for(sex)
    if target is None:
        assert isinstance(border.target, tuple)
        male, female = (_target_text(border, value, unit) for value in border.target)
        read.requirement = _requirement(border, f"{male} (men) or {female} (women)")
        read.needs_sex = True
    else:
        shown_target = _shown(border, target, unit)
        read.requirement = _requirement(border, _target_text(border, target, unit))
        progress_value = value_of(border, stats)
        if read.streak is not None and not read.unlocked:
            progress_value = read.streak.current if read.streak.active else 0
        read.progress = BorderProgress(
            current=_shown(border, progress_value, unit),
            target=round(shown_target) if measure.weight else shown_target,
            unit=unit if measure.weight else measure.unit,
        )
    if window := border.window:
        status = window.status(today)
        read.kind = window.kind
        read.status = status
        read.starts_on, read.ends_on = window.starts, window.ends
        if status == "active":
            read.days_left = (window.ends - today).days + 1
        elif status == "upcoming":
            read.days_left = (window.starts - today).days
            # Nothing counts before it opens.
            read.unlocked = False
            if read.progress:
                read.progress.current = 0
    return read


def sync_unlock_dates(
    db: Session,
    user: User,
    history: BorderHistory,
    unlocked: list[Border],
    checked_keys: set[str] | None = None,
) -> dict[str, date]:
    stored = {
        row.border_key: row.unlocked_on
        for row in db.scalars(
            select(ProfileBorderUnlock).where(ProfileBorderUnlock.user_id == user.id)
        )
    }
    unlocked_keys = {border.key for border in unlocked}
    stale = (
        stored.keys() if checked_keys is None else stored.keys() & checked_keys
    ) - unlocked_keys
    missing = [border for border in unlocked if border.key not in stored]
    if missing:
        # Every border that can be unlocked needs logged activity; today covers the rest.
        dates = history.dates() or [date.today()]
        stats_on = cache(history.stats_on)
        for border in missing:
            low, high = 0, len(dates) - 1
            while low < high:
                middle = (low + high) // 2
                if is_unlocked(border, stats_on(dates[middle]), user.sex):
                    high = middle
                else:
                    low = middle + 1
            stored[border.key] = dates[low]
        db.execute(
            insert(ProfileBorderUnlock)
            .values(
                [
                    {
                        "user_id": user.id,
                        "border_key": border.key,
                        "unlocked_on": stored[border.key],
                    }
                    for border in missing
                ]
            )
            .on_conflict_do_nothing(index_elements=["user_id", "border_key"])
        )
        # A simultaneous request may have recorded the unlock first.
        stored.update(
            db.execute(
                select(ProfileBorderUnlock.border_key, ProfileBorderUnlock.unlocked_on).where(
                    ProfileBorderUnlock.user_id == user.id,
                    ProfileBorderUnlock.border_key.in_([border.key for border in missing]),
                )
            ).all()
        )
    if stale:
        db.execute(
            delete(ProfileBorderUnlock).where(
                ProfileBorderUnlock.user_id == user.id, ProfileBorderUnlock.border_key.in_(stale)
            )
        )
    if missing or stale:
        db.commit()
    return {key: stored[key] for key in unlocked_keys}


def borders_for(db: Session, user: User, today: date | None = None) -> BordersRead:
    """Every border to show the account, in the order the app lists them.

    First come events that are open or about to open, then the permanent
    borders. Limited editions whose window has closed are listed only where they were earned.
    """
    today = today or date.today()
    history = load_border_history(db, user, today)
    stats = history.stats_on(today)
    unit = preferred_weight_unit(db, user.id)
    events, permanent, past = [], [], []
    catalogue = (*limited_borders(today), *BORDERS)
    reads = [_read(border, stats, user.sex, unit, today) for border in catalogue]
    dates = sync_unlock_dates(
        db,
        user,
        history,
        [border for border, read in zip(catalogue, reads, strict=True) if read.unlocked],
    )
    for border, read in zip(catalogue, reads, strict=True):
        read.unlocked_on = dates.get(border.key)
        if border.window is None:
            permanent.append(read)
        elif read.status == "ended":
            if read.unlocked:
                past.append(read.model_copy(update={"group": "Past events"}))
        else:
            events.append(read.model_copy(update={"group": "Events"}))
    return BordersRead(
        selected=worn_border(user), sex=user.sex, borders=[*events, *permanent, *past]
    )


def can_wear(db: Session, user: User, key: str, today: date | None = None) -> bool:
    border = find_border(key, today)
    if border is None:
        return False
    today = today or date.today()
    if border.window and border.window.status(today) == "upcoming":
        return False
    history = load_border_history(db, user, today)
    unlocked = is_unlocked(border, history.stats_on(today), user.sex)
    sync_unlock_dates(db, user, history, [border] if unlocked else [], {key})
    return unlocked
