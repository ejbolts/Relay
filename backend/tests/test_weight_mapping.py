from datetime import date, timedelta

from test_machine_photo_merge import merge
from test_tracker import upload_machine_photo, workout_payload

from app.training_metrics import estimated_one_rep_max


def leg_press(client) -> str:
    return next(
        item for item in client.get("/api/exercises").json() if item["name"] == "Leg Press"
    )["id"]


def log(client, exercise: str, days_ago: int, photo_ids: list[str], weight: float) -> dict:
    payload = workout_payload(exercise)
    payload["workout_date"] = (date.today() - timedelta(days=days_ago)).isoformat()
    payload["movements"][0]["machine_photo_ids"] = photo_ids
    for item in payload["movements"][0]["sets"]:
        item["weight_kg"] = weight
    response = client.post("/api/workouts", json=payload)
    assert response.status_code == 201
    return response.json()


def test_mapping_round_trip_validation_and_account_isolation(client, other_client):
    exercise = leg_press(client)
    home = upload_machine_photo(client, exercise, "Home Hammer", "#e86f35")
    travel = upload_machine_photo(client, exercise, "Travel Cybex", "#293d6b")
    path = f"/api/exercises/{exercise}/weight-mapping"

    empty = client.get(path).json()
    assert empty["enabled"] is False
    assert empty["reference_machine_id"] is None
    assert [item["id"] for item in empty["machines"]] == [home["id"], travel["id"]]
    assert all(item["machine_kg"] is None for item in empty["machines"])

    assert client.put(path, json={"enabled": True}).status_code == 422
    half_pair = {"id": travel["id"], "machine_kg": 40}
    assert (
        client.put(
            path,
            json={"enabled": True, "reference_machine_id": home["id"], "machines": [half_pair]},
        ).status_code
        == 422
    )

    saved = client.put(
        path,
        json={
            "enabled": True,
            "reference_machine_id": home["id"],
            "machines": [
                {"id": home["id"], "machine_kg": 10, "reference_kg": 20},
                {"id": travel["id"], "machine_kg": 40, "reference_kg": 50},
            ],
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["enabled"] is True
    assert body["reference_machine_id"] == home["id"]
    by_id = {item["id"]: item for item in body["machines"]}
    # The reference machine never carries its own conversion.
    assert by_id[home["id"]]["machine_kg"] is None
    assert (by_id[travel["id"]]["machine_kg"], by_id[travel["id"]]["reference_kg"]) == (40, 50)
    assert by_id[travel["id"]]["caption"] == "Travel Cybex"
    assert client.get(path).json() == body

    assert other_client.get(path).status_code == 404
    assert other_client.put(path, json={"enabled": False}).status_code == 404
    other_exercise = leg_press(other_client)
    foreign = client.put(
        f"/api/exercises/{exercise}/weight-mapping",
        json={"enabled": True, "reference_machine_id": "missing"},
    )
    assert foreign.status_code == 404
    assert other_client.get(f"/api/exercises/{other_exercise}/weight-mapping").json() == {
        "enabled": False,
        "reference_machine_id": None,
        "machines": [],
    }

    off = client.put(
        path,
        json={
            "enabled": False,
            "reference_machine_id": home["id"],
            "machines": [{"id": travel["id"], "machine_kg": 40, "reference_kg": 50}],
        },
    ).json()
    assert off["enabled"] is False
    assert {item["id"]: item["machine_kg"] for item in off["machines"]}[travel["id"]] == 40


def test_merged_and_deleted_machines_keep_the_mapping_consistent(client):
    exercise = leg_press(client)
    home = upload_machine_photo(client, exercise, "Home Hammer", "#e86f35")
    travel = upload_machine_photo(client, exercise, "Travel Cybex", "#293d6b")
    angle = upload_machine_photo(client, exercise, "Travel Cybex side", "#334455")
    path = f"/api/exercises/{exercise}/weight-mapping"
    assert (
        client.put(
            path,
            json={
                "enabled": True,
                "reference_machine_id": angle["id"],
                "machines": [{"id": home["id"], "machine_kg": 50, "reference_kg": 40}],
            },
        ).status_code
        == 200
    )

    assert merge(client, exercise, travel, angle).status_code == 200
    merged = client.get(path).json()
    # The reference followed its photo into the kept machine.
    assert merged["reference_machine_id"] == travel["id"]
    assert [item["id"] for item in merged["machines"]] == [home["id"], travel["id"]]

    assert client.delete(f"/api/machine-photos/{travel['id']}").status_code == 204
    cleared = client.get(path).json()
    assert cleared["enabled"] is False
    assert cleared["reference_machine_id"] is None
    assert [item["id"] for item in cleared["machines"]] == [home["id"]]
    assert cleared["machines"][0]["machine_kg"] == 50


def test_progress_lists_each_machines_sessions_separately(client):
    exercise = leg_press(client)
    home = upload_machine_photo(client, exercise, "Home Hammer", "#e86f35")
    travel = upload_machine_photo(client, exercise, "Travel Cybex", "#293d6b")
    first = log(client, exercise, 3, [home["id"]], 100)
    unpinned = log(client, exercise, 2, [], 90)
    both = log(client, exercise, 1, [home["id"], travel["id"]], 80)

    progress = client.get(f"/api/progress/{exercise}").json()
    assert [point["workout_id"] for point in progress["points"]] == [
        first["id"],
        unpinned["id"],
        both["id"],
    ]
    machine_points = [
        (point["workout_id"], point["machine_photo_id"], point["best_weight_kg"])
        for point in progress["machine_points"]
    ]
    assert machine_points == [
        (first["id"], home["id"], 100),
        (unpinned["id"], None, 90),
        # Several machines on one movement can't be attributed to either.
        (both["id"], None, 80),
    ]


def test_exercise_list_summary_follows_normalised_machine_weights(client):
    exercise = leg_press(client)
    home = upload_machine_photo(client, exercise, "Home Hammer", "#e86f35")
    travel = upload_machine_photo(client, exercise, "Travel Cybex", "#293d6b")
    log(client, exercise, 2, [travel["id"]], 150)
    log(client, exercise, 1, [home["id"]], 100)
    path = f"/api/exercises/{exercise}/weight-mapping"

    def summary() -> dict:
        return next(
            item for item in client.get("/api/progress").json() if item["exercise_id"] == exercise
        )

    raw = summary()
    assert raw["normalised"] is False
    assert [point["estimated_1rm"] for point in raw["trend"]] == [
        round(estimated_one_rep_max(150, 5), 1),
        round(estimated_one_rep_max(100, 5), 1),
    ]

    mapping = {
        "enabled": True,
        "reference_machine_id": home["id"],
        "machines": [{"id": travel["id"], "machine_kg": 150, "reference_kg": 120}],
    }
    assert client.put(path, json=mapping).status_code == 200
    normalised = summary()
    # The Cybex session now reads in Hammer weights, as the progress chart's All machines view does.
    assert normalised["normalised"] is True
    assert [point["estimated_1rm"] for point in normalised["trend"]] == [
        round(estimated_one_rep_max(120, 5), 1),
        round(estimated_one_rep_max(100, 5), 1),
    ]
    assert normalised["latest_estimated_1rm"] == round(estimated_one_rep_max(100, 5), 1)
    assert normalised["change_kg"] == round(
        round(estimated_one_rep_max(100, 5), 1) - round(estimated_one_rep_max(120, 5), 1), 1
    )

    assert client.put(path, json={**mapping, "enabled": False}).status_code == 200
    assert summary() == raw


def test_exercise_list_summary_converts_merged_machine_sets(client):
    exercise = leg_press(client)
    home = upload_machine_photo(client, exercise, "Home Hammer", "#e86f35")
    travel = upload_machine_photo(client, exercise, "Travel Cybex", "#293d6b")
    angle = upload_machine_photo(client, exercise, "Travel Cybex side", "#334455")
    log(client, exercise, 1, [angle["id"]], 150)
    path = f"/api/exercises/{exercise}/weight-mapping"
    assert (
        client.put(
            path,
            json={
                "enabled": True,
                "reference_machine_id": home["id"],
                "machines": [{"id": travel["id"], "machine_kg": 150, "reference_kg": 120}],
            },
        ).status_code
        == 200
    )
    assert merge(client, exercise, travel, angle).status_code == 200

    summary = next(
        item for item in client.get("/api/progress").json() if item["exercise_id"] == exercise
    )
    assert summary["latest_estimated_1rm"] == round(estimated_one_rep_max(120, 5), 1)


def test_records_compare_normalised_machines_in_reference_weights(client):
    exercise = leg_press(client)
    hammer = upload_machine_photo(client, exercise, "Hammer", "#e86f35")
    cybex = upload_machine_photo(client, exercise, "Cybex", "#293d6b")
    log(client, exercise, 3, [hammer["id"]], 110)
    # 130 kg on the Cybex is 104 kg in Hammer weights: a PR only in logged weights.
    cybex_day = log(client, exercise, 2, [cybex["id"]], 130)
    # 115 kg on the Hammer beats 110 kg in Hammer weights, not the Cybex's logged 130 kg.
    hammer_day = log(client, exercise, 1, [hammer["id"]], 115)
    path = f"/api/exercises/{exercise}/weight-mapping"

    def weight_prs() -> list[str]:
        return [
            row["workout_id"]
            for row in client.get("/api/personal-records", params={"exercise_id": exercise}).json()
            if row["record_type"] == "weight"
        ]

    assert weight_prs() == [cybex_day["id"]]
    mapping = {
        "enabled": True,
        "reference_machine_id": hammer["id"],
        "machines": [{"id": cybex["id"], "machine_kg": 150, "reference_kg": 120}],
    }
    before = client.get("/api/workouts/revision").json()["revision"]
    assert client.put(path, json=mapping).status_code == 200
    # Saving the mapping rebuilds the records and tells clients to reload them.
    assert client.get("/api/workouts/revision").json()["revision"] != before
    assert weight_prs() == [hammer_day["id"]]
    record = next(
        row
        for row in client.get("/api/personal-records", params={"exercise_id": exercise}).json()
        if row["record_type"] == "weight"
    )
    # The record still shows the weight that was logged.
    assert record["value"] == 115

    assert client.put(path, json={**mapping, "enabled": False}).status_code == 200
    assert weight_prs() == [cybex_day["id"]]
