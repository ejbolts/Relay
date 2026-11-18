"""Estimates for cardio metrics the user left blank.

A logged value always wins; these only fill the gap. MET comes from, in order: the ACSM
walking and running equations (speed and grade), the ACSM leg-cycling equation (power and
body weight), active calories and body weight, then a typical Compendium of Physical
Activities value for the activity. Elevation gain comes from treadmill incline and distance.
"""

from __future__ import annotations

import re
from bisect import bisect_right
from collections.abc import Iterable
from datetime import date
from math import sqrt
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from .models import CardioSession

RESTING_VO2 = 3.5  # ml of oxygen per kg per minute; 1 MET
MAX_ESTIMATED_METS = 25.0

_RUN = re.compile(r"\b(run|running|jog|jogging|sprint|sprints)\b")
_FOOT = re.compile(r"\b(walk|walking|hike|hiking|treadmill|ruck|rucking)\b")
_CYCLE = re.compile(r"cycl|bike|biking|spin")

# Typical moderate-effort values, used only when nothing was measured.
_TYPICAL_METS: tuple[tuple[re.Pattern[str], float], ...] = (
    (_RUN, 9.8),
    (re.compile(r"\b(hike|hiking|ruck|rucking)\b"), 6.0),
    (re.compile(r"stair|step"), 9.0),
    (re.compile(r"\b(walk|walking|treadmill)\b"), 3.5),
    (_CYCLE, 7.0),
    (re.compile(r"\brow(ing|er)?\b"), 7.0),
    (re.compile(r"\bswim"), 6.0),
    (re.compile(r"elliptical|cross.?trainer"), 5.0),
    (re.compile(r"rope|skipping"), 11.0),
    (re.compile(r"\bski"), 7.0),
)


def _clamp_mets(value: float) -> float:
    return round(min(max(value, 1.0), MAX_ESTIMATED_METS), 1)


def _speed_kph(
    duration_minutes: int | None, distance_km: float | None, speed_kph: float | None
) -> float | None:
    if speed_kph:
        return speed_kph
    if distance_km and duration_minutes:
        return distance_km / (duration_minutes / 60)
    return None


def _grade(
    incline_percent: float | None, elevation_gain_m: float | None, distance_km: float | None
) -> float:
    if incline_percent is not None:
        return incline_percent / 100
    if elevation_gain_m is not None and distance_km:
        return min(elevation_gain_m / (distance_km * 1000), 0.4)
    return 0.0


def estimate_mets(
    *,
    activity: str,
    duration_minutes: int | None,
    distance_km: float | None = None,
    speed_kph: float | None = None,
    incline_percent: float | None = None,
    elevation_gain_m: float | None = None,
    power_watts: float | None = None,
    calories_kcal: float | None = None,
    body_weight_kg: float | None = None,
) -> float | None:
    name = activity.casefold()
    named_run = bool(_RUN.search(name))
    if named_run or _FOOT.search(name):
        speed = _speed_kph(duration_minutes, distance_km, speed_kph)
        if speed is not None and 0.5 <= speed <= 30:
            metres_per_minute = speed * 1000 / 60
            grade = _grade(incline_percent, elevation_gain_m, distance_km)
            running = speed > 8 or (named_run and speed >= 5)
            horizontal, vertical = (0.2, 0.9) if running else (0.1, 1.8)
            oxygen = (
                RESTING_VO2 + horizontal * metres_per_minute + vertical * metres_per_minute * grade
            )
            return _clamp_mets(oxygen / RESTING_VO2)
    if _CYCLE.search(name) and power_watts and body_weight_kg:
        # 1 W is 6.12 kg·m/min; ACSM leg cycling is 1.8 × work rate ÷ body mass + 7.
        return _clamp_mets((1.8 * 6.12 * power_watts / body_weight_kg + 7) / RESTING_VO2)
    if calories_kcal and body_weight_kg and duration_minutes:
        # Logged calories are active calories, which exclude the 1 MET spent at rest.
        return _clamp_mets(1 + calories_kcal / (body_weight_kg * duration_minutes / 60))
    return next((mets for pattern, mets in _TYPICAL_METS if pattern.search(name)), None)


def estimate_elevation_gain_m(
    *,
    duration_minutes: int | None,
    distance_km: float | None = None,
    speed_kph: float | None = None,
    incline_percent: float | None = None,
) -> float | None:
    """Climb of a constant incline: belt distance × the sine of the slope."""
    if incline_percent is None:
        return None
    if distance_km is None:
        if not speed_kph or not duration_minutes:
            return None
        distance_km = speed_kph * duration_minutes / 60
    grade = incline_percent / 100
    return float(round(distance_km * 1000 * grade / sqrt(1 + grade * grade)))


def attach_body_weights(
    db: Session, user_id: str | None, sessions: Iterable[CardioSession]
) -> None:
    """Give each session the body weight nearest its date, for the weight-based estimates."""
    from .models import BodyMeasurement

    sessions = list(sessions)
    if not sessions:
        return
    measurements: list[tuple[date, float]] = [
        (row.measurement_date, row.weight_kg)
        for row in db.execute(
            select(BodyMeasurement.measurement_date, BodyMeasurement.weight_kg)
            .where(BodyMeasurement.user_id == user_id)
            .order_by(BodyMeasurement.measurement_date)
        )
    ]
    if not measurements:
        return
    dates = [item[0] for item in measurements]
    for session in sessions:
        # The latest weigh-in up to the session, or the first one after it.
        index = max(bisect_right(dates, session.session_date) - 1, 0)
        session.body_weight_kg = measurements[index][1]
