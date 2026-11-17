import pytest
from conftest import register_user
from fastapi.testclient import TestClient
from sqlalchemy import update
from test_auth import named
from test_exercise_merge import custom, merge
from test_personal_records import log
from test_sharing import befriend, share
from test_tracker import upload_machine_photo

from app.database import SessionLocal
from app.models import Exercise, TrainingWorkout

BENCH, SQUAT, ROW = "Barbell Bench Press", "Back Squat", "Barbell Row"
PULLDOWN = "Lat Pulldown"


@pytest.fixture
def third_client(client):
    with TestClient(client.app) as third:
        third.user = register_user(third, "third", "Third")
        yield third


def lift(test_client: TestClient, name: str, sets: list[dict], day: str = "2026-01-01") -> dict:
    return log(test_client, named(test_client, name)["id"], sets, day)


def lift_on(test_client: TestClient, name: str, machine: dict, weight: float, reps: int) -> dict:
    """One set of a lift on a saved machine."""
    response = test_client.post(
        "/api/workouts",
        json={
            "name": "Machine day",
            "workout_date": "2026-01-01",
            "category": "pull",
            "movements": [
                {
                    "exercise_id": named(test_client, name)["id"],
                    "machine_photo_ids": [machine["id"]],
                    "sets": [{"weight_kg": weight, "reps": reps}],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def comparison(viewer: TestClient, owner: TestClient):
    return viewer.get(f"/api/sharing/profiles/{owner.user['id']}/lifts")


def logged(viewer: TestClient, owner: TestClient) -> list[dict]:
    """The viewer's exercises that both members have logged."""
    return [item for item in comparison(viewer, owner).json()["lifts"] if both(item)]


def both(item: dict) -> bool:
    return item["yours"] is not None and item["theirs"] is not None


def choose(viewer: TestClient, *names: str):
    return viewer.put(
        "/api/sharing/lifts", json={"exercise_ids": [named(viewer, name)["id"] for name in names]}
    )


def leaderboard(viewer: TestClient, name: str = BENCH):
    return viewer.get(f"/api/sharing/lifts/{named(viewer, name)['id']}")


def test_head_to_head_compares_the_best_estimate_of_each_lift(client, other_client):
    share(client)
    share(other_client)
    # 100 x 5 estimates 116.7, ahead of the heavier single; the later equal set does not replace it.
    lift(client, BENCH, [{"weight_kg": 105, "reps": 1}, {"weight_kg": 100, "reps": 5}])
    lift(client, BENCH, [{"weight_kg": 100, "reps": 5}], "2026-02-01")
    lift(client, SQUAT, [{"weight_kg": 140, "reps": 3}])
    lift(client, ROW, [{"weight_kg": 80, "reps": 8}])
    lift(other_client, BENCH, [{"weight_kg": 110, "reps": 3}], "2026-01-10")
    lift(other_client, SQUAT, [{"weight_kg": 120, "reps": 5}], "2026-01-11")
    lift(other_client, PULLDOWN, [{"weight_kg": 70, "reps": 8}])

    response = comparison(client, other_client)
    assert response.status_code == 200, response.text
    lifts = {item["name"]: item for item in response.json()["lifts"]}
    bench = lifts[BENCH]
    assert bench["exercise_id"] == named(client, BENCH)["id"]
    assert (bench["muscle_group"], bench["equipment"]) == ("Chest", "Barbell")
    assert bench["yours"] == {
        "exercise_id": named(client, BENCH)["id"],
        "weight_kg": 100,
        "reps": 5,
        "estimated_1rm": 116.7,
        "achieved_date": "2026-01-01",
        "normalised": False,
    }
    assert bench["theirs"] == {
        "exercise_id": named(other_client, BENCH)["id"],
        "weight_kg": 110,
        "reps": 3,
        "estimated_1rm": 121,
        "achieved_date": "2026-01-10",
        "normalised": False,
    }
    squat = lifts[SQUAT]
    assert (squat["yours"]["estimated_1rm"], squat["theirs"]["estimated_1rm"]) == (154, 140)
    # A lift only one member has logged still shows that member's best.
    assert lifts[ROW]["yours"]["weight_kg"] == 80 and lifts[ROW]["theirs"] is None
    assert lifts[PULLDOWN]["yours"] is None and lifts[PULLDOWN]["theirs"]["weight_kg"] == 70

    # The other member sees the same lifts from their side.
    mirrored = {item["name"]: item for item in comparison(other_client, client).json()["lifts"]}
    for name in (BENCH, SQUAT, ROW, PULLDOWN):
        assert mirrored[name]["yours"] == lifts[name]["theirs"]
        assert mirrored[name]["theirs"] == lifts[name]["yours"]


def test_every_strength_exercise_you_show_can_be_chosen(client, other_client):
    share(client)
    share(other_client)
    lifts = comparison(client, other_client).json()["lifts"]
    names = [item["name"] for item in lifts]
    strength = [item for item in client.get("/api/exercises").json() if item["kind"] == "strength"]
    assert names == sorted(item["name"] for item in strength)
    assert "Running" not in names
    assert all(item["yours"] is None and item["theirs"] is None for item in lifts)

    # A hidden exercise leaves the list unless it is already chosen.
    row = named(client, ROW)
    assert choose(client, BENCH, ROW).status_code == 200
    for exercise_id in (row["id"], named(client, SQUAT)["id"]):
        assert client.patch(f"/api/exercises/{exercise_id}", json={"hidden": True}).is_success
    names = [item["name"] for item in comparison(client, other_client).json()["lifts"]]
    assert ROW in names and SQUAT not in names


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
    (bench,) = logged(other_client, client)
    assert (bench["theirs"]["weight_kg"], bench["theirs"]["reps"]) == (50, 10)
    assert (bench["yours"]["weight_kg"], bench["yours"]["reps"]) == (60, 10)


def test_lifts_match_by_alias_and_by_name_whatever_its_case(client, other_client):
    share(client)
    share(other_client)
    kneeling = {"category": "pull", "muscle_group": "Lats", "equipment": "Cable"}
    mine = client.post("/api/exercises", json={"name": "Kneeling Pulldown", **kneeling}).json()
    theirs = other_client.post("/api/exercises", json={"name": "kneeling pulldown", **kneeling})
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
    assert [
        (item["name"], item["theirs"]["weight_kg"]) for item in logged(client, other_client)
    ] == [
        (BENCH, 90),
        ("Kneeling Pulldown", 55),
    ]
    befriend(client, other_client)
    entries = leaderboard(client).json()["entries"]
    assert [entry["best"]["weight_kg"] for entry in entries] == [100, 90]


def test_each_member_is_compared_in_their_own_normalised_machine_weights(client, other_client):
    share(client)
    share(other_client)
    befriend(client, other_client)
    # You have one pulldown machine; they have two and normalise them to their home machine.
    mine = upload_machine_photo(client, named(client, PULLDOWN)["id"], "Only machine", "#336699")
    lift_on(client, PULLDOWN, mine, 80, 10)
    exercise = named(other_client, PULLDOWN)["id"]
    home = upload_machine_photo(other_client, exercise, "Home", "#e86f35")
    travel = upload_machine_photo(other_client, exercise, "Travel", "#293d6b")
    lift_on(other_client, PULLDOWN, home, 60, 10)
    lift_on(other_client, PULLDOWN, travel, 100, 10)

    def pulldown(viewer: TestClient, owner: TestClient) -> dict:
        return next(item for item in logged(viewer, owner) if item["name"] == PULLDOWN)

    raw = pulldown(client, other_client)
    assert (raw["theirs"]["weight_kg"], raw["theirs"]["normalised"]) == (100, False)

    mapping = {
        "enabled": True,
        "reference_machine_id": home["id"],
        "machines": [{"id": travel["id"], "machine_kg": 100, "reference_kg": 50}],
    }
    path = f"/api/exercises/{exercise}/weight-mapping"
    assert other_client.put(path, json=mapping).status_code == 200
    compared = pulldown(client, other_client)
    # Their travel set now reads as 50 kg, so the 60 kg set on the home machine is their best.
    assert compared["theirs"] == {
        "exercise_id": exercise,
        "weight_kg": 60,
        "reps": 10,
        "estimated_1rm": 80,
        "achieved_date": "2026-01-01",
        "normalised": True,
    }
    # Your own lift has no normalising, so it stays as logged.
    assert (compared["yours"]["weight_kg"], compared["yours"]["normalised"]) == (80, False)
    # They see the same figures from their side, and so does the exercise's friends ranking.
    mirrored = pulldown(other_client, client)
    assert (mirrored["yours"], mirrored["theirs"]) == (compared["theirs"], compared["yours"])
    entries = leaderboard(client, PULLDOWN).json()["entries"]
    assert [(entry["is_you"], entry["best"]["estimated_1rm"]) for entry in entries] == [
        (True, 106.7),
        (False, 80),
    ]

    # A converted set can still be the best one.
    lift_on(other_client, PULLDOWN, travel, 140, 10)
    best = pulldown(client, other_client)["theirs"]
    assert (best["weight_kg"], best["estimated_1rm"], best["normalised"]) == (70, 93.3, True)
    assert other_client.put(path, json={**mapping, "enabled": False}).status_code == 200
    assert pulldown(client, other_client)["theirs"]["weight_kg"] == 140


def test_chosen_lifts_are_saved_once_and_shown_for_every_member(client, other_client, third_client):
    for member in (client, other_client, third_client):
        share(member)
    assert comparison(client, other_client).json()["selected"] == []

    saved = choose(client, SQUAT, BENCH, SQUAT)
    assert saved.status_code == 200, saved.text
    chosen = [named(client, SQUAT)["id"], named(client, BENCH)["id"]]
    # In the order added, without repeats, and the same whoever you compare with.
    assert saved.json() == {"exercise_ids": chosen}
    assert comparison(client, other_client).json()["selected"] == chosen
    assert comparison(client, third_client).json()["selected"] == chosen
    # The choice belongs to the account that made it.
    assert comparison(other_client, client).json()["selected"] == []

    assert choose(client, BENCH).json() == {"exercise_ids": chosen[1:]}
    assert choose(client).json() == {"exercise_ids": []}
    assert comparison(client, other_client).json()["selected"] == []


def test_only_your_own_strength_exercises_can_be_chosen(client, other_client):
    share(client)
    share(other_client)
    assert choose(client, BENCH).status_code == 200
    for exercise_id in (
        named(other_client, BENCH)["id"],
        named(client, "Running")["id"],
        "missing",
    ):
        refused = client.put("/api/sharing/lifts", json={"exercise_ids": [exercise_id]})
        assert refused.status_code == 422
        assert refused.json()["error"]["code"] == "exercise_not_found"
    strength = [item["exercise_id"] for item in comparison(client, other_client).json()["lifts"]]
    assert client.put("/api/sharing/lifts", json={"exercise_ids": strength[:20]}).is_success
    assert client.put("/api/sharing/lifts", json={"exercise_ids": strength[:21]}).status_code == 422
    assert comparison(client, other_client).json()["selected"] == strength[:20]


def test_a_chosen_lift_follows_an_exercise_merge(client, other_client):
    share(client)
    share(other_client)
    source = custom(client)
    target = named(client, BENCH)
    saved = client.put("/api/sharing/lifts", json={"exercise_ids": [source["id"], target["id"]]})
    assert saved.status_code == 200
    assert merge(client, source, target).status_code == 200
    assert comparison(client, other_client).json()["selected"] == [target["id"]]


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
    assert len(logged(client, other_client)) == 1
    # Your own profile has nobody to compare with.
    assert comparison(client, client).json() == {"selected": [], "lifts": []}

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
