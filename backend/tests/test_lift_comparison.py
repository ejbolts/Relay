import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from sqlalchemy import update
from test_auth import named
from test_personal_records import log
from test_sharing import befriend, share

from app.database import SessionLocal
from app.models import Exercise, TrainingWorkout

BENCH, SQUAT, ROW = "Barbell Bench Press", "Back Squat", "Barbell Row"


@pytest.fixture
def third_client(client):
    with TestClient(client.app) as third:
        third.user = register_user(third, "third", "Third")
        yield third


def lift(test_client: TestClient, name: str, sets: list[dict], day: str = "2026-01-01") -> dict:
    return log(test_client, named(test_client, name)["id"], sets, day)


def comparison(viewer: TestClient, owner: TestClient):
    return viewer.get(f"/api/sharing/profiles/{owner.user['id']}/lifts")


def leaderboard(viewer: TestClient, name: str = BENCH):
    return viewer.get(f"/api/sharing/lifts/{named(viewer, name)['id']}")


def test_head_to_head_compares_the_best_estimate_of_each_shared_lift(client, other_client):
    share(client)
    share(other_client)
    # 100 x 5 estimates 116.7, ahead of the heavier single; the later equal set does not replace it.
    lift(client, BENCH, [{"weight_kg": 105, "reps": 1}, {"weight_kg": 100, "reps": 5}])
    lift(client, BENCH, [{"weight_kg": 100, "reps": 5}], "2026-02-01")
    lift(client, SQUAT, [{"weight_kg": 140, "reps": 3}])
    lift(client, ROW, [{"weight_kg": 80, "reps": 8}])
    lift(other_client, BENCH, [{"weight_kg": 110, "reps": 3}], "2026-01-10")
    lift(other_client, SQUAT, [{"weight_kg": 120, "reps": 5}], "2026-01-11")

    response = comparison(client, other_client)
    assert response.status_code == 200, response.text
    lifts = response.json()["lifts"]
    # Heaviest lift first, and only the lifts both members have logged.
    assert [item["name"] for item in lifts] == [SQUAT, BENCH]
    squat, bench = lifts
    assert bench["muscle_group"] == "Chest"
    assert bench["yours"] == {
        "exercise_id": named(client, BENCH)["id"],
        "weight_kg": 100,
        "reps": 5,
        "estimated_1rm": 116.7,
        "achieved_date": "2026-01-01",
    }
    assert bench["theirs"] == {
        "exercise_id": named(other_client, BENCH)["id"],
        "weight_kg": 110,
        "reps": 3,
        "estimated_1rm": 121,
        "achieved_date": "2026-01-10",
    }
    assert (squat["yours"]["estimated_1rm"], squat["theirs"]["estimated_1rm"]) == (154, 140)

    # The other member sees the same lifts from their side.
    mirrored = comparison(other_client, client).json()["lifts"]
    assert [(item["yours"], item["theirs"]) for item in mirrored] == [
        (item["theirs"], item["yours"]) for item in lifts
    ]


def test_only_real_completed_working_sets_count(client, other_client):
    share(client)
    share(other_client)
    lift(other_client, BENCH, [{"weight_kg": 60, "reps": 10}])
    lift(
        client,
        BENCH,
        [
            {"weight_kg": 200, "reps": 5, "warmup": True},
            {"weight_kg": 190, "reps": 5, "set_type": "warmup"},
            {"weight_kg": 180, "reps": 5, "completed": False},
            {"weight_kg": 170, "reps": 2, "failed": True, "target_reps": 5},
            {"weight_kg": 160, "reps": 40},
            {"weight_kg": 0, "reps": 12},
            {"weight_kg": 50, "reps": 10},
        ],
    )
    sample = lift(client, BENCH, [{"weight_kg": 150, "reps": 5}], "2026-01-02")
    with SessionLocal() as db:
        db.execute(
            update(TrainingWorkout).where(TrainingWorkout.id == sample["id"]).values(is_sample=True)
        )
        db.commit()
    (bench,) = comparison(other_client, client).json()["lifts"]
    assert (bench["theirs"]["weight_kg"], bench["theirs"]["reps"]) == (50, 10)
    assert (bench["yours"]["weight_kg"], bench["yours"]["reps"]) == (60, 10)


def test_lifts_match_by_alias_and_by_name_whatever_its_case(client, other_client):
    share(client)
    share(other_client)
    custom = {"category": "pull", "muscle_group": "Lats", "equipment": "Cable"}
    mine = client.post("/api/exercises", json={"name": "Kneeling Pulldown", **custom}).json()
    theirs = other_client.post("/api/exercises", json={"name": "kneeling pulldown", **custom})
    log(client, mine["id"], [{"weight_kg": 60, "reps": 10}])
    log(other_client, theirs.json()["id"], [{"weight_kg": 55, "reps": 10}])
    # An imported history can name the bench press by one of its aliases.
    with SessionLocal() as db:
        db.execute(
            update(Exercise)
            .where(Exercise.id == named(other_client, BENCH)["id"])
            .values(name="Bench Press")
        )
        db.commit()
    lift(client, BENCH, [{"weight_kg": 100, "reps": 5}])
    lift(other_client, "Bench Press", [{"weight_kg": 90, "reps": 5}])
    lifts = comparison(client, other_client).json()["lifts"]
    assert [(item["name"], item["theirs"]["weight_kg"]) for item in lifts] == [
        (BENCH, 90),
        ("Kneeling Pulldown", 55),
    ]
    assert [
        entry["best"]["weight_kg"] for entry in leaderboard_after_befriending(client, other_client)
    ] == [100, 90]


def leaderboard_after_befriending(viewer: TestClient, friend: TestClient) -> list[dict]:
    befriend(viewer, friend)
    return leaderboard(viewer).json()["entries"]


def test_head_to_head_follows_profile_access(client, other_client):
    share(client)
    share(other_client, "followers")
    lift(client, BENCH, [{"weight_kg": 100, "reps": 5}])
    lift(other_client, BENCH, [{"weight_kg": 90, "reps": 5}])
    # A friends-only profile keeps its lifts from members who are not friends.
    refused = comparison(client, other_client)
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "friend_required"
    befriend(client, other_client)
    assert len(comparison(client, other_client).json()["lifts"]) == 1
    # Your own profile has nobody to compare with.
    assert comparison(client, client).json() == {"lifts": []}

    share(other_client, "private")
    assert comparison(client, other_client).status_code == 404
    share(other_client, "public")
    assert comparison(client, other_client).status_code == 200
    assert client.post(f"/api/sharing/blocks/{other_client.user['id']}").status_code == 204
    assert comparison(client, other_client).status_code == 404
    assert comparison(other_client, client).status_code == 404
    client.delete(f"/api/sharing/blocks/{other_client.user['id']}")
    share(client, "private")
    assert comparison(client, other_client).status_code == 403


def test_leaderboard_ranks_you_among_friends_who_logged_the_lift(
    client, other_client, third_client
):
    for member in (client, other_client, third_client):
        share(member)
    lift(client, BENCH, [{"weight_kg": 100, "reps": 5}])
    lift(other_client, BENCH, [{"weight_kg": 110, "reps": 3}], "2026-01-10")
    lift(third_client, BENCH, [{"weight_kg": 60, "reps": 10}])
    lift(other_client, SQUAT, [{"weight_kg": 120, "reps": 5}])

    # Public members who are not friends are not ranked.
    assert leaderboard(client).json() == {"entries": []}
    befriend(client, other_client)
    befriend(client, third_client)
    entries = leaderboard(client).json()["entries"]
    assert [(entry["member"]["display_name"], entry["is_you"]) for entry in entries] == [
        ("Other", False),
        ("Owner", True),
        ("Third", False),
    ]
    assert [entry["best"]["estimated_1rm"] for entry in entries] == [121, 116.7, 80]
    assert entries[0]["member"]["id"] == other_client.user["id"]
    assert entries[0]["best"]["exercise_id"] == named(other_client, BENCH)["id"]

    # A lift you have not logged still ranks the friends who have.
    squat = leaderboard(client, SQUAT).json()["entries"]
    assert [entry["member"]["display_name"] for entry in squat] == ["Other"]
    # A lift no friend has logged has no ranking.
    assert leaderboard(client, ROW).json() == {"entries": []}


def test_leaderboard_leaves_out_friends_you_can_no_longer_see(client, other_client, third_client):
    for member in (client, other_client, third_client):
        share(member)
        lift(member, BENCH, [{"weight_kg": 100, "reps": 5}])
    befriend(client, other_client)
    befriend(client, third_client)
    assert len(leaderboard(client).json()["entries"]) == 3

    share(other_client, "private")
    names = [entry["member"]["display_name"] for entry in leaderboard(client).json()["entries"]]
    assert names == ["Owner", "Third"]
    assert client.post(f"/api/sharing/blocks/{third_client.user['id']}").status_code == 204
    assert leaderboard(client).json() == {"entries": []}


def test_leaderboard_needs_your_own_exercise_and_a_shared_profile(client, other_client):
    share(client)
    share(other_client)
    befriend(client, other_client)
    lift(other_client, BENCH, [{"weight_kg": 100, "reps": 5}])
    theirs = named(other_client, BENCH)["id"]
    assert client.get(f"/api/sharing/lifts/{theirs}").status_code == 404
    assert client.get("/api/sharing/lifts/missing").status_code == 404
    share(client, "private")
    refused = leaderboard(client)
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "sharing_required"
