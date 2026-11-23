"""Mixed split days: one day of the cycle that plans more than one workout type."""

import pytest
from test_routines import create, payload
from test_sharing import befriend, share
from test_training_split import (
    log_workout,
    missed_days,
    recommended,
    split_payload,
    up_next,
)


def mixed(*types):
    """A split day of ``types``: the first is the main type, the rest its extra types."""
    return {"workout_type_id": types[0], "extra_workout_type_ids": list(types[1:])}


def save_mixed(client, *days, **overrides):
    data = split_payload(**overrides)
    data["steps"] = [mixed(*day) if isinstance(day, tuple) else mixed(day) for day in days]
    response = client.put("/api/training-split", json=data)
    assert response.status_code == 200, response.text
    return response.json()


def test_a_mixed_day_round_trips_and_up_next_names_every_type(client):
    saved = save_mixed(client, ("upper", "cardio"), ("lower",), (None,))
    assert saved["steps"][0] == mixed("upper", "cardio")
    assert saved["steps"][1] == mixed("lower")
    item = recommended(client)
    # Older apps still see the main type; the workout starts as it.
    assert item["workout_type"]["id"] == "upper"
    assert [extra["id"] for extra in item["extra_workout_types"]] == ["cardio"]
    assert item["session_name"] == "Upper body workout"


@pytest.mark.parametrize(
    "step",
    [
        mixed(None, "cardio"),
        mixed("upper", "upper"),
        mixed("upper", "cardio", "cardio"),
        mixed("upper", "lower", "push", "pull", "cardio"),
        mixed("upper", "no-such-type"),
    ],
)
def test_invalid_mixed_days_are_rejected(client, step):
    data = split_payload("lower")
    data["steps"].append(step)
    assert client.put("/api/training-split", json=data).status_code == 422
    assert client.get("/api/training-split").json() is None


def test_any_type_of_a_followed_mixed_day_completes_it_once(client):
    save_mixed(client, ("upper", "cardio"), ("cardio",), ("lower",), progression="workouts")
    log_workout(client, "2026-10-26", "upper")
    # Cardio later the same day is part of the mixed day, not the next day's cardio.
    log_workout(client, "2026-10-26", "cardio")
    assert up_next(client, "2026-10-27") == "cardio"
    log_workout(client, "2026-10-27", "cardio")
    assert up_next(client, "2026-10-28") == "lower"
    log_workout(client, "2026-10-28", "lower")
    # Cardio alone does the mixed day too.
    log_workout(client, "2026-10-29", "cardio")
    assert up_next(client, "2026-10-30") == "cardio"


def test_mixed_days_are_missed_with_every_type_only_when_none_was_logged(client):
    save_mixed(client, ("upper", "cardio"), ("lower", "cardio"))
    log_workout(client, "2026-10-26", "cardio")
    split = client.get("/api/training-split", params={"on_date": "2026-10-28"}).json()
    assert split["missed_days"] == [
        {
            "workout_date": "2026-10-27",
            "workout_type_id": "lower",
            "workout_type_ids": ["lower", "cardio"],
        }
    ]
    assert missed_days(client, "2026-10-28") == [("2026-10-27", "lower")]


def test_an_archived_extra_type_asks_for_a_split_update(client):
    save_mixed(client, ("upper", "cardio"), ("lower",))
    assert client.delete("/api/workout-types/cardio").status_code == 204
    item = recommended(client)
    assert item["needs_split_update"] is True
    assert item["extra_workout_types"] == []


def test_older_apps_keep_mixed_days_they_cannot_see(client):
    save_mixed(client, ("upper", "cardio"), ("lower",))
    older = split_payload("upper", "lower", name="Renamed")
    response = client.put("/api/training-split", json=older, headers={"X-Relay-Version": "1.3.2"})
    assert response.status_code == 200, response.text
    assert response.json()["steps"][0] == mixed("upper", "cardio")
    # A changed main type, or an app that sends the field, decides for itself.
    older["steps"][0]["workout_type_id"] = "push"
    response = client.put("/api/training-split", json=older, headers={"X-Relay-Version": "1.3.2"})
    assert response.json()["steps"][0] == mixed("push")
    save_mixed(client, ("upper", "cardio"), ("lower",))
    data = split_payload("upper", "lower")
    data["steps"][0]["extra_workout_type_ids"] = []
    response = client.put("/api/training-split", json=data, headers={"X-Relay-Version": "1.3.2"})
    assert response.json()["steps"][0] == mixed("upper")


def test_routines_schedule_mixed_days_and_keep_them_for_older_apps(client):
    data = payload(client)
    data["days"][0]["extra_workout_type_ids"] = ["cardio"]
    data["schedule"] = {"start_date": "2026-10-26", "progression": "calendar"}
    routine = create(client, data)
    assert routine["days"][0]["extra_workout_type_ids"] == ["cardio"]
    assert [item["id"] for item in routine["days"][0]["extra_workout_types"]] == ["cardio"]
    split = client.get("/api/training-split").json()
    assert split["steps"][0] == mixed("upper", "cardio")
    assert recommended(client)["routine_day"]["extra_workout_type_ids"] == ["cardio"]

    older = payload(client)
    response = client.put(
        f"/api/routines/{routine['id']}", json=older, headers={"X-Relay-Version": "1.3.2"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["days"][0]["extra_workout_type_ids"] == ["cardio"]
    assert client.get("/api/training-split").json()["steps"][0] == mixed("upper", "cardio")

    captured = client.post("/api/routines/from-split")
    assert captured.status_code == 201, captured.text
    assert captured.json()["days"][0]["extra_workout_type_ids"] == ["cardio"]

    bad = payload(client)
    bad["days"][1]["extra_workout_type_ids"] = ["cardio"]
    assert client.post("/api/routines", json=bad).status_code == 422


def test_copying_a_friends_mixed_day_maps_every_type(client, other_client):
    befriend(client, other_client)
    share(client)
    custom = client.post("/api/workout-types", json={"name": "Mobility", "color": "#123456"}).json()
    data = payload(client, shared=True)
    data["days"][0]["extra_workout_type_ids"] = [custom["id"], "cardio"]
    original = create(client, data)
    response = other_client.post(f"/api/routines/profile/{client.user['id']}/{original['id']}/copy")
    assert response.status_code == 201, response.text
    day = response.json()["days"][0]
    assert day["extra_workout_type_ids"][1] == "cardio"
    assert day["extra_workout_type_ids"][0] != custom["id"]
    assert [item["name"] for item in day["extra_workout_types"]] == ["Mobility", "Cardio"]
