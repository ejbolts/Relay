import uuid

import pytest
from conftest import make_user
from sqlalchemy import delete, func, select

from app.account_backups import ACCOUNT_ROWS
from app.database import SessionLocal
from app.models import AppFeedback, User


def payload(message="A clearer guide would help."):
    return {"message": message, "submission_id": str(uuid.uuid4())}


def test_requires_sign_in_and_admin_read_access(anonymous_client, other_client):
    anonymous_client.post("/api/auth/logout")
    assert anonymous_client.post("/api/feedback", json=payload()).status_code == 401
    assert anonymous_client.get("/api/admin/feedback").status_code == 401
    assert other_client.get("/api/admin/feedback").status_code == 403


def test_feedback_is_private_and_retries_do_not_duplicate(client, other_client):
    request = payload("  Love the guide!\nMore help with cardio please.  ")
    response = other_client.post("/api/feedback", json=request)
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    assert set(response.json()) == {"id"}
    assert other_client.post("/api/feedback", json=request).json() == response.json()
    assert other_client.get("/api/feedback").status_code in (404, 405)
    messages = client.get("/api/admin/feedback")
    assert messages.headers["cache-control"] == "no-store"
    assert len(messages.json()) == 1
    assert messages.json()[0]["username"] == "other"
    assert messages.json()[0]["message"] == "Love the guide!\nMore help with cardio please."
    # Client IDs from separate accounts cannot return or overwrite another user's row.
    assert client.post("/api/feedback", json=request).json()["id"] != response.json()["id"]


@pytest.mark.parametrize("message", ["", " \n\t ", "a" * 2001])
def test_rejects_empty_and_oversized_feedback(client, message):
    assert client.post("/api/feedback", json=payload(message)).status_code == 422
    assert client.get("/api/admin/feedback").json() == []


def test_uses_existing_save_rate_limit(client, other_client):
    client.put("/api/admin/limits", json={"saves_per_minute": 1})
    assert other_client.post("/api/feedback", json=payload()).status_code == 201
    assert other_client.post("/api/feedback", json=payload()).status_code == 429


def test_deleted_account_removes_feedback(client, other_client):
    other_client.post("/api/feedback", json=payload())
    with SessionLocal() as db:
        db.execute(delete(User).where(User.id == other_client.user["id"]))
        db.commit()
        assert db.scalar(select(func.count()).select_from(AppFeedback)) == 0


def test_feedback_storage_cap_still_allows_safe_retry(client):
    first = payload()
    first_id = client.post("/api/feedback", json=first).json()["id"]
    with SessionLocal() as db:
        db.add_all(
            AppFeedback(
                user_id=client.user["id"], submission_id=str(uuid.uuid4()), message="Sample"
            )
            for _ in range(99)
        )
        db.commit()
    assert client.post("/api/feedback", json=payload()).status_code == 429
    assert client.post("/api/feedback", json=first).json()["id"] == first_id
    assert ACCOUNT_ROWS["app_feedback"] is None


def test_admin_resolves_and_reopens_feedback(client, other_client):
    first = other_client.post("/api/feedback", json=payload("First")).json()["id"]
    second = other_client.post("/api/feedback", json=payload("Second")).json()["id"]
    summary = client.get("/api/admin/feedback/summary")
    assert summary.headers["cache-control"] == "no-store"
    assert summary.json() == {"open": 2}

    resolved = client.patch(f"/api/admin/feedback/{second}", json={"resolved": True})
    assert resolved.status_code == 200
    assert resolved.headers["cache-control"] == "no-store"
    assert resolved.json()["resolved_by"] == client.user["username"]
    resolved_at = resolved.json()["resolved_at"]
    assert resolved_at is not None
    # A retried resolve keeps the original time instead of moving it.
    again = client.patch(f"/api/admin/feedback/{second}", json={"resolved": True}).json()
    assert again["resolved_at"] == resolved_at
    assert client.get("/api/admin/feedback/summary").json() == {"open": 1}
    # Open feedback is listed before resolved feedback, even when it is older.
    listed = client.get("/api/admin/feedback").json()
    assert [item["id"] for item in listed] == [first, second]
    assert listed[0]["resolved_at"] is None and listed[0]["resolved_by"] is None

    reopened = client.patch(f"/api/admin/feedback/{second}", json={"resolved": False}).json()
    assert reopened["resolved_at"] is None and reopened["resolved_by"] is None
    assert client.get("/api/admin/feedback/summary").json() == {"open": 2}


def test_only_admins_can_resolve_or_count_feedback(client, other_client):
    feedback_id = other_client.post("/api/feedback", json=payload()).json()["id"]
    assert other_client.get("/api/admin/feedback/summary").status_code == 403
    assert (
        other_client.patch(f"/api/admin/feedback/{feedback_id}", json={"resolved": True})
    ).status_code == 403
    missing = client.patch("/api/admin/feedback/missing", json={"resolved": True})
    assert missing.status_code == 404
    assert client.get("/api/admin/feedback/summary").json() == {"open": 1}


def test_deleting_the_resolving_admin_keeps_the_resolution(client, other_client):
    feedback_id = other_client.post("/api/feedback", json=payload()).json()["id"]
    admin_id = make_user("second-admin", is_admin=True)
    with SessionLocal() as db:
        item = db.get(AppFeedback, feedback_id)
        item.resolved_at = item.created_at
        item.resolved_by_id = admin_id
        db.commit()
        db.execute(delete(User).where(User.id == admin_id))
        db.commit()
    listed = client.get("/api/admin/feedback").json()
    assert listed[0]["resolved_at"] is not None
    assert listed[0]["resolved_by"] is None
    assert client.get("/api/admin/feedback/summary").json() == {"open": 0}
