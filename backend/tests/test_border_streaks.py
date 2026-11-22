from datetime import date, timedelta

import pytest
from test_profile_borders import borders, weigh_in, workout

from app import profile_borders
from app.database import SessionLocal
from app.models import User
from app.profile_borders import borders_for


@pytest.fixture(autouse=True)
def backdates_allowed(monkeypatch):
    monkeypatch.setattr(profile_borders, "BACKDATES_PER_WEEK", 10_000)


def read_at(client, today):
    with SessionLocal() as db:
        result = borders_for(db, db.get(User, client.user["id"]), today)
    return {border.key: border for border in result.borders}


def test_never_started_streaks_are_serialized(client):
    listed = borders(client)
    for key, unit in (
        ("seven-straight", "days"),
        ("monday-club", "Mondays"),
        ("iron-habit", "weeks"),
    ):
        assert listed[key]["streak"] == {
            "unit": unit,
            "current": 0,
            "current_start": None,
            "current_end": None,
            "active": False,
            "broken_on": None,
            "best": 0,
            "best_start": None,
            "best_end": None,
        }
    assert listed["first-steps"]["streak"] is None


def test_daily_streak_uses_latest_run_for_locked_progress_and_latest_tie(client):
    start = date(2026, 2, 2)
    for offset in (*range(7), *range(10, 17)):
        weigh_in(client, start + timedelta(days=offset))

    listed = read_at(client, start + timedelta(days=17))
    seven = listed["seven-straight"]
    assert seven.unlocked
    streak = seven.streak
    assert streak.current == streak.best == 7
    assert streak.current_start == streak.best_start == start + timedelta(days=10)
    assert streak.current_end == streak.best_end == start + timedelta(days=16)
    assert streak.active and streak.broken_on is None

    locked = next(item for item in listed.values() if item.name == "Locked In")
    assert not locked.unlocked and locked.progress.current == 7
    listed = read_at(client, start + timedelta(days=18))
    locked = listed[locked.key]
    assert locked.progress.current == 0
    assert not locked.streak.active
    assert locked.streak.broken_on == start + timedelta(days=17)
    assert listed[seven.key].unlocked
    assert listed[seven.key].progress.current == 7

    weigh_in(client, start + timedelta(days=20))
    locked = read_at(client, start + timedelta(days=20))[locked.key]
    assert locked.progress.current == locked.streak.current == 1
    assert locked.streak.best == 7


def test_monday_and_week_streaks_use_their_own_calendar_boundaries(client):
    response = client.put(
        "/api/training-preferences",
        json={"preferred_weight_unit": "kg", "week_start": "sunday", "zone2_goal_minutes": 150},
    )
    assert response.status_code == 200
    sunday = date(2026, 2, 1)
    for offset in (0, 1, 2, 7, 8, 9):
        workout(client, sunday + timedelta(days=offset))

    monday = read_at(client, sunday + timedelta(days=15))["monday-club"]
    assert monday.streak.active and monday.progress.current == 2
    assert monday.streak.current_start == sunday + timedelta(days=1)
    assert monday.streak.current_end == sunday + timedelta(days=8)

    listed = read_at(client, sunday + timedelta(days=16))
    monday, week = listed["monday-club"], listed["iron-habit"]
    assert not monday.streak.active and monday.progress.current == 0
    assert monday.streak.broken_on == sunday + timedelta(days=15)
    assert week.streak.active and week.progress.current == 2
    assert week.streak.current_start == sunday
    assert week.streak.current_end == sunday + timedelta(days=7)

    week = read_at(client, sunday + timedelta(days=21))["iron-habit"]
    assert not week.streak.active and week.progress.current == 0
    assert week.streak.broken_on == sunday + timedelta(days=14)
