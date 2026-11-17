from datetime import timedelta

import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from sqlalchemy import select
from test_sharing import befriend, share
from test_workout_reactions import log_workout

from app.database import SessionLocal
from app.models import CommentNotification, WorkoutComment


@pytest.fixture
def third_client(client):
    with TestClient(client.app) as third:
        third.user = register_user(third, "third", "Third")
        yield third


@pytest.fixture
def discussion(client, other_client):
    share(client)
    share(other_client, "followers")
    befriend(client, other_client)
    workout = log_workout(other_client, "Bench day", 0)
    return f"/api/sharing/workouts/{workout['id']}/comments"


def post(client, url, body="Great session!", **extra):
    response = client.post(url, json={"body": body, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def test_comments_replies_mentions_reactions_and_notifications(client, other_client, discussion):
    root = post(client, discussion, reaction="strong")
    assert root["reaction"] == "strong"
    assert root["reactions"]["yours"] is None
    reply = post(other_client, discussion, "Thanks!", reply_to_id=root["id"])
    nested = post(client, discussion, "Keep going", reply_to_id=reply["id"])
    assert nested["parent_id"] == root["id"]
    assert nested["reply_to"]["id"] == other_client.user["id"]
    page = client.get(discussion).json()
    assert page["total"] == 3
    assert len(page["items"]) == 3
    assert "username" not in str(page)
    notice = client.get("/api/sharing/notifications").json()["comments"][0]
    assert notice["kind"] == "reply" and notice["is_read"] is False
    ref = {"kind": "comment", "id": notice["notice_id"], "since": notice["since"]}
    # Other accounts cannot mark the recipient's notification read.
    other_client.post("/api/sharing/notifications/read", json={"items": [ref]})
    assert client.get("/api/sharing/notifications").json()["comments"][0]["is_read"] is False
    client.post("/api/sharing/notifications/read", json={"items": [ref]})
    assert client.get("/api/sharing/notifications").json()["comments"][0]["is_read"] is True
    url = f"/api/sharing/comments/{root['id']}/reaction"
    assert other_client.put(url, json={"reaction": "love"}).status_code == 200
    notices = client.get("/api/sharing/notifications").json()["comments"]
    reaction_notice = next(n for n in notices if n["kind"] == "comment_reaction")
    assert reaction_notice["reaction"] == "love"
    other_client.put(url, json={"reaction": "love"})
    assert len(client.get("/api/sharing/notifications").json()["comments"]) == len(notices)
    other_client.delete(url)
    assert all(
        n["kind"] != "comment_reaction"
        for n in client.get("/api/sharing/notifications").json()["comments"]
    )
    # Stale snapshots cannot acknowledge a newer event.
    with SessionLocal() as db:
        stored = db.get(CommentNotification, notice["notice_id"])
        stored.created_at += timedelta(seconds=1)
        stored.is_read = False
        db.commit()
    client.post("/api/sharing/notifications/read", json={"items": [ref]})
    assert client.get("/api/sharing/notifications").json()["comments"][0]["is_read"] is False


@pytest.mark.parametrize("body", ["", "   ", "a" * 281, "💪" * 281])
def test_rejects_invalid_comment_length(client, discussion, body):
    assert client.post(discussion, json={"body": body}).status_code == 422


@pytest.mark.parametrize("body", [b'{"body":"hello"}', b"\xff\xfe"])
def test_non_json_comment_requests_return_validation_error(client, discussion, body):
    response = client.post(discussion, content=body, headers={"Content-Type": "text/plain"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_edit_delete_ownership_and_cascade(client, other_client, discussion):
    root = post(client, discussion, "💪" * 280)
    url = f"/api/sharing/comments/{root['id']}"
    assert other_client.patch(url, json={"body": "Changed"}).status_code == 403
    edited = client.patch(url, json={"body": "Updated"}).json()
    assert edited["body"] == "Updated" and edited["edited_at"]
    post(other_client, discussion, reply_to_id=root["id"])
    assert other_client.delete(url).status_code == 204  # workout owner moderates
    assert client.get(discussion).json()["items"] == []
    with SessionLocal() as db:
        assert db.scalar(select(WorkoutComment)) is None
        assert db.scalar(select(CommentNotification)) is None


def test_privacy_block_unfriend_private_and_cross_workout(
    client, other_client, third_client, discussion
):
    share(third_client)
    root = post(client, discussion)
    assert third_client.get(discussion).status_code == 403
    other = log_workout(client, "Other workout", 0)
    assert (
        other_client.post(
            f"/api/sharing/workouts/{other['id']}/comments",
            json={"body": "x", "reply_to_id": root["id"]},
        ).status_code
        == 404
    )
    other_client.delete(f"/api/sharing/friends/{client.user['id']}")
    assert client.get(discussion).status_code == 403
    assert other_client.get(discussion).json()["total"] == 1  # public author's existing comment
    share(client, "followers")
    assert other_client.get(discussion).json()["items"] == []
    befriend(client, other_client)
    assert len(other_client.get(discussion).json()["items"]) == 1
    other_client.post(f"/api/sharing/blocks/{client.user['id']}")
    assert other_client.get(discussion).json()["items"] == []
    assert client.get(discussion).status_code == 404
    assert other_client.get("/api/sharing/notifications").json()["comments"] == []


def test_root_pagination_keeps_replies_with_thread(client, other_client, discussion):
    roots = [post(client, discussion, f"Comment {n}") for n in range(21)]
    post(other_client, discussion, "Reply", reply_to_id=roots[0]["id"])
    page = client.get(discussion).json()
    assert page["total"] == 22 and page["next_offset"] == 20
    assert len(page["items"]) == 21
    assert client.get(discussion + "?offset=20").json()["items"][0]["id"] == roots[-1]["id"]


def test_run_reaction_on_comments_and_attached_workout_reaction(client, other_client, discussion):
    comment = post(client, discussion, "Great run!", reaction="run")
    assert comment["reaction"] == "run"
    url = f"/api/sharing/comments/{comment['id']}/reaction"
    response = other_client.put(url, json={"reaction": "run"})
    assert response.status_code == 200, response.text
    assert response.json()["reactions"] == {
        "counts": [{"reaction": "run", "count": 1}],
        "yours": "run",
        "comment_count": 0,
    }
    notices = client.get("/api/sharing/notifications").json()["comments"]
    assert any(n["kind"] == "comment_reaction" and n["reaction"] == "run" for n in notices)
    assert other_client.delete(url).json()["reactions"]["counts"] == []
