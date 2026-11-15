from test_auth import named
from test_workout_reactions import log_workout


def create_custom(test_client, name: str = "Cable hip abduction") -> dict:
    response = test_client.post(
        "/api/exercises",
        json={"name": name, "category": "lower", "muscle_group": "Glutes", "equipment": "Cable"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def exercise(test_client, exercise_id: str) -> dict:
    return next(
        item for item in test_client.get("/api/exercises").json() if item["id"] == exercise_id
    )


def test_exercises_are_visible_until_hidden(client):
    assert not any(item["hidden"] for item in client.get("/api/exercises").json())


def test_rename_a_custom_exercise_keeps_its_history_and_records(client):
    custom = create_custom(client)
    workout = client.post(
        "/api/workouts",
        json={
            "name": "Glutes",
            "workout_date": "2026-11-10",
            "category": "lower",
            "movements": [
                {
                    "exercise_id": custom["id"],
                    "sets": [{"reps": 12, "weight_kg": 20, "completed": True}],
                }
            ],
        },
    ).json()
    revision = client.get("/api/workouts/revision").json()
    response = client.patch(f"/api/exercises/{custom['id']}", json={"name": "  Cable abduction  "})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Cable abduction"
    saved = client.get(f"/api/workouts/{workout['id']}").json()
    assert saved["movements"][0]["exercise"]["name"] == "Cable abduction"
    assert client.get("/api/workouts/revision").json() != revision


def test_rename_refuses_a_name_the_account_already_uses(client):
    custom = create_custom(client)
    create_custom(client, "Banded walk")
    for taken in ("Banded walk", "banded WALK", "Barbell Bench Press"):
        response = client.patch(f"/api/exercises/{custom['id']}", json={"name": taken})
        assert response.status_code == 409, taken
    assert exercise(client, custom["id"])["name"] == "Cable hip abduction"
    # Its own name, even with different spacing, is not a clash.
    assert (
        client.patch(
            f"/api/exercises/{custom['id']}", json={"name": "Cable hip abduction"}
        ).status_code
        == 200
    )


def test_built_in_exercises_cannot_be_renamed(client):
    bench = named(client, "Barbell Bench Press")
    response = client.patch(f"/api/exercises/{bench['id']}", json={"name": "Flat bench"})
    assert response.status_code == 422
    assert named(client, "Barbell Bench Press")["id"] == bench["id"]


def test_rename_rejects_a_blank_name(client):
    custom = create_custom(client)
    assert client.patch(f"/api/exercises/{custom['id']}", json={"name": "   "}).status_code == 422


def test_hide_and_show_any_exercise_without_touching_history(client):
    bench = named(client, "Barbell Bench Press")
    log_workout(client, "Push", 0)
    response = client.patch(f"/api/exercises/{bench['id']}", json={"hidden": True})
    assert response.status_code == 200, response.text
    assert response.json()["hidden"] is True
    assert exercise(client, bench["id"])["hidden"] is True
    workouts = client.get("/api/workouts").json()
    assert workouts[0]["movements"][0]["exercise"]["id"] == bench["id"]
    assert client.get(f"/api/progress/{bench['id']}").status_code == 200

    shown = client.patch(f"/api/exercises/{bench['id']}", json={"hidden": False})
    assert shown.json()["hidden"] is False
    assert exercise(client, bench["id"])["hidden"] is False


def test_hiding_twice_and_renaming_keep_each_other(client):
    custom = create_custom(client)
    for _ in range(2):
        client.patch(f"/api/exercises/{custom['id']}", json={"hidden": True})
    renamed = client.patch(f"/api/exercises/{custom['id']}", json={"name": "Abduction"}).json()
    assert renamed["hidden"] is True and renamed["name"] == "Abduction"


def test_hidden_exercises_are_per_account(client, other_client):
    bench = named(client, "Barbell Bench Press")
    client.patch(f"/api/exercises/{bench['id']}", json={"hidden": True})
    other_bench = named(other_client, "Barbell Bench Press")
    assert other_bench["hidden"] is False


def test_other_accounts_cannot_edit_an_exercise(client, other_client):
    custom = create_custom(client)
    for change in ({"name": "Taken over"}, {"hidden": True}):
        assert other_client.patch(f"/api/exercises/{custom['id']}", json=change).status_code == 404
    assert exercise(client, custom["id"])["name"] == "Cable hip abduction"
    assert exercise(client, custom["id"])["hidden"] is False
