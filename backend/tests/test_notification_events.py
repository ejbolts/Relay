"""Inbox invalidation uses real authenticated sockets and committed API mutations."""

import pytest
from fastapi.websockets import WebSocketDisconnect
from test_sharing import befriend, share
from test_workout_reactions import log_workout

from app import presence

SOCKET = "/api/presence/ws"
EVENT = {"type": "notifications"}


def test_request_from_nonfriend_and_read_sync_reach_every_recipient_window(
    client, other_client, monkeypatch
):
    share(client)
    share(other_client)
    notified = []
    original = presence.hub.notifications_changed

    def record(*ids):
        notified.append(set(ids))
        original(*ids)

    monkeypatch.setattr(presence.hub, "notifications_changed", record)
    with other_client.websocket_connect(SOCKET) as phone:
        with other_client.websocket_connect(SOCKET) as desktop:
            assert client.post(f"/api/sharing/friends/{other_client.user['id']}").is_success
            assert phone.receive_json() == desktop.receive_json() == EVENT
            notices = other_client.get("/api/sharing/notifications").json()
            notice = notices["requests"][0]
            assert notice["id"] == client.user["id"] and not notice["is_read"]
            ref = {"kind": "request", "id": notice["id"], "since": notice["since"]}
            # An unrelated account cannot read this notice or invalidate its recipient's inbox.
            before = len(notified)
            assert client.post("/api/sharing/notifications/read", json={"items": [ref]}).is_success
            assert len(notified) == before
            assert other_client.post(
                "/api/sharing/notifications/read", json={"items": [ref]}
            ).is_success
            assert phone.receive_json() == desktop.receive_json() == EVENT
            assert other_client.get("/api/sharing/notifications").json()["requests"][0]["is_read"]
            before = len(notified)
            other_client.post("/api/sharing/notifications/read", json={"items": [ref]})
            assert len(notified) == before  # repeated acknowledgements cannot create an event loop
    assert notified == [{other_client.user["id"]}, {other_client.user["id"]}]


@pytest.mark.parametrize("accept_path", ["/accept", ""])
def test_acceptance_refreshes_both_accounts_including_reciprocal_add(
    client, other_client, accept_path
):
    share(client)
    share(other_client)
    client.post(f"/api/sharing/friends/{other_client.user['id']}")
    with client.websocket_connect(SOCKET) as requester:
        with other_client.websocket_connect(SOCKET) as recipient:
            response = other_client.post(f"/api/sharing/friends/{client.user['id']}{accept_path}")
            assert response.json() == {"status": "friends"}
            assert requester.receive_json() == recipient.receive_json() == EVENT
            assert (
                client.get("/api/sharing/notifications").json()["accepted"][0]["is_read"] is False
            )
            assert other_client.get("/api/sharing/notifications").json()["requests"] == []


def test_workout_reaction_and_removal_only_invalidate_the_owner(client, other_client, monkeypatch):
    share(client)
    share(other_client)
    befriend(client, other_client)
    workout = log_workout(client, "Sample workout", 0)
    delivered = []
    original = presence.deliver

    async def record(window, message):
        delivered.append((window.user_id, message))
        await original(window, message)

    monkeypatch.setattr(presence, "deliver", record)
    with client.websocket_connect(SOCKET) as owner:
        with other_client.websocket_connect(SOCKET):
            url = f"/api/sharing/workouts/{workout['id']}/reaction"
            assert other_client.put(url, json={"reaction": "love"}).is_success
            assert owner.receive_json() == EVENT
            notice = client.get("/api/sharing/notifications").json()["reactions"][0]
            assert notice["reaction"] == "love" and not notice["is_read"]
            assert other_client.delete(url).is_success
            assert owner.receive_json() == EVENT
            assert client.get("/api/sharing/notifications").json()["reactions"] == []
    assert delivered == [(client.user["id"], EVENT)] * 2


def test_comments_replies_and_comment_reactions_invalidate_their_recipients(client, other_client):
    share(client)
    share(other_client)
    befriend(client, other_client)
    workout = log_workout(other_client, "Sample workout", 0)
    url = f"/api/sharing/workouts/{workout['id']}/comments"
    with client.websocket_connect(SOCKET) as author:
        with other_client.websocket_connect(SOCKET) as owner:
            root = client.post(url, json={"body": "Great session", "reaction": "strong"}).json()
            assert owner.receive_json() == EVENT
            assert len(other_client.get("/api/sharing/notifications").json()["comments"]) == 1
            other_client.post(url, json={"body": "Thanks", "reply_to_id": root["id"]})
            assert author.receive_json() == EVENT
            assert client.get("/api/sharing/notifications").json()["comments"][0]["kind"] == "reply"
            reaction_url = f"/api/sharing/comments/{root['id']}/reaction"
            other_client.put(reaction_url, json={"reaction": "love"})
            assert author.receive_json() == EVENT
            assert len(client.get("/api/sharing/notifications").json()["comments"]) == 2
            other_client.delete(reaction_url)
            assert author.receive_json() == EVENT
            assert len(client.get("/api/sharing/notifications").json()["comments"]) == 1
            client.patch(f"/api/sharing/comments/{root['id']}", json={"body": "Excellent session"})
            assert author.receive_json() == owner.receive_json() == EVENT
            assert (
                other_client.get("/api/sharing/notifications").json()["comments"][0]["body"]
                == "Excellent session"
            )
            client.delete(f"/api/sharing/comments/{root['id']}")
            assert author.receive_json() == owner.receive_json() == EVENT
            assert client.get("/api/sharing/notifications").json()["comments"] == []
            assert other_client.get("/api/sharing/notifications").json()["comments"] == []


@pytest.mark.parametrize("path", ["friends", "blocks"])
def test_removing_friendship_or_blocking_invalidates_both_accounts(client, other_client, path):
    share(client)
    share(other_client)
    befriend(client, other_client)
    with client.websocket_connect(SOCKET) as first:
        with other_client.websocket_connect(SOCKET) as second:
            url = f"/api/sharing/{path}/{other_client.user['id']}"
            response = client.post(url) if path == "blocks" else client.delete(url)
            assert response.is_success
            assert first.receive_json() == second.receive_json() == EVENT
            assert client.get("/api/sharing/notifications").json()["accepted"] == []


def test_notification_delivery_rechecks_session_after_logout(client):
    with client.websocket_connect(SOCKET) as socket:
        assert client.post("/api/auth/logout").is_success
        presence.hub.notifications_changed(client.user["id"])
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_json()
        assert closed.value.code == 4401
