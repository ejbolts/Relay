from datetime import date, datetime, timedelta
from time import perf_counter

import pytest
from sqlalchemy import delete
from test_account_archive import download, send
from test_auth import TEST_PASSWORD
from test_profile_borders import borders, wear, workout
from test_sharing import profile, share

from app import profile_borders
from app.database import SessionLocal
from app.models import CardioSession, ProfileBorderUnlock, TrainingWorkout, User, WorkoutCategory
from app.profile_borders import borders_for


@pytest.fixture(autouse=True)
def backdates_allowed(monkeypatch):
    monkeypatch.setattr(profile_borders, "BACKDATES_PER_WEEK", 10_000)


def test_first_unlock_is_saved_when_wearing_and_removed_when_locked(client, other_client):
    start = date.today() - timedelta(days=14)
    assert borders(client)["first-steps"]["unlocked_on"] is None
    workouts = [workout(client, start + timedelta(days=i)) for i in range(6)]
    first_unlock = start + timedelta(days=4)
    assert wear(client, "first-steps").status_code == 200

    share(client, visibility="public")
    share(other_client)
    assert profile(other_client, client).json()["profile_border_unlocked_on"] == str(first_unlock)
    share(client, visibility="followers")
    assert profile(other_client, client).json()["profile_border_unlocked_on"] is None

    # Deleting an early workout still leaves five, so the observed date stays fixed.
    with SessionLocal() as db:
        db.execute(delete(TrainingWorkout).where(TrainingWorkout.id == workouts[0]["id"]))
        db.commit()
    assert borders(client)["first-steps"]["unlocked_on"] == str(first_unlock)
    with SessionLocal() as db:
        db.execute(delete(TrainingWorkout).where(TrainingWorkout.id == workouts[1]["id"]))
        db.commit()
    assert wear(client, "first-steps").status_code == 403
    assert borders(client)["first-steps"]["unlocked_on"] is None
    new_day = start + timedelta(days=7)
    workout(client, new_day)
    assert borders(client)["first-steps"]["unlocked_on"] == str(new_day)


def log_training_days(user_id: str, first: date, count: int) -> None:
    with SessionLocal() as db:
        db.add_all(
            TrainingWorkout(
                user_id=user_id,
                name="Border training",
                workout_date=day,
                category=WorkoutCategory.UPPER,
                duration_minutes=125,
                created_at=datetime.combine(day, datetime.min.time()),
            )
            for day in (first + timedelta(days=i) for i in range(count))
        )
        db.commit()


def test_event_date_ignores_activity_outside_its_window(client):
    user_id = client.user["id"]
    log_training_days(user_id, date(2026, 11, 27), 17)
    with SessionLocal() as db:
        read = borders_for(db, db.get(User, user_id), date(2027, 1, 6))
    christmas = next(item for item in read.borders if item.key == "christmas-2026")
    assert christmas.unlocked_on == date(2026, 12, 12)


def test_unlock_dates_round_trip_in_account_archive(client):
    start = date.today() - timedelta(days=10)
    for i in range(5):
        workout(client, start + timedelta(days=i))
    expected = str(start + timedelta(days=4))
    assert borders(client)["first-steps"]["unlocked_on"] == expected
    archive = download(client)
    with SessionLocal() as db:
        db.execute(
            delete(ProfileBorderUnlock).where(ProfileBorderUnlock.user_id == client.user["id"])
        )
        db.commit()
    response = send(client, archive)
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        row = db.get(ProfileBorderUnlock, (client.user["id"], "first-steps"))
        assert str(row.unlocked_on) == expected

    response = client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert response.status_code == 204, response.text
    with SessionLocal() as db:
        assert db.get(ProfileBorderUnlock, (client.user["id"], "first-steps")) is None


def test_long_training_history_uses_cached_in_memory_prefixes(client):
    user_id = client.user["id"]
    first = date(2026, 9, 1)
    log_training_days(user_id, first, 520)
    with SessionLocal() as db:
        db.add_all(
            CardioSession(
                user_id=user_id,
                session_date=day,
                activity_type="Run",
                duration_minutes=60,
                distance_km=12,
                elevation_gain_m=400,
                created_at=datetime.combine(day, datetime.min.time()),
            )
            for day in (first + timedelta(days=i) for i in range(520))
        )
        db.commit()
        user = db.get(User, user_id)
        started = perf_counter()
        read = borders_for(db, user, first + timedelta(days=519))
        elapsed = perf_counter() - started
    earned = {item.key: item.unlocked_on for item in read.borders if item.unlocked}
    assert earned["first-steps"] == first + timedelta(days=4)
    assert earned["unbreakable"] == first + timedelta(days=499)
    assert all(earned.values())
    print(f"Computed {len(earned)} unlocks in {elapsed:.3f} s")
