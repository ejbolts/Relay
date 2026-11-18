import pytest
from test_routines import create, payload
from test_sharing import befriend, share

OLD_APP = {"X-Relay-Version": "1.2.0"}
NEW_APP = {"X-Relay-Version": "1.3.0"}


def ranged(client, rep_range=None):
    data = payload(client, shared=True)
    data["days"][0]["movements"][0]["rep_range"] = rep_range or {"min": 8, "max": 12}
    return data


def first_movement(routine: dict) -> dict:
    return routine["days"][0]["movements"][0]


def test_planned_exercises_have_no_rep_range_until_one_is_set(client):
    assert first_movement(create(client))["rep_range"] is None


def test_rep_range_is_saved_listed_and_cleared(client):
    routine = create(client, ranged(client))
    assert first_movement(routine)["rep_range"] == {"min": 8, "max": 12}
    assert first_movement(client.get("/api/routines").json()[0])["rep_range"] == {
        "min": 8,
        "max": 12,
    }
    changed = client.put(
        f"/api/routines/{routine['id']}", json=ranged(client, {"min": 5, "max": 5})
    )
    assert first_movement(changed.json())["rep_range"] == {"min": 5, "max": 5}
    cleared = ranged(client)
    cleared["days"][0]["movements"][0]["rep_range"] = None
    response = client.put(f"/api/routines/{routine['id']}", json=cleared, headers=OLD_APP)
    # An explicit null clears the range whatever version the app reports.
    assert first_movement(response.json())["rep_range"] is None


@pytest.mark.parametrize(
    "rep_range", [{"min": 12, "max": 8}, {"min": 0, "max": 5}, {"min": 5, "max": 101}, {"min": 5}]
)
def test_invalid_rep_ranges_are_refused(client, rep_range):
    assert client.post("/api/routines", json=ranged(client, rep_range)).status_code == 422


def test_an_older_app_saving_a_split_keeps_its_rep_ranges(client):
    routine = create(client, ranged(client))
    without = payload(client, shared=True)
    without["name"] = "Renamed by an older app"
    response = client.put(f"/api/routines/{routine['id']}", json=without, headers=OLD_APP)
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Renamed by an older app"
    assert first_movement(response.json())["rep_range"] == {"min": 8, "max": 12}
    # No version header at all is an app from before versions were reported.
    again = client.put(f"/api/routines/{routine['id']}", json=without)
    assert first_movement(again.json())["rep_range"] == {"min": 8, "max": 12}


def test_an_older_app_does_not_carry_a_range_onto_a_different_exercise(client):
    routine = create(client, ranged(client))
    other = next(x for x in client.get("/api/exercises").json() if x["name"] == "Barbell Row")
    swapped = payload(client, shared=True)
    swapped["days"][0]["movements"][0]["exercise_id"] = other["id"]
    response = client.put(f"/api/routines/{routine['id']}", json=swapped, headers=OLD_APP)
    assert first_movement(response.json())["rep_range"] is None


def test_a_current_app_that_omits_the_range_clears_it(client):
    routine = create(client, ranged(client))
    response = client.put(
        f"/api/routines/{routine['id']}", json=payload(client, shared=True), headers=NEW_APP
    )
    assert first_movement(response.json())["rep_range"] is None


def test_copies_of_a_shared_split_keep_its_rep_ranges(client, other_client):
    share(client, "followers")
    befriend(client, other_client)
    routine = create(client, ranged(client))
    copied = other_client.post(f"/api/routines/profile/{client.user['id']}/{routine['id']}/copy")
    assert copied.status_code in (200, 201), copied.text
    assert first_movement(copied.json())["rep_range"] == {"min": 8, "max": 12}


def test_the_planned_day_offered_for_a_workout_carries_its_rep_range(client):
    routine = create(client, ranged(client))
    used = client.post(f"/api/routines/{routine['id']}/use", json={"start_date": "2026-11-01"})
    assert used.status_code == 200, used.text
    recommendation = client.get("/api/dashboard?on_date=2026-11-01").json()["recommendation"]
    assert [item["rep_range"] for item in recommendation["routine_day"]["movements"]] == [
        {"min": 8, "max": 12}
    ]


def test_workout_type_exercises_keep_rep_ranges_from_older_apps(client):
    bench = next(
        x for x in client.get("/api/exercises").json() if x["name"] == "Barbell Bench Press"
    )
    movement = {"exercise_id": bench["id"], "sets": [{"set_type": "normal"}]}
    saved = client.put(
        "/api/workout-type-exercises/push",
        json={"movements": [{**movement, "rep_range": {"min": 6, "max": 10}}]},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["movements"][0]["rep_range"] == {"min": 6, "max": 10}
    older = client.put(
        "/api/workout-type-exercises/push", json={"movements": [movement]}, headers=OLD_APP
    )
    assert older.json()["movements"][0]["rep_range"] == {"min": 6, "max": 10}
    listed = client.get("/api/workout-type-exercises").json()
    assert listed[0]["movements"][0]["rep_range"] == {"min": 6, "max": 10}
    cleared = client.put(
        "/api/workout-type-exercises/push",
        json={"movements": [{**movement, "rep_range": None}]},
        headers=OLD_APP,
    )
    assert cleared.json()["movements"][0]["rep_range"] is None
