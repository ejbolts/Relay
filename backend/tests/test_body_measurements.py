from __future__ import annotations

import pytest
from sqlalchemy import update

from app import tracker
from app.database import SessionLocal
from app.models import BodyMeasurement

DAY = {
    "measurement_date": "2026-11-24",
    "weight_kg": 84.2,
    "body_fat_pct": 18.5,
    "notes": "Morning",
}


def revision(client) -> str:
    return client.get("/api/workouts/revision").json()["revision"]


def count_rebuilds(monkeypatch) -> list[str]:
    rebuilds: list[str] = []
    real = tracker.rebuild_personal_records

    def counted(db, user_id):
        rebuilds.append(user_id)
        real(db, user_id)

    monkeypatch.setattr(tracker, "rebuild_personal_records", counted)
    return rebuilds


def test_resending_a_saved_check_in_changes_nothing(client, monkeypatch):
    saved = client.post("/api/body-measurements", json=DAY)
    assert saved.status_code == 200, saved.text
    before = revision(client)
    rebuilds = count_rebuilds(monkeypatch)

    # The app repeats a save whose answer never arrived. Notes are trimmed on the way in, so
    # padding is still the same check-in.
    again = client.post("/api/body-measurements", json={**DAY, "notes": " Morning "})

    assert again.status_code == 200, again.text
    assert again.json() == saved.json()
    assert rebuilds == []
    # A new revision would make every open device reload all of its training data.
    assert revision(client) == before
    assert len(client.get("/api/body-measurements").json()) == 1


@pytest.mark.parametrize(
    "change", [{"weight_kg": 84.3}, {"body_fat_pct": None}, {"notes": None}, {"notes": "Evening"}]
)
def test_a_changed_check_in_is_saved_and_tells_other_devices(client, monkeypatch, change):
    saved = client.post("/api/body-measurements", json=DAY).json()
    before = revision(client)
    rebuilds = count_rebuilds(monkeypatch)

    updated = client.post("/api/body-measurements", json={**DAY, **change})

    assert updated.status_code == 200, updated.text
    assert updated.json() == {**saved, **change}
    assert len(rebuilds) == 1
    assert revision(client) != before


def test_resending_a_sample_check_in_makes_it_the_persons_own(client):
    saved = client.post("/api/body-measurements", json=DAY).json()
    with SessionLocal() as db:
        db.execute(update(BodyMeasurement).values(is_sample=True))
        db.commit()
    before = revision(client)

    again = client.post("/api/body-measurements", json=DAY)

    assert again.json() == {**saved, "is_sample": False}
    assert revision(client) != before
