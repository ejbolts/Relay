from __future__ import annotations

from datetime import date, timedelta

from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from .models import CardioSession
from .training_metrics import get_setting


class HeartRateZone(BaseModel):
    zone: int = Field(ge=1, le=5)
    min_bpm: int = Field(ge=20, le=250)
    max_bpm: int = Field(ge=20, le=250)


class CardioGoal(BaseModel):
    zone: int = Field(ge=1, le=5)
    minutes: int = Field(ge=1, le=10_080)


class CardioPreferences(BaseModel):
    heart_rate_zones: list[HeartRateZone] = Field(default_factory=list, max_length=5)
    goals: list[CardioGoal] = Field(
        default_factory=lambda: [CardioGoal(zone=2, minutes=150)], min_length=1, max_length=5
    )

    @model_validator(mode="after")
    def valid_ranges_and_goals(self) -> CardioPreferences:
        zones = sorted(self.heart_rate_zones, key=lambda item: item.zone)
        if zones and [item.zone for item in zones] != [1, 2, 3, 4, 5]:
            raise ValueError("Enter a heart-rate range for each of the five zones.")
        for index, item in enumerate(zones):
            if item.min_bpm > item.max_bpm:
                raise ValueError("Each zone's minimum must be at or below its maximum.")
            if index and zones[index - 1].max_bpm >= item.min_bpm:
                raise ValueError("Zone ranges must increase without overlapping.")
        if len({item.zone for item in self.goals}) != len(self.goals):
            raise ValueError("Use one weekly goal per zone.")
        self.heart_rate_zones = zones
        return self


class CardioGoalWeek(BaseModel):
    zone: int
    goal_minutes: int
    completed_minutes: int
    remaining_minutes: int
    complete: bool


def cardio_preferences(db: Session, user_id: str) -> CardioPreferences:
    saved = get_setting(db, user_id, "cardio_preferences", "")
    if saved:
        return CardioPreferences.model_validate_json(saved)
    # Preserve an existing personal target when upgrading.
    try:
        minutes = int(get_setting(db, user_id, "zone2_goal_minutes", "150"))
        return CardioPreferences(goals=[CardioGoal(zone=2, minutes=minutes)])
    except ValueError:
        return CardioPreferences()


def session_zone(heart_rate: int | None, preferences: CardioPreferences) -> int | None:
    if heart_rate is None:
        return None
    return next(
        (
            item.zone
            for item in preferences.heart_rate_zones
            if item.min_bpm <= heart_rate <= item.max_bpm
        ),
        None,
    )


def classify_session(session: CardioSession, preferences: CardioPreferences) -> None:
    zone = session_zone(session.average_heart_rate_bpm, preferences)
    session.zone = f"Zone {zone}" if zone else None
    session.qualifies_zone2 = zone == 2


def cardio_goal_weeks(
    sessions: list[CardioSession], week: date, preferences: CardioPreferences, today: date
) -> list[CardioGoalWeek]:
    end = min(week + timedelta(days=6), today)
    totals: dict[int, int] = {}
    for session in sessions:
        if week <= session.session_date <= end:
            zone = session_zone(session.average_heart_rate_bpm, preferences)
            if zone is not None:
                totals[zone] = totals.get(zone, 0) + session.duration_minutes
    return [
        CardioGoalWeek(
            zone=goal.zone,
            goal_minutes=goal.minutes,
            completed_minutes=totals.get(goal.zone, 0),
            remaining_minutes=max(0, goal.minutes - totals.get(goal.zone, 0)),
            complete=totals.get(goal.zone, 0) >= goal.minutes,
        )
        for goal in preferences.goals
    ]
