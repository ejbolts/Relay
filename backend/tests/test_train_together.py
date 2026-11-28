"""Train together: friends link live workouts, and a partner's edit merges like another device's."""

from __future__ import annotations

import importlib.util
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_PASSWORD, register_user
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select, text
from sqlalchemy.exc import IntegrityError
from test_auth import named, upload_photo
from test_sharing import befriend, share

from app import train_together
from app.active_workouts import DraftChange
from app.auth import as_utc, hash_token
from app.database import SessionLocal, engine
from app.models import (
    TrainTogetherInvite,
    TrainTogetherMember,
    TrainTogetherSession,
    utc_now,
)

BASE = "/api/train-together"
SOCKET = "/api/presence/ws"
EVENT = {"type": "train_together"}
EXPIRED = "This code has expired. Ask for a new one."


@pytest.fixture
def third_client(client):
    with TestClient(client.app) as third:
        third.user = register_user(third, "third", "Third")
        share(third)
        yield third


def account(test_client: TestClient) -> str:
    return test_client.user["id"]


def lift(test_client: TestClient, name: str = "Barbell Bench Press") -> str:
    return named(test_client, name)["id"]


def new_draft(exercise_id: str, **fields) -> dict:
    now = int(datetime.now(UTC).timestamp() * 1000)
    return {
        "version": 1,
        "clientSessionId": str(uuid4()),
        "startedAt": now - 600_000,
        "lastActiveAt": now - 60_000,
        "updatedAt": now - 60_000,
        "name": "Push day",
        "workoutDate": datetime.now(UTC).date().isoformat(),
        "category": "push",
        "notes": "",
        "movements": [
            {
                "key": "m1",
                "exerciseId": exercise_id,
                "notes": "",
                "machinePhotoIds": [],
                "supersetKey": None,
                "sets": [
                    {"key": "s1", "reps": 8, "weight_kg": 60, "completed": True, "notes": None}
                ],
            }
        ],
        **fields,
    }


def start(test_client: TestClient, value: dict | None = None) -> dict:
    value = value or new_draft(lift(test_client))
    response = test_client.put(
        "/api/active-workout", json={"revision": 0, "base": None, "draft": value}
    )
    assert response.status_code == 200 and not response.json()["conflict"], response.text
    return value


def invite(test_client: TestClient) -> str:
    response = test_client.post(f"{BASE}/invite")
    assert response.status_code == 200, response.text
    return response.json()["token"]


def join(test_client: TestClient, token: str):
    return test_client.post(f"{BASE}/join", json={"token": token})


def link(inviter: TestClient, joiner: TestClient) -> dict:
    response = join(joiner, invite(inviter))
    assert response.status_code == 200, response.text
    return response.json()


def read(test_client: TestClient) -> dict:
    response = test_client.get(BASE)
    assert response.status_code == 200, response.text
    return response.json()


def partner_put(test_client: TestClient, owner: TestClient, **change):
    return test_client.put(f"{BASE}/members/{account(owner)}/workout", json=change)


def with_set(value: dict, key: str = "s2", **fields) -> dict:
    changed = deepcopy(value)
    previous = changed["movements"][0]["sets"][-1]
    changed["movements"][0]["sets"].append({**previous, "key": key, **fields})
    changed["updatedAt"] = changed["lastActiveAt"] = value["updatedAt"] + 1_000
    return changed


def friends(*clients: TestClient) -> None:
    for index, first in enumerate(clients):
        for second in clients[index + 1 :]:
            befriend(first, second)


def error(response) -> dict:
    return response.json()["error"]


# Inviting, joining and reading


def test_invite_join_and_both_read_the_partners_workout_with_matched_lifts(client, other_client):
    friends(client, other_client)
    only_mine = client.post(
        "/api/exercises",
        json={"name": "Zercher Duck Walk", "category": "push", "muscle_group": "Chest"},
    ).json()["id"]
    value = new_draft(lift(client))
    value["movements"].append(
        {**deepcopy(value["movements"][0]), "key": "m2", "exerciseId": only_mine}
    )
    start(client, value)

    created = client.post(f"{BASE}/invite").json()
    assert len(created["token"]) >= 16 and created["session_id"]
    expires = datetime.fromisoformat(created["expires_at"])
    assert timedelta(minutes=4) < expires - datetime.now(UTC) <= timedelta(minutes=5)
    with SessionLocal() as db:
        # Stored hashed: the token itself is nowhere in the database.
        assert db.get(TrainTogetherInvite, created["token"]) is None
        assert db.get(TrainTogetherInvite, hash_token(created["token"])) is not None

    joined = join(other_client, created["token"])
    assert joined.status_code == 200, joined.text
    session = joined.json()["session"]
    assert session["id"] == created["session_id"] and session["max_members"] == 4
    assert session["created_by"] == account(client)
    me, partner = session["members"]
    assert me["is_self"] and me["user_id"] == account(other_client) and me["workout"] is None
    assert partner["display_name"] == "Owner" and partner["username"] == "owner"
    workout = partner["workout"]
    assert workout["revision"] == 1 and workout["draft"] == value
    exercises = {item["id"]: item for item in workout["exercises"]}
    assert exercises[lift(client)]["same_as_exercise_id"] == lift(other_client)
    assert exercises[lift(client)]["name"] == "Barbell Bench Press"
    assert exercises[only_mine]["same_as_exercise_id"] is None

    owner = read(client)["session"]
    assert owner["id"] == session["id"]
    assert [member["user_id"] for member in owner["members"]] == [
        account(client),
        account(other_client),
    ]
    assert owner["members"][1]["workout"] is None  # the joiner has no workout yet


def test_a_new_code_cancels_the_previous_one_and_a_code_is_single_use(
    client, other_client, third_client
):
    friends(client, other_client, third_client)
    first = invite(client)
    second = invite(client)
    assert error(join(other_client, first)) == {"code": "train_invite_expired", "message": EXPIRED}
    assert join(other_client, second).status_code == 200
    used = join(third_client, second)
    assert used.status_code == 404 and error(used)["code"] == "train_invite_expired"


@pytest.mark.parametrize("token", ["", "short", "x" * 200, "not a token at all!!", "A" * 22])
def test_unknown_or_malformed_codes_read_as_expired_without_revealing_anything(
    client, other_client, token
):
    friends(client, other_client)
    invite(client)
    refused = join(other_client, token)
    assert refused.status_code == 404
    assert refused.json() == {"error": {"code": "train_invite_expired", "message": EXPIRED}}


def test_an_expired_code_is_refused(client, other_client):
    friends(client, other_client)
    token = invite(client)
    with SessionLocal() as db:
        db.get(TrainTogetherInvite, hash_token(token)).expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    refused = join(other_client, token)
    assert refused.status_code == 404 and error(refused)["message"] == EXPIRED
    # The creator's waiting session ended with its last code.
    assert read(client)["session"] is None


def test_own_code_is_refused(client):
    refused = join(client, invite(client))
    assert refused.status_code == 400
    assert error(refused) == {
        "code": "train_own_invite",
        "message": "That's your own code. Ask your friend to scan it.",
    }


def test_joining_requires_an_accepted_friendship_and_names_the_member_to_add(client, other_client):
    token = invite(client)
    refused = join(other_client, token)
    assert refused.status_code == 403
    assert error(refused) == {
        "code": "train_not_friends",
        "message": "Add Owner as a friend to train together.",
        "member": {"user_id": account(client), "name": "Owner"},
    }
    # A request that has not been accepted yet is not enough.
    assert other_client.post(f"/api/sharing/friends/{account(client)}").status_code == 200
    pending = join(other_client, token)
    assert pending.status_code == 403 and error(pending)["code"] == "train_not_friends"
    assert client.post(f"/api/sharing/friends/{account(other_client)}/accept").status_code == 200
    assert join(other_client, token).status_code == 200


@pytest.mark.parametrize("blocker", ["inviter", "joiner"])
def test_a_block_either_way_refuses_joining(client, other_client, blocker):
    friends(client, other_client)
    token = invite(client)
    first, second = (client, other_client) if blocker == "inviter" else (other_client, client)
    assert first.post(f"/api/sharing/blocks/{account(second)}").status_code == 204
    refused = join(other_client, token)
    assert refused.status_code == 403 and error(refused)["code"] == "train_not_friends"


def test_a_third_person_must_be_friends_with_every_member(client, other_client, third_client):
    friends(client, other_client)
    befriend(client, third_client)
    link(client, other_client)
    refused = join(third_client, invite(client))
    assert refused.status_code == 403
    assert error(refused)["member"] == {"user_id": account(other_client), "name": "Other"}
    befriend(other_client, third_client)
    joined = join(third_client, invite(client))
    assert joined.status_code == 200
    assert len(joined.json()["session"]["members"]) == 3


def test_a_full_session_refuses_joining_and_new_codes(
    client, other_client, third_client, monkeypatch
):
    friends(client, other_client, third_client)
    monkeypatch.setattr(train_together, "MAX_MEMBERS", 2)
    link(client, other_client)
    full = client.post(f"{BASE}/invite")
    assert full.status_code == 409 and error(full) == {
        "code": "train_full",
        "message": "This session is full.",
    }
    # A code made before the session filled up.
    session_id = read(client)["session"]["id"]
    with SessionLocal() as db:
        db.add(
            TrainTogetherInvite(
                token_hash=hash_token("early-code-abcdefgh"),
                session_id=session_id,
                created_by=account(client),
                expires_at=utc_now() + timedelta(minutes=5),
            )
        )
        db.commit()
    refused = join(third_client, "early-code-abcdefgh")
    assert refused.status_code == 409 and error(refused)["code"] == "train_full"


def test_joining_your_own_session_again_changes_nothing(client, other_client, third_client):
    friends(client, other_client, third_client)
    link(client, other_client)
    token = invite(client)
    again = join(other_client, token)
    assert again.status_code == 200 and len(again.json()["session"]["members"]) == 2
    # The code was not used up by a member who was already there.
    assert join(third_client, token).status_code == 200


# Leaving and ending


def test_joining_another_session_leaves_the_first_and_ended_names_who(
    client, other_client, third_client
):
    friends(client, other_client, third_client)
    first = link(client, other_client)["session"]["id"]
    second = link(third_client, other_client)["session"]["id"]
    assert second != first
    assert read(other_client)["session"]["id"] == second
    owner = read(client)
    assert owner["session"] is None
    assert owner["ended"] == {
        "session_id": first,
        "reason": "left",
        "by_user_id": account(other_client),
        "by_name": "Other",
    }

    left = other_client.post(f"{BASE}/leave")
    assert left.status_code == 200 and left.json()["session"] is None
    assert left.json()["ended"]["session_id"] == second
    assert left.json()["ended"]["by_user_id"] == account(other_client)
    assert read(third_client)["ended"] == {
        "session_id": second,
        "reason": "left",
        "by_user_id": account(other_client),
        "by_name": "Other",
    }
    # Leaving when not in a session succeeds.
    assert other_client.post(f"{BASE}/leave").status_code == 200

    with SessionLocal() as db:
        for member in db.scalars(select(TrainTogetherMember)):
            member.left_at = utc_now() - timedelta(minutes=11)
        db.commit()
    assert read(client) == {"session": None, "ended": None}


def test_a_three_person_session_carries_on_when_one_leaves(client, other_client, third_client):
    friends(client, other_client, third_client)
    link(client, other_client)
    link(client, third_client)
    third_client.post(f"{BASE}/leave")
    assert [member["user_id"] for member in read(client)["session"]["members"]] == [
        account(client),
        account(other_client),
    ]
    assert read(third_client)["ended"]["reason"] == "left"


def test_a_session_ends_after_twelve_hours(client, other_client):
    friends(client, other_client)
    session = link(client, other_client)["session"]["id"]
    with SessionLocal() as db:
        db.get(TrainTogetherSession, session).expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    assert read(other_client)["session"] is None
    assert read(client)["ended"] == {
        "session_id": session,
        "reason": "expired",
        "by_user_id": None,
        "by_name": None,
    }


def test_discarding_your_workout_leaves_the_session(client, other_client):
    friends(client, other_client)
    value = start(other_client)
    link(client, other_client)
    discarded = other_client.put(
        "/api/active-workout", json={"revision": 1, "base": value, "draft": None}
    )
    assert discarded.status_code == 200 and not discarded.json()["conflict"]
    assert read(client)["ended"]["reason"] == "discarded"
    assert read(client)["ended"]["by_name"] == "Other"


# Partner writes


def test_a_partners_set_lands_in_the_owners_draft(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    stored = read(other_client)["session"]["members"][1]["workout"]
    changed = with_set(stored["draft"], weight_kg=62.5)
    response = partner_put(other_client, client, revision=1, base=stored["draft"], draft=changed)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["revision"] == 2 and body["conflict"] is False and body["draft"] == changed
    assert body["exercises"][0]["same_as_exercise_id"] == lift(other_client)
    mine = client.get("/api/active-workout").json()
    assert mine["revision"] == 2
    assert [item["weight_kg"] for item in mine["draft"]["movements"][0]["sets"]] == [60, 62.5]
    assert mine["draft"]["clientSessionId"] == value["clientSessionId"]


def test_the_owners_edit_and_a_partners_edit_merge(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    owner_edit = {**deepcopy(value), "notes": "Felt strong"}
    response = client.put(
        "/api/active-workout", json={"revision": 1, "base": value, "draft": owner_edit}
    )
    assert response.json()["revision"] == 2
    # The partner's copy is one revision behind; the server merges it like another device's.
    merged = partner_put(other_client, client, revision=1, base=value, draft=with_set(value))
    assert merged.status_code == 200, merged.text
    body = merged.json()
    assert body["conflict"] is False and body["revision"] == 3
    assert body["draft"]["notes"] == "Felt strong"
    assert len(body["draft"]["movements"][0]["sets"]) == 2


def test_a_conflicting_edit_answers_with_the_stored_copy(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    mine = deepcopy(value)
    mine["movements"][0]["sets"][0]["reps"] = 10
    client.put("/api/active-workout", json={"revision": 1, "base": value, "draft": mine})
    theirs = deepcopy(value)
    theirs["movements"][0]["sets"][0]["reps"] = 6
    response = partner_put(other_client, client, revision=1, base=value, draft=theirs)
    assert response.status_code == 200
    assert response.json()["conflict"] is True
    assert response.json()["revision"] == 2 and response.json()["draft"] == mine


def forbidden_changes(value: dict) -> dict[str, dict]:
    other_session = {**deepcopy(value), "clientSessionId": str(uuid4())}
    return {
        "no base": {"revision": 1, "base": None, "draft": with_set(value)},
        "no draft": {"revision": 1, "base": value, "draft": None},
        "replace": {"revision": 1, "base": value, "draft": with_set(value), "replace": True},
        "auto save": {
            "revision": 1,
            "base": value,
            "draft": with_set(value),
            "autoSave": {"name": "x"},
        },
        "name": {"revision": 1, "base": value, "draft": {**with_set(value), "name": "Mine now"}},
        "notes": {"revision": 1, "base": value, "draft": {**value, "notes": "Hello"}},
        "paused": {"revision": 1, "base": value, "draft": {**value, "pausedAt": 1.0e12}},
        "session": {"revision": 1, "base": other_session, "draft": with_set(other_session)},
    }


@pytest.mark.parametrize(
    "case", ["no base", "no draft", "replace", "auto save", "name", "notes", "paused", "session"]
)
def test_a_partner_may_change_only_the_movements(client, other_client, case):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    refused = partner_put(other_client, client, **forbidden_changes(value)[case])
    assert refused.status_code == 422, refused.text
    assert error(refused)["code"] == "train_change_not_allowed"
    assert client.get("/api/active-workout").json() == {"revision": 1, "draft": value}


def test_a_partner_may_add_only_the_owners_exercises(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    added = deepcopy(value)
    added["movements"].append({**deepcopy(value["movements"][0]), "key": "m2"})
    added["movements"][1]["exerciseId"] = lift(other_client)  # the partner's own id
    refused = partner_put(other_client, client, revision=1, base=value, draft=added)
    assert refused.status_code == 422 and error(refused)["code"] == "train_change_not_allowed"
    added["movements"][1]["exerciseId"] = lift(client, "Back Squat")
    assert partner_put(other_client, client, revision=1, base=value, draft=added).status_code == 200


def test_allowed_partner_change_guards_rule_seven():
    value = new_draft("bench")

    def change(**fields) -> DraftChange:
        return DraftChange.model_validate({"revision": 1, "base": value, **fields})

    assert train_together.allowed_partner_change(value, change(draft=with_set(value)))
    timing = {**value, "inactiveFinishAt": value["startedAt"] + 9e6, "updatedAt": 2e12}
    assert train_together.allowed_partner_change(value, change(draft=timing))
    assert not train_together.allowed_partner_change(value, change(draft=None))
    assert not train_together.allowed_partner_change(
        value, DraftChange(revision=1, base=None, draft=value)
    )
    assert not train_together.allowed_partner_change(value, change(draft=value, replace=True))
    assert not train_together.allowed_partner_change(
        value, change(draft=value, autoSave={"broken": True})
    )
    assert not train_together.allowed_partner_change(
        value, change(draft={**value, "category": "pull"})
    )
    # Removing a field counts as changing it.
    typed = {**value, "workoutTypeId": "push"}
    assert not train_together.allowed_partner_change(
        typed, DraftChange(revision=1, base=typed, draft=value)
    )
    elsewhere = {**value, "clientSessionId": str(uuid4())}
    assert not train_together.allowed_partner_change(elsewhere, change(draft=with_set(value)))


def test_a_partner_with_no_workout_answers_no_workout(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    refused = partner_put(client, other_client, revision=1, base=value, draft=with_set(value))
    assert refused.status_code == 409 and error(refused)["code"] == "train_no_workout"


def test_non_partners_and_ex_partners_get_not_found(client, other_client, third_client):
    friends(client, other_client, third_client)
    value = start(client)
    link(client, other_client)
    change = {"revision": 1, "base": value, "draft": with_set(value)}
    for path in ("exercises",):
        assert third_client.get(f"{BASE}/members/{account(client)}/{path}").status_code == 404
    outsider = partner_put(third_client, client, **change)
    assert outsider.status_code == 404 and error(outsider)["code"] == "train_not_partner"
    assert partner_put(client, client, **change).status_code == 404  # yourself
    assert other_client.get(f"{BASE}/members/{account(client)}/exercises").status_code == 200
    other_client.post(f"{BASE}/leave")
    assert partner_put(other_client, client, **change).status_code == 404
    assert other_client.get(f"{BASE}/members/{account(client)}/exercises").status_code == 404
    assert client.get("/api/active-workout").json()["revision"] == 1


def test_partner_exercise_library_leaves_out_hidden_and_lists_favourites_first(
    client, other_client
):
    friends(client, other_client)
    link(client, other_client)
    squat, bench = lift(client, "Back Squat"), lift(client)
    favourite = client.patch(f"/api/exercises/{squat}/favorite", json={"is_favorite": True})
    assert favourite.status_code == 200, favourite.text
    hidden = client.patch(f"/api/exercises/{bench}", json={"hidden": True})
    assert hidden.status_code == 200, hidden.text
    response = other_client.get(f"{BASE}/members/{account(client)}/exercises")
    assert response.status_code == 200
    library = response.json()
    assert library[0]["id"] == squat
    assert library[0]["same_as_exercise_id"] == lift(other_client, "Back Squat")
    assert bench not in {item["id"] for item in library}
    names = [item["name"] for item in library[1:]]
    assert len(names) > 5 and names == sorted(names)


@pytest.mark.parametrize("ending", ["unfriend", "block"])
def test_unfriending_or_blocking_mid_session_removes_access_at_once(client, other_client, ending):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    if ending == "unfriend":
        assert client.delete(f"/api/sharing/friends/{account(other_client)}").status_code == 204
    else:
        assert client.post(f"/api/sharing/blocks/{account(other_client)}").status_code == 204
    refused = partner_put(other_client, client, revision=1, base=value, draft=with_set(value))
    assert refused.status_code == 404
    assert read(other_client)["session"] is None
    assert read(other_client)["ended"]["reason"] == "unfriended"
    assert read(other_client)["ended"]["by_user_id"] == account(client)


def test_a_stale_session_without_a_friendship_cannot_be_used(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    # The friendship disappears without the hook (for example, a row removed by hand).
    with SessionLocal() as db:
        db.execute(text("DELETE FROM friendships"))
        db.commit()
    assert (
        partner_put(other_client, client, revision=1, base=value, draft=with_set(value)).status_code
        == 404
    )
    # Reading the session ends the attendance rather than showing them.
    assert read(other_client)["session"] is None


# Saved workouts


def finish_payload(value: dict, revision: int) -> dict:
    return {
        "name": value["name"],
        "workout_date": value["workoutDate"],
        "category": "push",
        "notes": None,
        "client_session_id": value["clientSessionId"],
        "active_workout_revision": revision,
        "movements": [
            {
                "exercise_id": value["movements"][0]["exerciseId"],
                "sets": [{"reps": 8, "weight_kg": 60, "completed": True}],
            }
        ],
    }


def finish(test_client: TestClient, value: dict, revision: int) -> dict:
    response = test_client.post("/api/workouts", json=finish_payload(value, revision))
    assert response.status_code == 201, response.text
    return response.json()


def test_finishing_links_the_workout_and_leaves_and_a_later_finish_still_links(
    client, other_client
):
    friends(client, other_client)
    mine, theirs = start(client), start(other_client)
    link(client, other_client)
    saved = finish(client, mine, 1)
    assert saved["trained_with_count"] == 1
    assert saved["trained_with"] == [
        {
            "user_id": account(other_client),
            "display_name": "Other",
            "username": "other",
            "photo_url": None,
        }
    ]
    partner = read(other_client)
    assert partner["session"] is None
    assert partner["ended"]["reason"] == "finished" and partner["ended"]["by_name"] == "Owner"
    # The partner finishes after the session has already ended.
    later = finish(other_client, theirs, 1)
    assert [person["user_id"] for person in later["trained_with"]] == [account(client)]
    history = client.get("/api/workouts").json()
    assert history[0]["trained_with_count"] == 1
    snapshot = client.get("/api/workouts/snapshot").json()["workouts"][0]
    assert snapshot["trained_with"][0]["user_id"] == account(other_client)
    detail = client.get(f"/api/workouts/{saved['id']}").json()
    assert detail["trained_with_count"] == 1
    with SessionLocal() as db:
        workouts = {
            member.user_id: member.workout_id for member in db.scalars(select(TrainTogetherMember))
        }
    assert workouts == {account(client): saved["id"], account(other_client): later["id"]}


def test_trained_with_shows_on_the_feed_and_hides_who_the_viewer_cannot_see(
    client, other_client, third_client
):
    friends(client, other_client)
    befriend(client, third_client)
    share(other_client, "followers")  # friends only: third is not their friend
    mine = start(client)
    link(client, other_client)
    saved = finish(client, mine, 1)
    # The partner sees themselves on the owner's workout in their feed.
    feed = other_client.get("/api/sharing/feed").json()["items"]
    item = next(entry for entry in feed if entry["workout"]["id"] == saved["id"])
    assert [person["user_id"] for person in item["workout"]["trained_with"]] == [
        account(other_client)
    ]
    # Someone who cannot see the partner still learns the workout was shared, but not with whom.
    for path in ("/api/sharing/feed", "/api/sharing/timeline"):
        items = third_client.get(path).json()["items"]
        seen = next(entry for entry in items if entry["workout"]["id"] == saved["id"])
        assert seen["workout"]["trained_with"] == []
        assert seen["workout"]["trained_with_count"] == 1
    page = third_client.get(f"/api/sharing/profiles/{account(client)}/workouts").json()
    assert page["workouts"][0]["trained_with_count"] == 1
    assert page["workouts"][0]["trained_with"] == []


def test_trained_with_loads_a_page_in_constant_queries(client, other_client):
    friends(client, other_client)
    for _ in range(3):
        value = new_draft(lift(client))
        revision = client.get("/api/active-workout").json()["revision"]
        client.put("/api/active-workout", json={"revision": revision, "base": None, "draft": value})
        link(client, other_client)
        finish(client, value, revision + 1)

    statements: list[str] = []

    def count(*args):
        statements.append(args[2])

    event.listen(engine, "before_cursor_execute", count)
    try:
        workouts = client.get("/api/workouts").json()
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert [workout["trained_with_count"] for workout in workouts] == [1, 1, 1]
    assert sum("train_together_members" in statement for statement in statements) == 1


# The socket


def test_partners_windows_are_told_on_join_draft_change_and_leave(client, other_client):
    friends(client, other_client)
    with client.websocket_connect(SOCKET) as owner:
        link(client, other_client)
        assert owner.receive_json() == EVENT
        start(other_client)
        assert owner.receive_json() == EVENT
        other_client.post(f"{BASE}/leave")
        assert owner.receive_json() == EVENT


def test_a_partners_edit_tells_every_member(client, other_client):
    friends(client, other_client)
    value = start(client)
    with other_client.websocket_connect(SOCKET) as partner:
        link(client, other_client)
        assert partner.receive_json() == EVENT
        response = partner_put(other_client, client, revision=1, base=value, draft=with_set(value))
        assert response.status_code == 200
        assert partner.receive_json() == EVENT


# Accounts


def test_deleting_an_account_in_a_session_ends_it_for_the_partner(client, other_client):
    friends(client, other_client)
    link(client, other_client)
    deleted = other_client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert deleted.status_code == 204, deleted.text
    assert read(client)["session"] is None
    assert read(client)["ended"]["reason"] == "left"
    with SessionLocal() as db:
        assert {member.user_id for member in db.scalars(select(TrainTogetherMember))} == {
            account(client)
        }


def test_deleting_the_creator_keeps_a_live_group_of_three(client, other_client, third_client):
    friends(client, other_client, third_client)
    mine, theirs = start(other_client), start(third_client)
    session = link(client, other_client)["session"]["id"]
    link(client, third_client)
    deleted = client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert deleted.status_code == 204, deleted.text
    live = read(other_client)["session"]
    assert live["id"] == session and live["created_by"] is None
    assert [member["user_id"] for member in live["members"]] == [
        account(other_client),
        account(third_client),
    ]
    first = finish(other_client, mine, 1)
    assert [person["user_id"] for person in first["trained_with"]] == [account(third_client)]
    second = finish(third_client, theirs, 1)
    assert second["trained_with_count"] == 1


def test_saved_history_survives_the_creators_deletion(client, other_client, third_client):
    friends(client, other_client, third_client)
    values = {
        name: start(test_client)
        for name, test_client in (("a", client), ("b", other_client), ("c", third_client))
    }
    link(client, other_client)
    link(client, third_client)
    finish(client, values["a"], 1)
    saved = finish(other_client, values["b"], 1)
    finish(third_client, values["c"], 1)
    deleted = client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert deleted.status_code == 204
    kept = other_client.get(f"/api/workouts/{saved['id']}").json()
    assert [person["user_id"] for person in kept["trained_with"]] == [account(third_client)]
    assert kept["trained_with_count"] == 1


# Review fixes


@pytest.fixture
def fourth_client(client):
    with TestClient(client.app) as fourth:
        fourth.user = register_user(fourth, "fourth", "Fourth")
        share(fourth)
        yield fourth


def test_a_write_answered_after_access_ends_returns_no_snapshot(client, other_client, monkeypatch):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    real = train_together.change_draft

    def revoked_meanwhile(*args, **kwargs):
        result = real(*args, **kwargs)
        with SessionLocal() as db:
            db.execute(text("DELETE FROM friendships"))
            db.commit()
        return result

    monkeypatch.setattr(train_together, "change_draft", revoked_meanwhile)
    response = partner_put(other_client, client, revision=1, base=value, draft=with_set(value))
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "train_not_partner", "message": "You are not training with them now."}
    }


def slow_checks(monkeypatch):
    """Widen the window between admission checks and the insert, as a slow request would."""
    real = train_together._friends

    def slow(*args):
        time.sleep(0.05)
        return real(*args)

    monkeypatch.setattr(train_together, "_friends", slow)


def at_once(*calls):
    barrier = threading.Barrier(len(calls))

    def run(call):
        barrier.wait()
        return call()

    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(run, call) for call in calls]
        return [future.result() for future in futures]


def open_memberships(user_id: str) -> int:
    with SessionLocal() as db:
        rows = db.scalars(
            select(TrainTogetherMember).where(
                TrainTogetherMember.user_id == user_id, TrainTogetherMember.left_at.is_(None)
            )
        )
        return len(rows.all())


def test_one_code_scanned_twice_at_once_admits_one(client, other_client, third_client, monkeypatch):
    friends(client, other_client, third_client)
    token = invite(client)
    slow_checks(monkeypatch)
    results = at_once(lambda: join(other_client, token), lambda: join(third_client, token))
    assert sorted(result.status_code for result in results) == [200, 404]
    assert len(read(client)["session"]["members"]) == 2


def test_the_last_place_goes_to_one_of_two_arrivals(
    client, other_client, third_client, fourth_client, monkeypatch
):
    friends(client, other_client, third_client, fourth_client)
    monkeypatch.setattr(train_together, "MAX_MEMBERS", 3)
    link(client, other_client)
    first, second = invite(client), invite(other_client)
    slow_checks(monkeypatch)
    results = at_once(lambda: join(third_client, first), lambda: join(fourth_client, second))
    assert sorted(result.status_code for result in results) == [200, 409]
    assert len(read(client)["session"]["members"]) == 3


def test_one_account_joining_two_sessions_at_once_ends_up_in_one(
    client, other_client, third_client, monkeypatch
):
    friends(client, other_client, third_client)
    first, second = invite(client), invite(third_client)
    slow_checks(monkeypatch)
    results = at_once(lambda: join(other_client, first), lambda: join(other_client, second))
    assert all(result.status_code == 200 for result in results)
    assert open_memberships(account(other_client)) == 1


def test_the_schema_allows_one_open_membership_per_account(client, other_client):
    friends(client, other_client)
    link(client, other_client)
    with pytest.raises(IntegrityError), SessionLocal() as db:
        # A second, separate session: still only one open attendance is allowed.
        other = TrainTogetherSession(
            created_by=account(other_client), expires_at=utc_now() + timedelta(hours=1)
        )
        db.add(other)
        db.flush()
        db.add(TrainTogetherMember(session_id=other.id, user_id=account(other_client)))
        db.commit()


def test_rejoining_records_a_separate_attendance_and_links_both_workouts(
    client, other_client, third_client, fourth_client
):
    friends(client, other_client, third_client, fourth_client)
    first = start(other_client)
    link(client, other_client)
    link(client, third_client)
    earlier = finish(other_client, first, 1)
    link(client, fourth_client)  # joins while Other is away
    second = new_draft(lift(other_client))
    other_client.put("/api/active-workout", json={"revision": 2, "base": None, "draft": second})
    link(client, other_client)
    later = finish(other_client, second, 3)
    assert read(other_client)["session"] is None
    history = {item["id"]: item for item in other_client.get("/api/workouts").json()}
    assert {person["user_id"] for person in history[earlier["id"]]["trained_with"]} == {
        account(client),
        account(third_client),
    }
    assert {person["user_id"] for person in history[later["id"]]["trained_with"]} == {
        account(client),
        account(third_client),
        account(fourth_client),
    }


def test_a_failed_finish_retried_ends_up_linked(client, other_client, monkeypatch):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    real = train_together.workout_saved
    calls = []

    def fails_once(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("stopped mid-save")
        return real(*args, **kwargs)

    monkeypatch.setattr(train_together, "workout_saved", fails_once)
    with pytest.raises(RuntimeError):
        client.post("/api/workouts", json=finish_payload(value, 1))
    retried = finish(client, value, 1)
    assert retried["trained_with_count"] == 1
    assert read(other_client)["ended"]["reason"] == "finished"


def test_a_repeated_finish_repairs_a_missing_link(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    saved = finish(client, value, 1)
    with SessionLocal() as db:
        for member in db.scalars(select(TrainTogetherMember)):
            member.workout_id = None
        db.commit()
    again = finish(client, value, 1)
    assert again["id"] == saved["id"] and again["trained_with_count"] == 1


def test_discarding_an_old_draft_keeps_a_session_joined_since(client, other_client):
    friends(client, other_client)
    start(other_client)
    link(client, other_client)
    old = new_draft(lift(other_client))
    with SessionLocal() as db:
        affected = train_together.draft_changed(db, account(other_client), old, None)
        db.commit()
    assert affected == set()
    assert len(read(client)["session"]["members"]) == 2


def test_a_read_after_the_friendship_lapsed_says_nothing_about_the_other_person(
    client, other_client
):
    friends(client, other_client)
    start(client)
    link(client, other_client)
    with SessionLocal() as db:
        db.execute(text("DELETE FROM friendships"))
        db.commit()
    body = other_client.get(BASE).text
    for detail in (account(client), '"owner"', "Owner"):
        assert detail not in body
    assert read(other_client)["session"] is None
    assert open_memberships(account(other_client)) == 0


@pytest.mark.parametrize("change", ["block", "unblock", "unfriend", "private", "delete"])
def test_a_partners_change_invalidates_cached_history(client, other_client, change):
    friends(client, other_client)
    mine, theirs = start(client), start(other_client)
    link(client, other_client)
    finish(client, mine, 1)
    finish(other_client, theirs, 1)
    if change == "unblock":
        other_client.post(f"/api/sharing/blocks/{account(client)}")
    before = client.get("/api/workouts/revision").json()["revision"]
    if change == "block":
        other_client.post(f"/api/sharing/blocks/{account(client)}")
    elif change == "unblock":
        other_client.delete(f"/api/sharing/blocks/{account(client)}")
    elif change == "unfriend":
        other_client.delete(f"/api/sharing/friends/{account(client)}")
    elif change == "private":
        share(other_client, "private")
    else:
        other_client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert client.get("/api/workouts/revision").json()["revision"] != before


def test_disabling_a_partner_invalidates_cached_history(client, other_client):
    friends(client, other_client)
    mine = start(client)
    link(client, other_client)
    finish(client, mine, 1)
    before = client.get("/api/workouts/revision").json()["revision"]
    disabled = client.patch(f"/api/admin/users/{account(other_client)}", json={"disabled": True})
    assert disabled.status_code == 200, disabled.text
    assert client.get("/api/workouts/revision").json()["revision"] != before


def test_restoring_an_older_archive_keeps_the_partner_on_the_other_history(client, other_client):
    friends(client, other_client)
    archive = client.get("/api/account-archive").content
    mine, theirs = start(client), start(other_client)
    link(client, other_client)
    finish(client, mine, 1)
    saved = finish(other_client, theirs, 1)
    restored = client.post(
        "/api/account-archive/restore",
        files={"file": ("relay-archive.zip", archive, "application/zip")},
    )
    assert restored.status_code == 200, restored.text
    kept = other_client.get(f"/api/workouts/{saved['id']}").json()
    assert [person["user_id"] for person in kept["trained_with"]] == [account(client)]


def test_new_references_are_checked_against_the_stored_draft(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    sneaky = deepcopy(value)
    sneaky["movements"].append(
        {**deepcopy(value["movements"][0]), "key": "m2", "exerciseId": lift(other_client)}
    )
    # The base claims the partner's own exercise was already in the workout.
    refused = partner_put(other_client, client, revision=1, base=sneaky, draft=with_set(sneaky))
    assert refused.status_code == 422 and error(refused)["code"] == "train_change_not_allowed"
    swapped = deepcopy(value)
    swapped["movements"][0]["exerciseId"] = lift(client, "Back Squat")
    refused = partner_put(other_client, client, revision=1, base=value, draft=swapped)
    assert refused.status_code == 422 and error(refused)["code"] == "train_change_not_allowed"
    photo = deepcopy(value)
    photo["movements"][0]["machinePhotoIds"] = ["someone-elses-photo"]
    refused = partner_put(other_client, client, revision=1, base=value, draft=photo)
    assert refused.status_code == 422 and error(refused)["code"] == "train_change_not_allowed"
    assert client.get("/api/active-workout").json()["revision"] == 1


@pytest.mark.parametrize("missing", ["notes", "completed"])
def test_a_partner_draft_must_stay_readable_by_the_owners_app(client, other_client, missing):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    changed = with_set(value)
    del changed["movements"][0]["sets"][-1][missing]
    refused = partner_put(other_client, client, revision=1, base=value, draft=changed)
    assert refused.status_code == 422 and error(refused)["code"] == "train_change_not_allowed"


def expire(session_id: str, ago: timedelta = timedelta(seconds=1)) -> datetime:
    at = utc_now() - ago
    with SessionLocal() as db:
        db.get(TrainTogetherSession, session_id).expires_at = at
        db.commit()
    return at


def test_a_new_workout_after_expiry_is_not_linked(client, other_client):
    friends(client, other_client)
    session = link(client, other_client)["session"]["id"]
    expire(session)
    value = start(other_client)
    saved = finish(other_client, value, 1)
    assert saved["trained_with_count"] == 0


def test_a_draft_linked_during_the_session_still_links_when_finished_late(client, other_client):
    friends(client, other_client)
    value = start(other_client)
    session = link(client, other_client)["session"]["id"]
    with SessionLocal() as db:
        # The session started an hour ago and lapsed half an hour ago.
        for member in db.scalars(select(TrainTogetherMember)):
            member.joined_at = utc_now() - timedelta(hours=1)
        db.commit()
    at = expire(session, timedelta(minutes=30))
    saved = finish(other_client, value, 1)
    assert saved["trained_with_count"] == 1
    with SessionLocal() as db:
        ended = db.get(TrainTogetherSession, session)
        assert ended.ended_reason == "expired"
        assert abs(as_utc(ended.ended_at) - at) < timedelta(seconds=1)
    # The notice window counts from the real expiry, so it has already passed.
    assert read(client)["ended"] is None


def test_the_same_exercise_twice_answers_a_conflict(client, other_client):
    friends(client, other_client)
    value = start(client)
    link(client, other_client)
    squat = lift(client, "Back Squat")

    def with_squat(draft: dict, key: str) -> dict:
        changed = deepcopy(draft)
        changed["movements"].append(
            {**deepcopy(draft["movements"][0]), "key": key, "exerciseId": squat}
        )
        return changed

    # Both add squats against the same copy, and the owner's lands first.
    owner = with_squat(value, "owner-squat")
    client.put("/api/active-workout", json={"revision": 1, "base": value, "draft": owner})
    response = partner_put(
        other_client, client, revision=1, base=value, draft=with_squat(value, "p")
    )
    assert response.status_code == 200 and response.json()["conflict"] is True
    assert response.json()["draft"] == owner
    # Adding an exercise the workout already has.
    again = partner_put(other_client, client, revision=2, base=owner, draft=with_squat(owner, "p2"))
    assert again.json()["conflict"] is True
    assert client.get("/api/active-workout").json()["revision"] == 2


def test_every_workout_response_carries_who_it_was_trained_with(client, other_client):
    friends(client, other_client)
    uploaded = upload_photo(client, lift(client))
    assert uploaded.status_code in (200, 201), uploaded.text
    photo = uploaded.json()["id"]
    value = start(client)
    link(client, other_client)
    payload = finish_payload(value, 1)
    payload["movements"][0]["machine_photo_ids"] = [photo]
    payload["movements"][0]["sets"][0]["machine_photo_id"] = photo
    first = client.post("/api/workouts", json=payload)
    assert first.status_code == 201, first.text
    retry = client.post("/api/workouts", json=payload)
    assert retry.status_code == 201, retry.text
    detail = client.get(f"/api/workouts/{first.json()['id']}")
    pinned = client.get(f"/api/machine-photos/{photo}/workouts")
    for body in (first.json(), retry.json(), detail.json(), pinned.json()[0]):
        assert body["trained_with_count"] == 1
        assert body["trained_with"][0]["user_id"] == account(other_client)


def test_an_overlong_code_reads_as_expired(client, other_client):
    friends(client, other_client)
    refused = join(other_client, "x" * 201)
    assert refused.status_code == 404 and error(refused)["code"] == "train_invite_expired"


# Migration


def test_migration_adds_and_removes_only_its_tables():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0068_train_together.py"
    spec = importlib.util.spec_from_file_location("train_together_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0067_custom_reactions"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE training_workouts (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        tables = set(inspect(connection).get_table_names())
        assert {
            "train_together_sessions",
            "train_together_members",
            "train_together_invites",
        } <= tables
        indexes = {
            index["name"] for index in inspect(connection).get_indexes("train_together_members")
        }
        assert {
            "ix_train_together_members_user_id",
            "ix_train_together_members_workout_id",
        } <= indexes
        migration.downgrade()
        assert set(inspect(connection).get_table_names()) == {"users", "training_workouts"}
