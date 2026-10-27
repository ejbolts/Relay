from datetime import date, timedelta

import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from test_auth import named
from test_sharing import befriend, share


def log_workout(test_client: TestClient, name: str, days_ago: int, notes: str | None = None):
    response = test_client.post(
        "/api/workouts",
        json={
            "name": name,
            "workout_date": (date.today() - timedelta(days=days_ago)).isoformat(),
            "category": "push",
            "notes": notes,
            "movements": [
                {
                    "exercise_id": named(test_client, "Barbell Bench Press")["id"],
                    "sets": [{"reps": 5, "weight_kg": 100, "completed": True}],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_reaction_people_show_current_reactions_to_owner_and_authorized_viewers(
    client, other_client, third_client
):
    share(client, "public")
    workout = log_workout(client, "Leg day", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    for member, reaction in ((other_client, "love"), (third_client, "fire")):
        share(member, "public")
        assert member.put(url, json={"reaction": reaction}).status_code == 200
    other_client.put(url, json={"reaction": "strong"})
    people_url = url + "s"
    expected = {
        other_client.user["id"]: "strong",
        third_client.user["id"]: "fire",
    }
    for viewer in (client, other_client):
        response = viewer.get(people_url)
        assert response.status_code == 200
        page = response.json()
        assert page["total"] == 2 and page["next_offset"] is None
        assert {person["id"]: person["reaction"] for person in page["items"]} == expected
        assert set(page["items"][0]) == {"id", "display_name", "profile_photo_url", "reaction"}
    other_client.delete(url)
    assert client.get(people_url).json()["total"] == 1
    assert client.get(people_url + "?offset=-1").status_code == 422


def test_reaction_people_recheck_workout_access_and_allow_private_owners(client, other_client):
    share(client, "followers")
    workout = log_workout(client, "Private training", 0)
    people_url = f"/api/sharing/workouts/{workout['id']}/reactions"
    assert other_client.get(people_url).status_code == 403
    befriend(client, other_client)
    assert other_client.get(people_url).status_code == 200
    share(client, "private")
    assert other_client.get(people_url).status_code == 404
    assert client.get(people_url).json() == {"items": [], "total": 0, "next_offset": None}
    assert client.get("/api/sharing/workouts/missing/reactions").status_code == 404


def test_reaction_people_hide_blocked_and_disabled_members(client, other_client, third_client):
    from app.database import SessionLocal
    from app.models import User, utc_now

    share(client, "public")
    workout = log_workout(client, "Training", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    for member in (other_client, third_client):
        assert member.put(url, json={"reaction": "love"}).status_code == 200
    with SessionLocal() as db:
        db.get(User, third_client.user["id"]).disabled_at = utc_now()
        db.commit()
    assert client.get(url + "s").json()["total"] == 1
    assert client.post(f"/api/sharing/blocks/{other_client.user['id']}").status_code == 204
    assert client.get(url + "s").json() == {"items": [], "total": 0, "next_offset": None}


def test_reaction_people_paginate_with_a_stable_order(client):
    from conftest import make_user

    from app.database import SessionLocal
    from app.models import WorkoutReaction, utc_now

    workout = log_workout(client, "Training", 0)
    instant = utc_now()
    ids = [make_user(f"reactor-{index}") for index in range(32)]
    with SessionLocal() as db:
        db.add_all(
            [
                WorkoutReaction(
                    workout_id=workout["id"], user_id=member_id, reaction="clap", created_at=instant
                )
                for member_id in ids
            ]
        )
        db.commit()
    url = f"/api/sharing/workouts/{workout['id']}/reactions"
    first = client.get(url).json()
    assert first["total"] == 32 and first["next_offset"] == 30
    second = client.get(url + "?offset=30").json()
    assert second["next_offset"] is None
    assert [person["id"] for person in first["items"] + second["items"]] == sorted(ids)


@pytest.fixture
def third_client(client):
    third = TestClient(client.app)
    third.user = register_user(third, "third", "Third")
    yield third
    third.close()


def test_feed_shows_each_friends_latest_session(client, other_client, third_client):
    share(other_client, "public")
    share(third_client, "followers")
    for days_ago in range(4):
        log_workout(other_client, f"Other {days_ago}", days_ago * 2 + 1, notes="Private note")
        log_workout(third_client, f"Third {days_ago}", days_ago * 2)
    log_workout(client, "Mine", 0)

    # No friends yet; public profiles still need a friendship to appear.
    assert client.get("/api/sharing/feed").json() == {"items": [], "friends": 0, "with_sessions": 0}
    befriend(client, other_client)
    client.post(f"/api/sharing/friends/{third_client.user['id']}")
    # The request to Third is still waiting, so only Other appears.
    feed = client.get("/api/sharing/feed").json()
    assert [item["workout"]["name"] for item in feed["items"]] == ["Other 0"]
    assert feed["friends"] == 1

    third_client.post(f"/api/sharing/friends/{client.user['id']}/accept")
    feed = client.get("/api/sharing/feed").json()
    # One latest session per friend, most recent first.
    assert [item["workout"]["name"] for item in feed["items"]] == ["Third 0", "Other 0"]
    assert feed["friends"] == 2
    assert feed["with_sessions"] == 2
    limited = client.get("/api/sharing/feed?limit=1").json()
    assert len(limited["items"]) == 1 and limited["with_sessions"] == 2
    assert client.get("/api/sharing/feed?limit=0").status_code == 422
    assert client.get("/api/sharing/feed?limit=8").json() == feed
    other = feed["items"][1]
    assert other["friend"] == {
        "id": other_client.user["id"],
        "display_name": "Other",
        "profile_photo_url": None,
    }
    # Notes stay hidden unless the owner shares them.
    assert other["workout"]["notes"] is None
    assert other["reactions"] == {"counts": [], "yours": None, "comment_count": 0}


def test_feed_counts_friends_without_sessions_and_hides_private_ones(client, other_client):
    share(other_client, "public")
    befriend(client, other_client)
    assert client.get("/api/sharing/feed").json() == {"items": [], "friends": 1, "with_sessions": 0}
    log_workout(other_client, "First", 0)
    share(other_client, "private")
    assert client.get("/api/sharing/feed").json() == {"items": [], "friends": 0, "with_sessions": 0}


def test_friends_list_shows_latest_activity_for_every_friend(client, other_client, third_client):
    share(other_client, "public")
    share(third_client, "followers")
    for days_ago in (12, 5, 1):
        log_workout(other_client, f"Other {days_ago}", days_ago, notes="Private note")
    befriend(client, other_client)
    befriend(third_client, client)
    # Another account's workout and samples are not part of the activity.
    log_workout(client, "Mine", 0)

    friends = client.get("/api/sharing/friends").json()
    # Friends with a session come first, newest first; friends without one follow.
    assert [item["display_name"] for item in friends["friends"]] == ["Other", "Third"]
    other, third = friends["friends"]
    assert other["latest"]["workout"]["name"] == "Other 1"
    assert other["latest"]["workout"]["notes"] is None
    assert other["latest"]["reactions"] == {"counts": [], "yours": None, "comment_count": 0}
    assert other["recent_workout_count"] == 3
    assert other["training_dates"] == [
        (date.today() - timedelta(days=days)).isoformat() for days in (5, 1)
    ]
    assert third["latest"] is None and third["training_dates"] == []
    assert friends["requests"] == [] and friends["sent"] == []

    reaction_url = f"/api/sharing/workouts/{other['latest']['workout']['id']}/reaction"
    client.put(reaction_url, json={"reaction": "fire"})
    log_workout(third_client, "Third today", 0)
    friends = client.get("/api/sharing/friends").json()["friends"]
    assert [item["display_name"] for item in friends] == ["Third", "Other"]
    assert friends[1]["latest"]["reactions"]["yours"] == "fire"


def test_private_members_cannot_load_the_feed(client):
    share(client, "private")
    response = client.get("/api/sharing/feed")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "sharing_required"


def test_reactions_are_one_per_member_and_notify_the_owner(client, other_client, third_client):
    share(client, "public")
    workout = log_workout(client, "Leg day", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    for member in (other_client, third_client):
        befriend(member, client)

    assert other_client.put(url, json={"reaction": "fire"}).json() == {
        "counts": [{"reaction": "fire", "count": 1}],
        "yours": "fire",
        "comment_count": 0,
    }
    # Reacting again replaces the earlier reaction rather than adding another.
    other_client.put(url, json={"reaction": "strong"})
    assert third_client.put(url, json={"reaction": "fire"}).json() == {
        "counts": [{"reaction": "strong", "count": 1}, {"reaction": "fire", "count": 1}],
        "yours": "fire",
        "comment_count": 0,
    }
    feed = other_client.get("/api/sharing/feed").json()["items"]
    assert feed[0]["reactions"]["yours"] == "strong"

    notices = client.get("/api/sharing/notifications").json()["reactions"]
    assert [(item["display_name"], item["reaction"]) for item in notices] == [
        ("Third", "fire"),
        ("Other", "strong"),
    ]
    assert notices[0]["workout_name"] == "Leg day"
    assert other_client.get("/api/sharing/notifications").json()["reactions"] == []

    # Dismissing one notice leaves the other; a stale dismissal does not hide a new reaction.
    stale = notices[1]
    dismiss = f"/api/sharing/reactions/{workout['id']}/{other_client.user['id']}/dismiss"
    assert client.post(dismiss, json={"since": stale["since"]}).status_code == 204
    assert [
        item["display_name"]
        for item in client.get("/api/sharing/notifications").json()["reactions"]
        if not item["is_read"]
    ] == ["Third"]
    other_client.put(url, json={"reaction": "clap"})
    client.post(dismiss, json={"since": stale["since"]})
    assert len(client.get("/api/sharing/notifications").json()["reactions"]) == 2

    # Like and love are reactions too, listed before the others.
    other_client.put(url, json={"reaction": "love"})
    assert third_client.put(url, json={"reaction": "like"}).json() == {
        "counts": [{"reaction": "like", "count": 1}, {"reaction": "love", "count": 1}],
        "yours": "like",
        "comment_count": 0,
    }
    third_client.put(url, json={"reaction": "fire"})

    assert other_client.delete(url).json() == {
        "counts": [{"reaction": "fire", "count": 1}],
        "yours": None,
        "comment_count": 0,
    }
    assert len(client.get("/api/sharing/notifications").json()["reactions"]) == 1


def test_reactions_respect_profile_access(client, other_client):
    share(client, "followers")
    workout = log_workout(client, "Friends only", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"

    assert other_client.put(url, json={"reaction": "fire"}).status_code == 403
    assert other_client.put(url, json={"reaction": "wave"}).status_code == 422
    assert client.put(url, json={"reaction": "fire"}).status_code == 404
    assert (
        other_client.put(
            "/api/sharing/workouts/missing/reaction", json={"reaction": "fire"}
        ).status_code
        == 404
    )

    befriend(other_client, client)
    assert other_client.put(url, json={"reaction": "clap"}).status_code == 200
    # Deleting the workout removes its reactions and notifications.
    assert client.delete(f"/api/workouts/{workout['id']}").status_code == 204
    assert client.get("/api/sharing/notifications").json()["reactions"] == []


def test_shared_profile_totals_follow_access_and_ignore_history_filters(client, other_client):
    share(client, "followers")
    target = client.user["id"]
    workout = log_workout(client, "Training", 0)
    profile_url = f"/api/sharing/profiles/{target}"
    assert other_client.get(profile_url).json()["training_time"] is None
    other_client.post(f"/api/sharing/friends/{target}")
    assert other_client.get(profile_url).json()["training_time"] is None
    client.post(f"/api/sharing/friends/{other_client.user['id']}/accept")
    own = client.get("/api/training-time").json()
    assert other_client.get(profile_url).json()["training_time"] == own
    assert own["workout_count"] == 1
    reaction_url = f"/api/sharing/workouts/{workout['id']}/reaction"
    other_client.put(reaction_url, json={"reaction": "love"})
    page = other_client.get(profile_url + "/workouts").json()
    assert page["reactions"] == {
        workout["id"]: {
            "counts": [{"reaction": "love", "count": 1}],
            "yours": "love",
            "comment_count": 0,
        }
    }
    assert (
        other_client.get(profile_url + "/workouts", params={"category": "pull"}).json()["reactions"]
        == {}
    )
    assert other_client.get(profile_url).json()["training_time"] == own
    share(client, "private")
    assert other_client.get(profile_url).status_code == 404


def test_opening_notifications_reads_exact_events_and_keeps_requests_actionable(
    client, other_client, third_client
):
    share(client, "followers")
    target = client.user["id"]
    other_client.post(f"/api/sharing/friends/{target}")
    notice = client.get("/api/sharing/notifications").json()["requests"][0]
    reference = {"kind": "request", "id": notice["id"], "since": notice["since"]}
    assert (
        client.post("/api/sharing/notifications/read", json={"items": [reference]}).status_code
        == 204
    )
    requests = client.get("/api/sharing/notifications").json()["requests"]
    assert len(requests) == 1 and requests[0]["is_read"] is True
    assert other_client.get(f"/api/sharing/profiles/{target}").json()["can_view"] is False
    client.post(f"/api/sharing/friends/{other_client.user['id']}/accept")
    workout = log_workout(client, "Leg day", 0)
    reaction_url = f"/api/sharing/workouts/{workout['id']}/reaction"
    other_client.put(reaction_url, json={"reaction": "love"})
    notice = client.get("/api/sharing/notifications").json()["reactions"][0]
    reference = {
        "kind": "reaction",
        "id": notice["id"],
        "since": notice["since"],
        "workout_id": workout["id"],
    }
    # Another account cannot mark the workout owner's event read.
    third_client.post("/api/sharing/notifications/read", json={"items": [reference]})
    assert client.get("/api/sharing/notifications").json()["reactions"][0]["is_read"] is False
    client.post("/api/sharing/notifications/read", json={"items": [reference]})
    assert client.get("/api/sharing/notifications").json()["reactions"][0]["is_read"] is True
    other_client.put(reaction_url, json={"reaction": "fire"})
    client.post("/api/sharing/notifications/read", json={"items": [reference]})
    assert client.get("/api/sharing/notifications").json()["reactions"][0]["is_read"] is False
    # Accepted requests are read in the same bulk request as workout reactions.
    client.post(f"/api/sharing/friends/{third_client.user['id']}")
    third_client.post(f"/api/sharing/friends/{target}/accept")
    [accepted] = client.get("/api/sharing/notifications").json()["accepted"]
    assert accepted["id"] == third_client.user["id"] and accepted["is_read"] is False
    # The member who accepted cannot mark the requester's notice read.
    own = {"kind": "accepted", "id": target, "since": accepted["since"]}
    third_client.post("/api/sharing/notifications/read", json={"items": [own]})
    client.post(
        "/api/sharing/notifications/read",
        json={"items": [{"kind": "accepted", "id": accepted["id"], "since": accepted["since"]}]},
    )
    assert client.get("/api/sharing/notifications").json()["accepted"][0]["is_read"] is True
