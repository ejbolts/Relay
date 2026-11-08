from datetime import date

from sqlalchemy import text

from app.database import SessionLocal
from app.training_blocks import training_blocks
from app.training_metrics import get_setting


def block(client, name="Rebuild", start="2026-06-01"):
    response = client.post("/api/training-blocks", json={"name": name, "start_date": start})
    assert response.status_code == 201, response.text
    return next(b for b in response.json()["blocks"] if b["start_date"] == start)


def log(client, weight, day, reps=8, **extra):
    exercise = next(
        e for e in client.get("/api/exercises").json() if e["name"] == "Barbell Bench Press"
    )
    response = client.post(
        "/api/workouts",
        json={
            "name": "Block test",
            "workout_date": day,
            "category": "push",
            "movements": [
                {
                    "exercise_id": exercise["id"],
                    "sets": [
                        {"weight_kg": weight, "reps": reps, **extra},
                        {"weight_kg": 20, "reps": 1},
                    ],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json(), exercise["id"]


def records(client, workout):
    return client.get(
        "/api/personal-records",
        params={
            "include_blocks": True,
            "workout_id": workout["id"],
        },
    ).json()


def test_blocks_have_independent_records_and_reuse_progress(client):
    log(client, 120, "2026-01-01")
    current = block(client)
    first, exercise = log(client, 90, "2026-06-01")
    assert records(client, first) == []
    improved, _ = log(client, 95, "2026-06-02")
    assert [(r["scope"], r["record_type"]) for r in records(client, improved)] == [
        ("block", "weight")
    ]
    volume, _ = log(client, 95, "2026-06-03", reps=9)
    assert [(r["scope"], r["record_type"]) for r in records(client, volume)] == [
        ("all_time", "reps_at_weight")
    ]
    all_time, _ = log(client, 125, "2026-06-04")
    assert [(r["scope"], r["record_type"]) for r in records(client, all_time)] == [
        ("all_time", "weight")
    ]
    progress = client.get(f"/api/progress/{exercise}", params={"block_id": current["id"]}).json()
    assert len(progress["points"]) == 4
    assert progress["points"][0]["workout_date"] == "2026-06-01"
    assert len(client.get(f"/api/progress/{exercise}").json()["points"]) == 5
    summary = client.get("/api/progress", params={"block_id": current["id"]}).json()
    assert next(e for e in summary if e["exercise_id"] == exercise)["session_count"] == 4


def test_boundary_edit_delete_and_older_baselines(client):
    log(client, 120, "2026-01-01")
    first = block(client, "First", "2026-02-01")
    log(client, 90, "2026-02-01")
    improved, exercise = log(client, 95, "2026-03-01")
    second = block(client, "Second", "2026-03-01")
    assert records(client, improved) == []  # Exact start belongs to the new block.
    baseline = next(
        b
        for b in client.get("/api/exercise-history-baselines?before=2026-04-01").json()
        if b["exercise_id"] == exercise
    )
    assert baseline["best_weight_kg"] == 120
    assert {b["block_id"]: b["best_weight_kg"] for b in baseline["block_bests"]} == {
        first["id"]: 90,
        second["id"]: 95,
    }
    assert baseline["latest"]["workout_id"] == improved["id"]
    response = client.put(
        f"/api/training-blocks/{second['id']}",
        json={
            "name": "Later",
            "start_date": "2026-04-01",
        },
    )
    assert response.status_code == 200
    assert records(client, improved)[0]["scope"] == "block"
    assert client.delete(f"/api/training-blocks/{first['id']}").status_code == 200
    assert records(client, improved) == []
    assert client.get("/api/workouts").status_code == 200
    assert len(client.get("/api/workouts").json()) == 3


def test_validation_isolation_and_revision(client, other_client):
    revision = client.get("/api/workouts/revision").json()
    current = block(client)
    assert client.get("/api/workouts/revision").json() != revision
    assert other_client.get("/api/training-blocks").json()["blocks"] == []
    assert other_client.delete(f"/api/training-blocks/{current['id']}").status_code == 404
    assert other_client.get("/api/progress", params={"block_id": current["id"]}).status_code == 404
    for name, start in [(" ", "2026-01-01"), ("Future", "2999-01-01"), ("Duplicate", "2026-06-01")]:
        assert (
            client.post(
                "/api/training-blocks", json={"name": name, "start_date": start}
            ).status_code
            == 422
        )


def test_yearly_rollover_is_stable_and_can_be_disabled(client):
    current = block(client, "2024", "2024-05-01")
    assert client.patch("/api/training-blocks", json={"auto_yearly": True}).status_code == 200
    with SessionLocal() as db:
        config = training_blocks(db, client.user["id"], date(2027, 1, 2))
        assert [b.start_date for b in config.blocks] == [
            date(2024, 5, 1),
            date(2025, 1, 1),
            date(2026, 1, 1),
            date(2027, 1, 1),
        ]
        assert config.blocks[-1].id == "year:2027"
        assert config.blocks[0].id == current["id"]
        assert config.blocks[0].end_date == date(2025, 1, 1)
    existing = client.get("/api/training-blocks").json()["blocks"]
    disabled = client.patch("/api/training-blocks", json={"auto_yearly": False}).json()
    assert disabled["blocks"] == existing
    with SessionLocal() as db:
        assert len(training_blocks(db, client.user["id"], date(2028, 1, 1)).blocks) == len(existing)


def test_editing_and_deleting_workouts_recalculates_block_prs(client):
    block(client)
    first, _ = log(client, 90, "2026-06-01")
    improved, _ = log(client, 95, "2026-06-02")
    assert records(client, improved)
    payload = {key: first[key] for key in ("name", "workout_date", "category")}
    payload["movements"] = [
        {
            "exercise_id": first["movements"][0]["exercise"]["id"],
            "sets": [{"weight_kg": 100, "reps": 8}],
        }
    ]
    assert client.put(f"/api/workouts/{first['id']}", json=payload).status_code == 200
    assert records(client, improved) == []
    assert client.delete(f"/api/workouts/{first['id']}").status_code == 204
    assert records(client, improved) == []


def test_imported_history_uses_the_block_dates(client):
    log(client, 120, "2026-01-01")
    block(client)
    log(client, 90, "2026-06-01")
    imported = client.post(
        "/api/workouts/import",
        files={
            "file": (
                "history.csv",
                "Date Lifted,Exercise,Weight (kg),Reps\n2026-06-02,Barbell Bench Press,95,8\n",
                "text/csv",
            )
        },
    )
    assert imported.status_code == 201, imported.text
    workout = next(
        w for w in client.get("/api/workouts").json() if w["workout_date"] == "2026-06-02"
    )
    assert [(r["scope"], r["record_type"]) for r in records(client, workout)] == [
        ("block", "weight")
    ]


def test_block_list_counts_workouts_per_block_without_saving_counts(client):
    log(client, 100, "2025-03-01")
    log(client, 100, "2026-05-31")
    first = block(client, "Foundation", "2026-06-01")
    log(client, 100, "2026-06-01")
    log(client, 100, "2026-06-01")
    second = block(client, "Peak", "2026-07-01")
    log(client, 100, "2026-07-02")
    listed = client.get("/api/training-blocks").json()
    assert listed["history_start"] == "2025-03-01"
    assert listed["earlier_workout_count"] == 2
    assert [(b["id"], b["workout_count"]) for b in listed["blocks"]] == [
        (first["id"], 2),
        (second["id"], 1),
    ]
    with SessionLocal() as db:
        user_id = db.execute(text("select user_id from training_workouts limit 1")).scalar_one()
        assert "workout_count" not in get_setting(db, user_id, "training_blocks", "")


def test_planned_end_is_optional_validated_and_editable(client):
    created = client.post(
        "/api/training-blocks",
        json={"name": "Peak", "start_date": "2026-06-01", "planned_end_date": "2026-08-23"},
    )
    assert created.status_code == 201, created.text
    peak = created.json()["blocks"][0]
    assert peak["planned_end_date"] == "2026-08-23"
    assert peak["end_date"] is None
    invalid = client.put(
        f"/api/training-blocks/{peak['id']}",
        json={"name": "Peak", "start_date": "2026-06-01", "planned_end_date": "2026-06-01"},
    )
    assert invalid.status_code == 422
    cleared = client.put(
        f"/api/training-blocks/{peak['id']}",
        json={"name": "Peak", "start_date": "2026-06-01", "planned_end_date": None},
    ).json()
    assert cleared["blocks"][0]["planned_end_date"] is None
