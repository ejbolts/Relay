import pytest
from sqlalchemy import select
from test_sharing import EVERYTHING, add_training_history, befriend, share
from test_workout_reactions import log_workout

from app.database import SessionLocal
from app.models import Friendship


@pytest.mark.parametrize("visibility", ["public", "followers"])
def test_block_hides_every_shared_route_search_feed_and_notifications(
    client, other_client, visibility
):
    owner, other = client.user["id"], other_client.user["id"]
    history = add_training_history(client)
    share(client, visibility, **EVERYTHING)
    share(other_client, "public")
    other_workout = log_workout(other_client, "Other session", 0)
    befriend(client, other_client)
    other_client.put(
        f"/api/sharing/workouts/{history['workout']['id']}/reaction", json={"reaction": "love"}
    )
    client.put(f"/api/sharing/workouts/{other_workout['id']}/reaction", json={"reaction": "like"})
    profile = other_client.get(f"/api/sharing/profiles/{owner}").json()
    assert profile["training_time"] is not None and profile["body_weight"]
    assert other_client.get(profile["profile_photo_url"]).status_code == 200
    for suffix in ["/workouts", "/workout-filters"]:
        assert other_client.get(f"/api/sharing/profiles/{owner}{suffix}").status_code == 200
    assert (
        other_client.get(
            f"/api/sharing/profiles/{owner}/machine-photos/{history['photo']['id']}"
        ).status_code
        == 200
    )
    assert client.post(f"/api/sharing/blocks/{other}").status_code == 204
    assert client.post(f"/api/sharing/blocks/{other}").status_code == 204

    for viewer, target in [(other_client, owner), (client, other)]:
        assert viewer.get("/api/sharing/profiles", params={"q": target}).json() == []
        assert target not in [person["id"] for person in viewer.get("/api/sharing/profiles").json()]
        for suffix in ["", "/workouts", "/workout-filters", "/photo"]:
            assert viewer.get(f"/api/sharing/profiles/{target}{suffix}").status_code == 404
        assert viewer.post(f"/api/sharing/friends/{target}").status_code == 404
        assert viewer.post(f"/api/sharing/friends/{target}/accept").status_code == 404
        assert viewer.get("/api/sharing/feed").json() == {
            "items": [],
            "friends": 0,
            "with_sessions": 0,
        }
        connections = viewer.get("/api/sharing/friends").json()
        assert connections["friends"] == connections["requests"] == connections["sent"] == []
        assert viewer.get("/api/sharing/notifications").json() == {
            "requests": [],
            "accepted": [],
            "reactions": [],
            "comments": [],
        }
    assert other_client.get(profile["profile_photo_url"]).status_code == 404
    photo = f"/api/sharing/profiles/{owner}/machine-photos/{history['photo']['id']}"
    for variant in ["thumbnail", "full"]:
        assert other_client.get(photo, params={"variant": variant}).status_code == 404
    url = f"/api/sharing/workouts/{history['workout']['id']}/reaction"
    assert other_client.put(url, json={"reaction": "fire"}).status_code == 404
    assert other_client.delete(url).status_code == 404
    blocked = client.get("/api/sharing/friends").json()["blocked"]
    assert [person["id"] for person in blocked] == [other]
    assert other_client.get("/api/sharing/friends").json()["blocked"] == []
    # Going private and back to public never bypasses a stored block.
    share(client, "private")
    locked = client.get("/api/sharing/friends").json()
    assert locked["locked"] is True and locked["blocked"] == blocked
    share(client, "public")
    assert other_client.get(f"/api/sharing/profiles/{owner}").status_code == 404
    with SessionLocal() as db:
        assert list(db.scalars(select(Friendship))) == []


def test_unblock_is_owner_scoped_and_does_not_restore_old_friendships(client, other_client):
    owner, other = client.user["id"], other_client.user["id"]
    befriend(other_client, client)
    client.post(f"/api/sharing/blocks/{other}")
    # The blocked member cannot remove the other account's block.
    assert other_client.delete(f"/api/sharing/blocks/{owner}").status_code == 204
    assert other_client.get(f"/api/sharing/profiles/{owner}").status_code == 404
    assert client.delete(f"/api/sharing/blocks/{other}").status_code == 204
    assert client.delete(f"/api/sharing/blocks/{other}").status_code == 204
    assert other_client.get(f"/api/sharing/profiles/{owner}").json()["friend_status"] == "none"
    assert client.get("/api/sharing/friends").json()["blocked"] == []
    assert other_client.post(f"/api/sharing/friends/{owner}").status_code == 200
    assert client.post(f"/api/sharing/blocks/{owner}").status_code == 422
    assert client.post("/api/sharing/blocks/missing").status_code == 404


def test_each_account_controls_its_own_block(client, other_client):
    owner, other = client.user["id"], other_client.user["id"]
    client.post(f"/api/sharing/blocks/{other}")
    other_client.post(f"/api/sharing/blocks/{owner}")
    client.delete(f"/api/sharing/blocks/{other}")
    assert other_client.get(f"/api/sharing/profiles/{owner}").status_code == 404
    other_client.delete(f"/api/sharing/blocks/{owner}")
    assert other_client.get(f"/api/sharing/profiles/{owner}").status_code == 200


def test_block_filters_existing_cross_member_reactions_without_changing_other_accounts(
    client, other_client
):
    # A third member's workout is still visible, but reactions by blocked members are not.
    from conftest import register_user
    from fastapi.testclient import TestClient

    third = TestClient(client.app)
    third.user = register_user(third, "third", "Third")
    workout = log_workout(third, "Third session", 0)
    url = f"/api/sharing/workouts/{workout['id']}/reaction"
    client.put(url, json={"reaction": "love"})
    other_client.put(url, json={"reaction": "fire"})
    client.post(f"/api/sharing/blocks/{other_client.user['id']}")
    assert client.get(f"/api/sharing/profiles/{third.user['id']}/workouts").json()["reactions"][
        workout["id"]
    ]["counts"] == [{"reaction": "love", "count": 1}]
    assert len(third.get("/api/sharing/notifications").json()["reactions"]) == 2
    third.close()


def test_account_deletion_removes_blocks_in_both_directions(client, other_client):
    from conftest import TEST_PASSWORD

    from app.models import ProfileBlock

    client.post(f"/api/sharing/blocks/{other_client.user['id']}")
    other_client.post(f"/api/sharing/blocks/{client.user['id']}")
    response = other_client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert response.status_code == 204
    with SessionLocal() as db:
        assert list(db.scalars(select(ProfileBlock))) == []
    assert client.get("/api/sharing/friends").json()["blocked"] == []


def test_reacting_to_an_old_workout_never_pins_the_friend_above_newer_workouts(
    client, other_client
):
    from conftest import register_user
    from fastapi.testclient import TestClient

    third = TestClient(client.app)
    third.user = register_user(third, "third", "Third")
    older = log_workout(other_client, "Old reacted session", 0)
    befriend(client, other_client)
    befriend(client, third)
    client.put(f"/api/sharing/workouts/{older['id']}/reaction", json={"reaction": "love"})
    newest_third = log_workout(third, "Third latest", 0)
    assert [item["workout"]["id"] for item in client.get("/api/sharing/feed").json()["items"]] == [
        newest_third["id"],
        older["id"],
    ]
    newer = log_workout(other_client, "New session", 0)
    feed = client.get("/api/sharing/feed").json()["items"]
    assert [item["workout"]["id"] for item in feed] == [newer["id"], newest_third["id"]]
    assert feed[0]["reactions"] == {"counts": [], "yours": None, "comment_count": 0}
    third.close()
