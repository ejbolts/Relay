from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier, BrokenBarrierError

import pytest

from app import app_notices
from app.database import SessionLocal
from app.training_metrics import set_setting

EMPTY = {"release_seen": None, "weekly_review_seen": None}


def days_ago(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat()


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
        json={"release_seen": "2.0.0", "weekly_review_seen": days_ago(0)},
    )
    assert newer.json() == {"release_seen": "2.0.0", "weekly_review_seen": days_ago(0)}


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


def test_a_week_that_has_not_started_is_refused(client):
    # Values only move forward, so a device with its clock set ahead must not be able to
    # hide the weekly review on every device until that date arrives.
    client.put("/api/app-notices", json={"weekly_review_seen": days_ago(7)})
    for ahead in (3, 365):
        refused = client.put("/api/app-notices", json={"weekly_review_seen": days_ago(-ahead)})
        assert refused.status_code == 422
    assert client.get("/api/app-notices").json()["weekly_review_seen"] == days_ago(7)
    # A device a day ahead of the server, in a later time zone, is still accepted.
    ahead = client.put("/api/app-notices", json={"weekly_review_seen": days_ago(-1)})
    assert ahead.status_code == 200


def test_a_release_newer_than_the_app_sending_it_is_refused(client):
    running = {"X-Relay-Version": "1.3.0"}
    refused = client.put("/api/app-notices", json={"release_seen": "9.0.0"}, headers=running)
    assert refused.status_code == 422
    assert client.get("/api/app-notices").json() == EMPTY
    for seen in ("1.2.4", "1.3.0"):
        saved = client.put("/api/app-notices", json={"release_seen": seen}, headers=running)
        assert saved.status_code == 200
    assert client.get("/api/app-notices").json()["release_seen"] == "1.3.0"


def test_two_devices_recording_at_once_keep_both_notices(client, monkeypatch):
    week = days_ago(3)
    both_read = Barrier(2)
    merge = app_notices.merge_notices

    def wait_for_the_other_device(stored, update):
        # If both saves could read before either wrote, they would meet here and the second
        # write would drop the first. Serialised saves never meet, so the wait runs out.
        try:
            both_read.wait(timeout=1)
        except BrokenBarrierError:
            pass
        return merge(stored, update)

    monkeypatch.setattr(app_notices, "merge_notices", wait_for_the_other_device)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda change: client.put("/api/app-notices", json=change),
                [{"release_seen": "1.3.0"}, {"weekly_review_seen": week}],
            )
        )
    assert [response.status_code for response in responses] == [200, 200]
    assert client.get("/api/app-notices").json() == {
        "release_seen": "1.3.0",
        "weekly_review_seen": week,
    }


def test_unreadable_stored_notices_read_as_empty(client):
    user_id = client.user["id"]
    with SessionLocal() as db:
        set_setting(db, user_id, "app_notices", '{"release_seen": 13}')
        db.commit()
    assert client.get("/api/app-notices").json() == EMPTY


def test_notices_need_a_signed_in_account(anonymous_client):
    assert anonymous_client.get("/api/app-notices").status_code == 401
