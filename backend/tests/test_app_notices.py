import pytest

from app.database import SessionLocal
from app.training_metrics import set_setting

EMPTY = {"release_seen": None, "weekly_review_seen": None}


def test_notices_start_empty_and_are_kept_per_account(client, other_client):
    assert client.get("/api/app-notices").json() == EMPTY
    saved = client.put(
        "/api/app-notices",
        json={"release_seen": "1.3.0", "weekly_review_seen": "2026-11-16"},
    )
    assert saved.status_code == 200
    assert saved.json() == {"release_seen": "1.3.0", "weekly_review_seen": "2026-11-16"}
    assert client.get("/api/app-notices").json() == saved.json()
    assert other_client.get("/api/app-notices").json() == EMPTY


def test_one_notice_can_be_recorded_without_clearing_the_other(client):
    client.put("/api/app-notices", json={"release_seen": "1.3.0"})
    saved = client.put("/api/app-notices", json={"weekly_review_seen": "2026-11-16"})
    assert saved.json() == {"release_seen": "1.3.0", "weekly_review_seen": "2026-11-16"}


def test_notices_only_move_forward(client):
    client.put(
        "/api/app-notices",
        json={"release_seen": "1.10.0", "weekly_review_seen": "2026-11-16"},
    )
    # A device still on an older release, or an older week, cannot bring a notice back.
    older = client.put(
        "/api/app-notices",
        json={"release_seen": "1.9.4", "weekly_review_seen": "2026-11-09"},
    )
    assert older.json() == {"release_seen": "1.10.0", "weekly_review_seen": "2026-11-16"}
    newer = client.put(
        "/api/app-notices",
        json={"release_seen": "2.0.0", "weekly_review_seen": "2026-11-23"},
    )
    assert newer.json() == {"release_seen": "2.0.0", "weekly_review_seen": "2026-11-23"}


@pytest.mark.parametrize(
    "payload",
    [
        {"release_seen": "latest"},
        {"release_seen": "1.3"},
        {"release_seen": "1.3.0-beta"},
        {"weekly_review_seen": "next week"},
    ],
)
def test_invalid_notices_are_refused(client, payload):
    assert client.put("/api/app-notices", json=payload).status_code == 422
    assert client.get("/api/app-notices").json() == EMPTY


def test_unreadable_stored_notices_read_as_empty(client):
    user_id = client.user["id"]
    with SessionLocal() as db:
        set_setting(db, user_id, "app_notices", '{"release_seen": 13}')
        db.commit()
    assert client.get("/api/app-notices").json() == EMPTY


def test_notices_need_a_signed_in_account(anonymous_client):
    assert anonymous_client.get("/api/app-notices").status_code == 401
