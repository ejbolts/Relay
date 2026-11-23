from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

from fastapi.testclient import TestClient
from test_profile_borders import RARITY_ORDER

from app.database import SessionLocal
from app.models import User
from app.profile_borders import EVENTS, Window, borders_for, can_wear, window_days, worn_border


def test_yearly_events_are_common_and_drawn_at_their_rarity():
    assert {event.rarity for event in EVENTS} == {"common"}
    shapes = Path(__file__).resolve().parents[2] / "frontend/src/profileBorderShapes.tsx"
    source = shapes.read_text(encoding="utf-8")
    looks = source[source.index("const EVENT_LOOKS") :]
    looks = looks[: looks.index("\n};")]
    drawn = dict(re.findall(r"^  '?([a-z-]+)'?: \{\s*grade: (\d)", looks, re.M))
    assert drawn == {event.slug: str(RARITY_ORDER.index(event.rarity) + 1) for event in EVENTS}


def test_a_window_counts_days_trained_inside_it_and_logged_in_time():
    window = Window("event", date(2026, 12, 1), date(2026, 12, 31))
    logged = datetime(2026, 12, 2, 9)
    activity = [
        (date(2026, 12, 1), logged),
        (date(2026, 12, 1), logged),
        (date(2026, 12, 31), datetime(2027, 1, 1, 20)),
        (date(2026, 11, 30), logged),
        (date(2027, 1, 1), logged),
        # Backfilled after the event closed.
        (date(2026, 12, 3), datetime(2027, 1, 2, 0, 1)),
    ]
    assert window_days(activity, window) == 2


def _listing(test_client: TestClient, today: date) -> dict[str, dict]:
    with SessionLocal() as db:
        user = db.get(User, test_client.user["id"])
        read = borders_for(db, user, today)
    return {item.key: item.model_dump(mode="json") for item in read.borders}


def test_coming_events_lead_the_list(client):
    listed = _listing(client, date(2026, 11, 19))
    assert list(listed)[:2] == ["christmas-2026", "summer-2026"]
    christmas = listed["christmas-2026"]
    assert christmas["group"] == "Events" and christmas["status"] == "upcoming"
    assert christmas["days_left"] == 12 and christmas["unlocked"] is False
    assert christmas["progress"]["current"] == 0
    assert christmas["requirement"] == "Train on 12 days in December 2026"


def test_removed_season_is_no_longer_worn(client):
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        user.profile_border = "season-1-1"
        db.commit()

        today = date(2026, 11, 19)
        listed = borders_for(db, user, today)
        assert listed.selected is None
        assert worn_border(user) is None
        assert not can_wear(db, user, "season-1-1", today)
        assert all(not border.key.startswith("season-") for border in listed.borders)
        assert not can_wear(db, user, "christmas-2027", date(2027, 11, 20))
