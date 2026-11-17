from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import update
from test_sharing import befriend, share

from app.database import SessionLocal
from app.models import CardioSession, TrainingWorkout, User, WorkoutCategory


def seed_cardio(user_id, count, *, source_workout_id=None, same_date=False):
    with SessionLocal() as db:
        sessions = [
            CardioSession(
                user_id=user_id,
                session_date=date(2026, 10, 26) - timedelta(days=0 if same_date else index),
                activity_type=f"Session {index + 1}",
                duration_minutes=40,
                notes=f"Cardio note {index + 1}",
                qualifies_zone2=True,
                source_workout_id=source_workout_id,
                source_movement_index=index if source_workout_id is not None else None,
                created_at=datetime(2026, 10, 26, tzinfo=UTC),
            )
            for index in range(count)
        ]
        db.add_all(sessions)
        db.commit()
        return [session.id for session in sessions]


def endpoint(owner):
    return f"/api/sharing/profiles/{owner.user['id']}/cardio"


def test_profile_loads_only_five_newest_and_pages_beyond_the_old_twenty_session_limit(
    client, other_client
):
    ids = seed_cardio(client.user["id"], 27)
    seed_cardio(other_client.user["id"], 1)
    share(client)
    share(other_client)
    initial = other_client.get(f"/api/sharing/profiles/{client.user['id']}").json()
    assert initial["cardio_total"] == 27
    assert [session["id"] for session in initial["cardio_sessions"]] == ids[:5]
    seen = []
    for offset in range(0, 30, 5):
        response = other_client.get(endpoint(client), params={"offset": offset})
        assert response.status_code == 200, response.text
        page = response.json()
        assert page["total"] == 27
        assert len(page["sessions"]) <= 5
        assert [item["id"] for item in page["sessions"]] == ids[offset : offset + 5]
        seen.extend(item["id"] for item in page["sessions"])
    assert seen == ids
    assert other_client.get(endpoint(client), params={"offset": 30}).json() == {
        "total": 27,
        "sessions": [],
    }


def test_private_owner_gets_pages_while_private_profile_remains_hidden_to_others(
    client, other_client
):
    ids = seed_cardio(client.user["id"], 8)
    share(client, "private")
    share(other_client)
    own = client.get(endpoint(client), params={"offset": 5})
    assert own.status_code == 200
    assert [item["id"] for item in own.json()["sessions"]] == ids[5:]
    assert client.get(f"/api/sharing/profiles/{client.user['id']}").json()["cardio_total"] == 8
    assert other_client.get(endpoint(client)).status_code == 404


def test_cardio_pages_follow_friendship_blocking_and_disabled_account_rules(client, other_client):
    seed_cardio(client.user["id"], 6)
    share(client, "followers")
    share(other_client)
    assert other_client.get(endpoint(client)).status_code == 403
    locked = other_client.get(f"/api/sharing/profiles/{client.user['id']}").json()
    assert locked["cardio_sessions"] is None and locked["cardio_total"] is None
    befriend(client, other_client)
    assert other_client.get(endpoint(client), params={"offset": 5}).status_code == 200
    assert client.post(f"/api/sharing/blocks/{other_client.user['id']}").status_code == 204
    assert other_client.get(endpoint(client)).status_code == 404
    assert client.delete(f"/api/sharing/blocks/{other_client.user['id']}").status_code == 204
    share(client, "public")
    with SessionLocal() as db:
        db.execute(
            update(User).where(User.id == client.user["id"]).values(disabled_at=datetime.now(UTC))
        )
        db.commit()
    assert other_client.get(endpoint(client)).status_code == 404


def test_every_page_preserves_notes_privacy_and_excludes_sample_workouts(client, other_client):
    seed_cardio(client.user["id"], 6)
    with SessionLocal() as db:
        sample = TrainingWorkout(
            user_id=client.user["id"],
            name="Sample",
            workout_date=date(2026, 10, 26),
            category=WorkoutCategory.CARDIO,
            is_sample=True,
        )
        db.add(sample)
        db.commit()
        sample_id = sample.id
    sample_ids = seed_cardio(client.user["id"], 1, source_workout_id=sample_id)
    share(client, share_notes=False)
    share(other_client)
    page = other_client.get(endpoint(client), params={"offset": 5}).json()
    assert page["total"] == 6
    assert len(page["sessions"]) == 1
    assert page["sessions"][0]["notes"] is None
    assert page["sessions"][0]["id"] not in sample_ids
    share(client, share_notes=True)
    assert (
        other_client.get(endpoint(client), params={"offset": 5}).json()["sessions"][0]["notes"]
        == "Cardio note 6"
    )


def test_equal_dates_and_creation_times_have_a_stable_order(client):
    ids = seed_cardio(client.user["id"], 11, same_date=True)
    expected = sorted(ids, reverse=True)
    pages = [
        client.get(endpoint(client), params={"offset": offset}).json() for offset in (0, 5, 10)
    ]
    assert [item["id"] for page in pages for item in page["sessions"]] == expected


@pytest.mark.parametrize("query", [{"offset": -1}, {"limit": 0}, {"limit": 6}])
def test_cardio_page_validation(client, query):
    assert client.get(endpoint(client), params=query).status_code == 422


def test_cardio_pages_require_sign_in(anonymous_client):
    assert anonymous_client.get("/api/sharing/profiles/account/cardio").status_code == 401
