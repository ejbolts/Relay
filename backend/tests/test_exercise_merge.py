from copy import deepcopy

import pytest
from test_exercise_creation import exercise_payload
from test_routines import payload as routine_payload
from test_tracker import upload_machine_photo, workout_payload

from app.database import SessionLocal
from app.models import CardioSession, UserSetting


def custom(client, name="My cable press", **changes):
    response = client.post("/api/exercises", json=exercise_payload(name=name, **changes))
    assert response.status_code == 201, response.text
    return response.json()


def official(client, name="Barbell Bench Press"):
    return next(x for x in client.get("/api/exercises").json() if x["name"] == name)


def merge(client, source, target):
    return client.post(
        f"/api/exercises/{source['id']}/merge", json={"target_exercise_id": target["id"]}
    )


def test_merge_preserves_workout_rows_photos_settings_splits_and_old_drafts(client, other_client):
    source, target = custom(client), official(client)
    other_before = other_client.get("/api/exercises").json()
    client.patch(f"/api/exercises/{source['id']}/favorite", json={"is_favorite": True})
    photo = upload_machine_photo(client, source["id"], "Sample cable machine", "blue")
    original_image = client.get(photo["full_url"]).content
    photo_settings = {"settings": [{"name": "Seat", "value": "5"}]}
    client.put(
        f"/api/exercises/{source['id']}/machine-settings",
        params={"machine_photo_id": photo["id"]},
        json=photo_settings,
    )
    data = workout_payload(source["id"])
    data["movements"][0]["machine_photo_ids"] = [photo["id"]]
    data["movements"][0]["machine_settings"] = [{"name": "Seat", "value": "3"}]
    data["movements"].append(
        {**deepcopy(data["movements"][0]), "exercise_id": target["id"], "machine_photo_ids": []}
    )
    saved = client.post("/api/workouts", json=data).json()
    routine = routine_payload(client)
    routine["days"][0]["movements"][0]["exercise_id"] = source["id"]
    split = client.post("/api/routines", json=routine).json()
    revision = client.get("/api/workouts/revision").json()
    response = merge(client, source, target)
    assert response.status_code == 200, response.text
    assert response.json()["id"] == target["id"]
    assert response.json()["is_favorite"] is True
    assert response.json()["is_custom"] is False
    assert response.json()["muscle_set_credits"] == target["muscle_set_credits"]
    assert client.get("/api/workouts/revision").json() != revision
    library = client.get("/api/exercises").json()
    assert source["id"] not in {x["id"] for x in library}
    assert next(x for x in library if x["id"] == target["id"])["merged_from_ids"] == [source["id"]]
    after = client.get(f"/api/workouts/{saved['id']}").json()
    assert len(after["movements"]) == 2
    for before, movement in zip(saved["movements"], after["movements"], strict=True):
        assert movement["exercise"]["id"] == target["id"]
        assert movement["id"] == before["id"]
        assert movement["sets"] == before["sets"]
        assert movement["notes"] == before["notes"]
        assert movement["machine_settings"] == before["machine_settings"]
    assert after["movements"][0]["machine_photos"][0]["id"] == photo["id"]
    assert client.get(photo["full_url"]).content == original_image
    assert (
        client.get(
            f"/api/exercises/{target['id']}/machine-settings",
            params={"machine_photo_id": photo["id"]},
        ).json()
        == photo_settings
    )
    updated_split = next(x for x in client.get("/api/routines").json() if x["id"] == split["id"])
    assert updated_split["days"][0]["movements"][0]["exercise_id"] == target["id"]
    # A stale split editor and an offline workout still resolve the old ID.
    assert client.put(f"/api/routines/{split['id']}", json=routine).status_code == 200
    old_draft = client.post("/api/workouts", json={**data, "movements": data["movements"][:1]})
    assert old_draft.status_code == 201, old_draft.text
    assert old_draft.json()["movements"][0]["exercise"]["id"] == target["id"]
    assert other_client.get("/api/exercises").json() == other_before
    assert other_client.post("/api/workouts", json=workout_payload(source["id"])).status_code == 422


def test_custom_to_custom_and_repeated_merges_flatten_redirects(client):
    first, second, target = custom(client, "First"), custom(client, "Second"), official(client)
    assert merge(client, first, second).status_code == 200
    assert merge(client, second, target).status_code == 200
    result = next(x for x in client.get("/api/exercises").json() if x["id"] == target["id"])
    assert set(result["merged_from_ids"]) == {first["id"], second["id"]}
    for old in (first, second):
        saved = client.post("/api/workouts", json=workout_payload(old["id"]))
        assert saved.status_code == 201, saved.text
        assert saved.json()["movements"][0]["exercise"]["id"] == target["id"]
    favorite = client.patch(f"/api/exercises/{target['id']}/favorite", json={"is_favorite": True})
    assert set(favorite.json()["merged_from_ids"]) == {first["id"], second["id"]}
    partial = client.patch(
        f"/api/exercises/{target['id']}/partial-sets", json={"partial_sets_enabled": False}
    )
    assert set(partial.json()["merged_from_ids"]) == {first["id"], second["id"]}


def test_records_are_recalculated_against_the_combined_history(client):
    source, target = custom(client), official(client)
    for item, day, weights in (
        (target, "2026-10-01", [100, 110]),
        (source, "2026-10-02", [80, 90]),
    ):
        data = workout_payload(item["id"])
        data["workout_date"] = day
        for row, weight in zip(data["movements"][0]["sets"], weights, strict=True):
            row["weight_kg"] = weight
        assert client.post("/api/workouts", json=data).status_code == 201
    before = client.get("/api/personal-records").json()
    assert any(x["exercise_id"] == source["id"] for x in before)
    assert merge(client, source, target).status_code == 200
    after = client.get("/api/personal-records").json()
    assert after
    assert all(x["exercise_id"] == target["id"] for x in after)
    assert not any(x["record_type"] == "weight" and x["value"] == 90 for x in after)


@pytest.mark.parametrize(
    "case, status",
    [
        ("official", 422),
        ("self", 422),
        ("kind", 422),
        ("foreign_source", 404),
        ("foreign_target", 404),
        ("missing", 404),
    ],
)
def test_invalid_merges_are_atomic_and_account_scoped(client, other_client, case, status):
    source, target = custom(client), official(client)
    if case == "official":
        source = official(client, "Pec Deck")
    elif case == "self":
        target = source
    elif case == "kind":
        target = official(client, "Running")
    elif case == "foreign_source":
        source = custom(other_client)
    elif case == "foreign_target":
        target = official(other_client)
    elif case == "missing":
        target = {"id": "missing"}
    before = client.get("/api/exercises").json()
    revision = client.get("/api/workouts/revision").json()
    response = merge(client, source, target)
    assert response.status_code == status, response.text
    assert client.get("/api/exercises").json() == before
    assert client.get("/api/workouts/revision").json() == revision


def test_cardio_merge_preserves_metrics_and_updates_activity(client):
    source = custom(client, "My run", kind="cardio", category="cardio")
    target = official(client, "Running")
    response = client.post(
        "/api/cardio",
        json={
            "activity_type": "My run",
            "exercise_id": source["id"],
            "session_date": "2026-11-01",
            "duration_minutes": 30,
            "distance_km": 5,
            "calories_kcal": 250,
            "average_heart_rate_bpm": 130,
        },
    )
    assert response.status_code == 201, response.text
    assert merge(client, source, target).status_code == 200
    sessions = client.get("/api/cardio").json()["sessions"]
    saved = next(x for x in sessions if x["id"] == response.json()["id"])
    with SessionLocal() as db:
        assert db.get(CardioSession, saved["id"]).source_exercise_id == target["id"]
    assert saved["activity_type"] == target["name"]
    assert saved["distance_km"] == 5
    assert saved["calories_kcal"] == 250


def test_destination_defaults_win_and_source_photo_settings_move(client):
    source, target = custom(client), official(client)
    for item, seat in ((source, "4"), (target, "9")):
        client.put(
            f"/api/exercises/{item['id']}/machine-settings",
            json={"settings": [{"name": "Seat", "value": seat}]},
        )
    with SessionLocal() as db:
        for item in (source, target):
            db.add(
                UserSetting(
                    user_id=client.user["id"],
                    key=f"weight_mapping:{item['id']}",
                    value='{"enabled": false, "machines": {}}',
                )
            )
        db.commit()
    assert merge(client, source, target).status_code == 200
    settings = client.get(f"/api/exercises/{target['id']}/machine-settings").json()
    assert settings["settings"] == [{"name": "Seat", "value": "9"}]
    with SessionLocal() as db:
        assert db.get(UserSetting, (client.user["id"], f"machine_settings:{source['id']}")) is None


def test_failure_rolls_back_transfers_and_redirects(client, monkeypatch):
    source, target = custom(client), official(client)
    payload = workout_payload(source["id"])
    saved = client.post("/api/workouts", json=payload).json()
    saved = client.get(f"/api/workouts/{saved['id']}").json()
    revision = client.get("/api/workouts/revision").json()

    def fail(*args):
        raise RuntimeError("Simulated recalculation failure")

    monkeypatch.setattr("app.exercise_merge.rebuild_personal_records", fail)
    with pytest.raises(RuntimeError, match="Simulated"):
        merge(client, source, target)
    assert client.get(f"/api/workouts/{saved['id']}").json() == saved
    assert source in client.get("/api/exercises").json()
    assert client.get("/api/workouts/revision").json() == revision


def test_source_defaults_move_when_destination_has_none(client):
    source, target = custom(client), official(client)
    value = {"settings": [{"name": "Seat", "value": "4"}]}
    client.put(f"/api/exercises/{source['id']}/machine-settings", json=value)
    mapping = '{"enabled": false, "machines": {}}'
    with SessionLocal() as db:
        db.add(
            UserSetting(
                user_id=client.user["id"], key=f"weight_mapping:{source['id']}", value=mapping
            )
        )
        db.commit()
    assert merge(client, source, target).status_code == 200
    assert client.get(f"/api/exercises/{target['id']}/machine-settings").json() == value
    with SessionLocal() as db:
        assert (
            db.get(UserSetting, (client.user["id"], f"weight_mapping:{target['id']}")).value
            == mapping
        )
