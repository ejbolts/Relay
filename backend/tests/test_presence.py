import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from test_auth import named, workout_payload
from test_sharing import befriend, share

from app.database import SessionLocal
from app.models import LiveWorkout, User
from app.presence import LiveWorkoutReport, hub, leave, presence_update, save_live_workout

SOCKET = "/api/presence/ws"
STARTED = datetime.now(UTC) - timedelta(minutes=20)


def live(name="Push day", kind="strength", expires_in=timedelta(hours=1)) -> dict:
    return {
        "name": name,
        "kind": kind,
        "started_at": STARTED.isoformat(),
        "expires_at": (datetime.now(UTC) + expires_in).isoformat(),
    }


def report(device="phone", visible=True, workout=None) -> dict:
    return {"type": "state", "device": device, "visible": visible, "workout": workout}


def friend_presence(viewer: TestClient, member: TestClient):
    friends = viewer.get("/api/sharing/friends").json()["friends"]
    return next(item for item in friends if item["id"] == member.user["id"])["presence"]


def start_workout(member: TestClient, **choices) -> None:
    assert save_live_workout(member.user["id"], "phone", LiveWorkoutReport(**live(**choices)))


def test_friends_see_online_status_and_a_workout_that_outlasts_a_locked_phone(client, other_client):
    befriend(client, other_client)
    with client.websocket_connect(SOCKET) as viewer:
        with other_client.websocket_connect(SOCKET) as phone:
            phone.send_json(report(workout=live()))
            message = viewer.receive_json()
            assert message["type"] == "presence"
            assert message["user_id"] == other_client.user["id"]
            assert message["presence"]["online"] is True
            assert message["presence"]["workout"] == {
                "name": "Push day",
                "kind": "strength",
                "started_at": STARTED.isoformat().replace("+00:00", "Z"),
            }
            presence = friend_presence(client, other_client)
            assert presence["online"] is True
            assert presence["workout"]["name"] == "Push day"

            phone.send_json(report(visible=False, workout=live()))
            hidden = viewer.receive_json()["presence"]
            assert hidden["online"] is False and hidden["last_active_at"] is not None

            phone.send_json(report(workout=live()))
            assert viewer.receive_json()["presence"]["online"] is True
    # Locking the phone closes its socket: offline, but the workout is still in progress.
    locked = friend_presence(client, other_client)
    assert locked["online"] is False
    assert locked["workout"]["name"] == "Push day"


def test_closing_the_last_window_records_last_active_and_tells_friends(client, other_client):
    befriend(client, other_client)
    owner = other_client.user["id"]
    sent = []

    class Window:
        async def send_json(self, message):
            sent.append(message)

    async def close_phone():
        hub.connect(client.user["id"], "viewer", Window())
        hub.connect(owner, "phone", Window())
        hub.connect(owner, "desktop", Window())
        hub.set_visible(owner, "phone", True)
        await leave(owner, "desktop")  # still online on the phone
        await leave(owner, "phone")
        await leave(client.user["id"], "viewer")

    asyncio.run(close_phone())
    assert [message["user_id"] for message in sent] == [owner]
    assert sent[0]["presence"]["online"] is False
    with SessionLocal() as db:
        last_active = db.get(User, owner).last_active_at.replace(tzinfo=UTC)
    assert datetime.now(UTC) - last_active < timedelta(minutes=1)


def test_finishing_clears_the_workout_but_other_devices_cannot(client, other_client):
    befriend(client, other_client)
    with client.websocket_connect(SOCKET) as viewer:
        with other_client.websocket_connect(SOCKET) as phone:
            phone.send_json(report(workout=live("Easy 5k run", "cardio")))
            assert viewer.receive_json()["presence"]["workout"]["kind"] == "cardio"
            phone.send_json(report(workout=None))
            finished = viewer.receive_json()["presence"]
            assert finished["online"] is True and finished["workout"] is None

    owner = other_client.user["id"]
    workout = LiveWorkoutReport(**live())
    assert save_live_workout(owner, "phone", workout) is True
    assert save_live_workout(owner, "phone", workout) is False  # nothing friends see changed
    assert save_live_workout(owner, "desktop", None) is False
    with SessionLocal() as db:
        assert db.get(LiveWorkout, owner) is not None
    assert save_live_workout(owner, "phone", None) is True
    with SessionLocal() as db:
        assert db.get(LiveWorkout, owner) is None


def test_expired_and_future_workouts_are_bounded(client, other_client):
    befriend(client, other_client)
    start_workout(other_client)
    with SessionLocal() as db:
        db.get(LiveWorkout, other_client.user["id"]).expires_at = datetime.now(UTC)
        db.commit()
    assert friend_presence(client, other_client)["workout"] is None
    ended = LiveWorkoutReport(**live(expires_in=timedelta(seconds=-1)))
    assert save_live_workout(other_client.user["id"], "phone", ended) is True  # clears it

    future = {**live(), "started_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat()}
    assert save_live_workout(other_client.user["id"], "phone", LiveWorkoutReport(**future))
    with SessionLocal() as db:
        stored = db.get(LiveWorkout, other_client.user["id"])
        assert stored.started_at.replace(tzinfo=UTC) <= datetime.now(UTC)


def test_sharing_switches_hide_online_status_and_workouts_separately(client, other_client):
    befriend(client, other_client)
    start_workout(other_client)
    with SessionLocal() as db:
        db.get(User, other_client.user["id"]).last_active_at = datetime.now(UTC)
        db.commit()
    both = friend_presence(client, other_client)
    assert both["online"] is False and both["last_active_at"] is not None
    assert both["workout"]["name"] == "Push day"

    share(other_client, share_online_status=False)
    assert friend_presence(client, other_client) == {
        "online": None,
        "last_active_at": None,
        "workout": both["workout"],
    }
    share(other_client, share_live_workouts=False)
    without_workout = friend_presence(client, other_client)
    assert without_workout["workout"] is None and without_workout["online"] is False
    share(other_client, share_online_status=False, share_live_workouts=False)
    assert friend_presence(client, other_client) is None


def test_only_friends_who_share_receive_presence(client, other_client):
    share(client)
    share(other_client)
    owner = other_client.user["id"]
    with client.websocket_connect(SOCKET):
        # A public profile is not enough: presence is for friends.
        assert presence_update(owner)[0] == []
        befriend(client, other_client)
        assert presence_update(owner)[0] == [client.user["id"]]
        share(client, "private")
        assert presence_update(owner)[0] == []
    share(client)
    share(other_client, "private")
    assert client.get("/api/sharing/friends").json()["friends"] == []


def test_feed_lists_friends_working_out_first(client, other_client):
    third = TestClient(client.app)
    third.user = register_user(third, "third", "Third")
    befriend(client, other_client)
    befriend(client, third)
    for member in (other_client, third):
        member.post("/api/workouts", json=workout_payload(named(member, "Back Squat")["id"]))
    names = [item["friend"]["id"] for item in client.get("/api/sharing/feed").json()["items"]]
    assert names == [third.user["id"], other_client.user["id"]]

    start_workout(other_client, name="Legs")
    items = client.get("/api/sharing/feed").json()["items"]
    assert [item["friend"]["id"] for item in items] == [other_client.user["id"], third.user["id"]]
    assert items[0]["friend"]["presence"]["workout"]["name"] == "Legs"
    assert items[1]["friend"]["presence"]["workout"] is None
    third.close()


def test_presence_socket_requires_a_signed_in_same_origin_window(client):
    signed_out = TestClient(client.app)
    with signed_out.websocket_connect(SOCKET) as socket:
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_text()
    assert closed.value.code == 4401
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(SOCKET, headers={"origin": "https://evil.example"}):
            pass
    signed_out.close()


def test_malformed_reports_are_ignored(client, other_client):
    befriend(client, other_client)
    with client.websocket_connect(SOCKET) as viewer:
        with other_client.websocket_connect(SOCKET) as phone:
            phone.send_text("not json")
            phone.send_json({"type": "state", "device": "phone", "visible": "maybe"})
            phone.send_json(report(workout={**live(), "name": "   "}))
            phone.send_text("x" * 5_000)
            phone.send_json(report())
            presence = viewer.receive_json()["presence"]
            assert presence["online"] is True and presence["workout"] is None
