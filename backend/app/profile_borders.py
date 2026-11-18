"""Profile borders: frames around an account's photo, earned from its own training.

Each border is one challenge with a single number to reach. The numbers come from the account's
whole history (its best streak, its heaviest lift, its biggest cardio week), so a border stays
earned for as long as the training behind it is logged. Sample workouts never count.

Strength borders have a standard for each sex. That is why an account's sex is fixed once it is
chosen: it decides which standard the account is measured against.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, time
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .exercise_aliases import canonical_exercise_name
from .models import (
    BodyMeasurement,
    CardioSession,
    Exercise,
    ExerciseKind,
    PersonalRecord,
    PersonalRecordType,
    SetType,
    TrainingWorkout,
    User,
    WorkoutMovement,
    WorkoutSet,
)
from .relative_strength import BodyweightHistory
from .training_metrics import KG_TO_LB, get_setting, preferred_weight_unit, start_of_week

Sex = Literal["male", "female"]
Rarity = Literal["common", "rare", "epic", "legendary"]

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
    "big_three_kg": Metric(
        "Strength", "Total {target} across your best bench, squat and deadlift", weight=True
    ),
    "bench_body_weight_pct": Metric("Strength", "Bench press {target} of your body weight", "%"),
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
}


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


# Lift standards in kg as (men, women). A 20 kg bar with 20 kg plates: one plate a side is
# 60 kg, two is 100 kg, three is 140 kg, four is 180 kg and five is 220 kg.
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
    Border("hundred-hours", "Hundred Hours", "rare", "training_hours", 100),
    *tiers(
        "bench",
        "bench_kg",
        ("bench-club-1", "Bench Club I", "rare", (60, 40)),
        ("bench-club-2", "Bench Club II", "epic", (100, 60)),
        ("bench-club-3", "Bench Club III", "legendary", (140, 80)),
    ),
    *tiers(
        "squat",
        "squat_kg",
        ("squat-club-1", "Squat Club I", "rare", (100, 60)),
        ("squat-club-2", "Squat Club II", "epic", (140, 100)),
        ("squat-club-3", "Squat Club III", "legendary", (180, 140)),
    ),
    *tiers(
        "deadlift",
        "deadlift_kg",
        ("deadlift-club-1", "Deadlift Club I", "rare", (140, 100)),
        ("deadlift-club-2", "Deadlift Club II", "epic", (180, 140)),
        ("deadlift-club-3", "Deadlift Club III", "legendary", (220, 180)),
    ),
    *tiers(
        "big-three",
        "big_three_kg",
        ("big-three-1", "Big Three I", "rare", (300, 180)),
        ("big-three-2", "Big Three II", "epic", (400, 250)),
        # 1,000 lb for men.
        ("big-three-3", "Big Three III", "legendary", (453.6, 320)),
    ),
    Border("pound-for-pound", "Pound for Pound", "rare", "bench_body_weight_pct", (100, 60)),
    Border("hat-trick", "Hat-trick", "common", "records_in_workout", 3),
    *tiers(
        "records",
        "records",
        ("record-breaker-1", "Record Breaker I", "common", 50),
        ("record-breaker-2", "Record Breaker II", "rare", 250),
        ("record-breaker-3", "Record Breaker III", "epic", 1000),
    ),
    Border("marathon-month", "Marathon Month", "rare", "cardio_month_km", 42.2),
    *tiers(
        "cardio-week",
        "cardio_week_minutes",
        ("cardiomaniac-1", "Cardiomaniac I", "common", 150),
        ("cardiomaniac-2", "Cardiomaniac II", "epic", 300),
        ("cardiomaniac-3", "Cardiomaniac III", "legendary", 600),
    ),
    Border("hybrid", "Hybrid Athlete", "epic", "hybrid_weeks", 4),
    Border("everest", "Everest", "legendary", "climbed_m", 8849),
)

BORDERS_BY_KEY = {border.key: border for border in BORDERS}

# Single lifts, whose targets also read as plates on the bar.
PLATE_LIFTS = {"bench_kg", "squat_kg", "deadlift_kg"}


class BorderProgress(BaseModel):
    current: float
    target: float
    unit: str


class BorderRead(BaseModel):
    key: str
    name: str
    group: str
    rarity: Rarity
    requirement: str
    unlocked: bool
    # Missing only for a strength border while the account has not set its sex.
    progress: BorderProgress | None = None
    needs_sex: bool = False
    # A tiered border's family and its place in it, from 1; both are None for a single border.
    family: str | None = None
    tier: int | None = None


class BordersRead(BaseModel):
    selected: str | None
    sex: Sex | None
    borders: list[BorderRead]


def worn_border(user: User) -> str | None:
    """The border shown around the account's photo, if it is still one the app knows."""
    return user.profile_border if user.profile_border in BORDERS_BY_KEY else None


def worn_border_name(user: User) -> str | None:
    key = worn_border(user)
    return BORDERS_BY_KEY[key].name if key else None


def longest_run(days: Iterable[date], step: int = 1) -> int:
    """The most dates in a row that are each ``step`` days after the one before."""
    best = run = 0
    previous: date | None = None
    for day in sorted(set(days)):
        run = run + 1 if previous is not None and (day - previous).days == step else 1
        best = max(best, run)
        previous = day
    return best


def lift_of(exercise_name: str) -> str | None:
    name = canonical_exercise_name(exercise_name).casefold()
    return next((lift for lift, names in LIFT_NAMES.items() if name in names), None)


def border_stats(db: Session, user: User, today: date | None = None) -> dict[str, float]:
    """The account's number for every border metric, from its whole logged history."""
    today = today or date.today()
    week_start = get_setting(db, user.id, "week_start", "monday")

    def week_of(day: date) -> date:
        return start_of_week(day, week_start)

    workouts = db.execute(
        select(
            TrainingWorkout.workout_date,
            TrainingWorkout.start_time,
            TrainingWorkout.duration_minutes,
        ).where(
            TrainingWorkout.user_id == user.id,
            TrainingWorkout.is_sample.is_(False),
            TrainingWorkout.workout_date <= today,
        )
    ).all()
    training_days = {day for day, _, _ in workouts}
    starts = [start for _, start, _ in workouts if start is not None]

    # Completed working sets of strength exercises: what counts as lifting.
    sets = db.execute(
        select(
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
    lifted_kg = 0.0
    lifting_days: set[date] = set()
    best_lift = {lift: 0.0 for lift in LIFT_NAMES}
    bench_sets: list[tuple[date, float, float | None]] = []
    lift_by_name: dict[str, str | None] = {}
    for day, name, weight, reps, set_body_weight in sets:
        lifting_days.add(day)
        if not weight or weight <= 0:
            continue
        lifted_kg += weight * reps
        if name not in lift_by_name:
            lift_by_name[name] = lift_of(name)
        lift = lift_by_name[name]
        if lift is None:
            continue
        best_lift[lift] = max(best_lift[lift], weight)
        if lift == "bench":
            bench_sets.append((day, weight, set_body_weight))
    bench_pct = 0.0
    if bench_sets:
        body_weights = BodyweightHistory(db, user.id)
        for day, weight, set_body_weight in bench_sets:
            body_weight = body_weights.on(day, set_body_weight or None)
            if body_weight:
                bench_pct = max(bench_pct, weight / body_weight * 100)

    cardio = db.scalars(
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
    cardio_week_minutes: dict[date, int] = defaultdict(int)
    cardio_month_km: dict[tuple[int, int], float] = defaultdict(float)
    climbed_m = 0.0
    for session in cardio:
        day = session.session_date
        cardio_week_minutes[week_of(day)] += session.duration_minutes or 0
        cardio_month_km[(day.year, day.month)] += session.distance_km or 0
        climbed_m += session.effective_elevation_gain_m or 0

    weigh_in_days = db.scalars(
        select(BodyMeasurement.measurement_date).where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.is_sample.is_(False),
            BodyMeasurement.measurement_date <= today,
        )
    ).all()

    records = db.execute(
        select(func.count(PersonalRecord.id))
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
        .group_by(PersonalRecord.workout_id)
    ).all()
    record_counts = [count for (count,) in records]

    days_per_week: dict[date, int] = defaultdict(int)
    for day in training_days:
        days_per_week[week_of(day)] += 1
    lifting_days_per_week: dict[date, int] = defaultdict(int)
    for day in lifting_days:
        lifting_days_per_week[week_of(day)] += 1

    return {
        "workouts": len(workouts),
        "log_streak": longest_run(
            [*training_days, *(session.session_date for session in cardio), *weigh_in_days]
        ),
        "monday_streak": longest_run((day for day in training_days if day.weekday() == 0), 7),
        "week_streak": longest_run((week for week, days in days_per_week.items() if days >= 3), 7),
        "early_starts": sum(EARLY_FROM <= start < EARLY_UNTIL for start in starts),
        "late_starts": sum(start >= LATE_FROM or start < EARLY_FROM for start in starts),
        "months_trained": len({day.month for day in training_days}),
        "tonnes": lifted_kg / 1000,
        "training_hours": sum(minutes or 0 for _, _, minutes in workouts) / 60,
        "bench_kg": best_lift["bench"],
        "squat_kg": best_lift["squat"],
        "deadlift_kg": best_lift["deadlift"],
        "big_three_kg": sum(best_lift.values()),
        "bench_body_weight_pct": bench_pct,
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


def _number(value: float) -> str:
    return f"{value:,.1f}".removesuffix(".0")


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
    return f"{_number(target)}%" if border.measure.unit == "%" else _number(target)


def _requirement(border: Border, target: str) -> str:
    text = border.measure.requirement.format(target=target)
    return f"{text}, {border.note}" if border.note else text


def is_unlocked(border: Border, stats: dict[str, float], sex: str | None) -> bool:
    target = border.target_for(sex)
    # A float sum can land a hair under a target it has reached.
    return target is not None and stats[border.metric] + 1e-9 >= target


def borders_for(db: Session, user: User) -> BordersRead:
    stats = border_stats(db, user)
    unit = preferred_weight_unit(db, user.id)
    borders = []
    for border in BORDERS:
        measure = border.measure
        read = BorderRead(
            key=border.key,
            name=border.name,
            group=measure.group,
            rarity=border.rarity,
            requirement="",
            unlocked=is_unlocked(border, stats, user.sex),
            family=border.family,
            tier=border.tier,
        )
        target = border.target_for(user.sex)
        if target is None:
            assert isinstance(border.target, tuple)
            male, female = (_target_text(border, value, unit) for value in border.target)
            read.requirement = _requirement(border, f"{male} (men) or {female} (women)")
            read.needs_sex = True
        else:
            shown_target = _shown(border, target, unit)
            read.requirement = _requirement(border, _target_text(border, target, unit))
            read.progress = BorderProgress(
                current=_shown(border, stats[border.metric], unit),
                target=round(shown_target) if measure.weight else shown_target,
                unit=unit if measure.weight else measure.unit,
            )
        borders.append(read)
    return BordersRead(selected=worn_border(user), sex=user.sex, borders=borders)


def can_wear(db: Session, user: User, key: str) -> bool:
    return is_unlocked(BORDERS_BY_KEY[key], border_stats(db, user), user.sex)
