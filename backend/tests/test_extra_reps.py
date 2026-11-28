"""Partial and assisted reps: a set's reps beyond its full ones, on exercises that track them."""

from __future__ import annotations

import csv
import importlib.util
from copy import deepcopy
from datetime import date, timedelta
from io import StringIO
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from test_exercise_merge import custom, merge, official
from test_sharing import share

VERSION = {"X-Relay-Version": "1.3.4"}


def exercise_named(client, name="Lateral Raise"):
    return next(item for item in client.get("/api/exercises").json() if item["name"] == name)


def track_extra_reps(client, exercise, enabled=True):
    response = client.patch(
        f"/api/exercises/{exercise['id']}", json={"extra_reps_enabled": enabled}
    )
    assert response.status_code == 200, response.text
    return response.json()


def workout(exercise, sets, **fields):
    return {
        "name": "Sample shoulders",
        "workout_date": date.today().isoformat(),
        "category": "push",
        "movements": [{"exercise_id": exercise["id"], "sets": sets}],
        **fields,
    }


def saved(client, exercise, sets, **fields):
    response = client.post("/api/workouts", json=workout(exercise, sets, **fields))
    assert response.status_code == 201, response.text
    return response.json()


def extra_reps(saved_workout):
    return [
        (item["reps"], item["partial_reps"], item["assisted_reps"])
        for item in saved_workout["movements"][0]["sets"]
    ]


def test_an_exercise_tracks_extra_reps_only_once_its_owner_turns_that_on(client, other_client):
    raise_ = exercise_named(client)
    assert raise_["extra_reps_enabled"] is False
    revision = client.get("/api/workouts/revision").json()

    assert track_extra_reps(client, raise_)["extra_reps_enabled"] is True
    assert exercise_named(client)["extra_reps_enabled"] is True
    # Open apps reload the exercise, and another account's copy is its own.
    assert client.get("/api/workouts/revision").json() != revision
    assert exercise_named(other_client)["extra_reps_enabled"] is False
    assert (
        other_client.patch(
            f"/api/exercises/{raise_['id']}", json={"extra_reps_enabled": True}
        ).status_code
        == 404
    )

    # Other changes to the exercise leave the setting alone.
    hidden = client.patch(f"/api/exercises/{raise_['id']}", json={"hidden": True}).json()
    assert (hidden["hidden"], hidden["extra_reps_enabled"]) == (True, True)
    assert track_extra_reps(client, raise_, False)["extra_reps_enabled"] is False


def test_cardio_exercises_have_no_reps_to_track(client):
    running = exercise_named(client, "Running")
    refused = client.patch(f"/api/exercises/{running['id']}", json={"extra_reps_enabled": True})
    assert refused.status_code == 422
    assert refused.json()["error"]["message"] == "Cardio exercises have no reps to track."
    assert exercise_named(client, "Running")["extra_reps_enabled"] is False
    # Turning it off is harmless, so an app can always clear it.
    assert track_extra_reps(client, running, False)["extra_reps_enabled"] is False


def test_extra_reps_save_with_their_set_and_survive_turning_tracking_off(client):
    raise_ = track_extra_reps(client, exercise_named(client))
    created = saved(
        client,
        raise_,
        [
            {"weight_kg": 10, "reps": 12, "partial_reps": 4, "assisted_reps": 2},
            {"weight_kg": 10, "reps": 10, "partial_reps": 0},
            {"weight_kg": 10, "reps": 9},
        ],
    )
    assert extra_reps(created) == [(12, 4, 2), (10, 0, None), (9, None, None)]
    assert extra_reps(client.get(f"/api/workouts/{created['id']}").json()) == extra_reps(created)
    assert created["movements"][0]["exercise"]["extra_reps_enabled"] is True

    track_extra_reps(client, raise_, False)
    kept = client.get(f"/api/workouts/{created['id']}").json()
    assert extra_reps(kept) == extra_reps(created)
    assert kept["movements"][0]["exercise"]["extra_reps_enabled"] is False

    # An exercise that never tracked them can still carry them, such as on an imported set.
    press = exercise_named(client, "Barbell Bench Press")
    other = saved(
        client,
        press,
        [{"weight_kg": 60, "reps": 8, "assisted_reps": 2}],
        workout_date=(date.today() - timedelta(days=1)).isoformat(),
    )
    assert extra_reps(other) == [(8, None, 2)]


def test_records_volume_and_set_counts_use_full_reps_only(client):
    raise_ = track_extra_reps(client, exercise_named(client))
    earlier = (date.today() - timedelta(days=7)).isoformat()
    saved(client, raise_, [{"weight_kg": 10, "reps": 12}], workout_date=earlier)
    # Fewer full reps than last week: the partial and assisted reps earn no rep record.
    later = saved(
        client, raise_, [{"weight_kg": 10, "reps": 11, "partial_reps": 5, "assisted_reps": 3}]
    )
    assert client.get("/api/personal-records", params={"workout_id": later["id"]}).json() == []

    progress = client.get(f"/api/progress/{raise_['id']}").json()
    point = next(
        item for item in progress["points"] if item["workout_date"] == later["workout_date"]
    )
    assert point["best_reps"] == 11
    assert point["volume_kg"] == 110

    # A set of partial reps alone still counts as a set, with no volume and no record.
    saved(
        client,
        raise_,
        [{"weight_kg": 12, "reps": 0, "partial_reps": 15}],
        workout_date=(date.today() + timedelta(days=1)).isoformat(),
    )
    records = client.get("/api/personal-records").json()
    assert all(item["value"] != 12 for item in records if item["record_type"] == "weight")


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("partial_reps", -1, "Set 1: partial reps (-1) must be at least 0."),
        ("assisted_reps", 10_001, "Set 1: assisted reps (10,001) must be at most 10,000."),
        ("partial_reps", 2.5, "Set 1: partial reps must be a whole number."),
    ],
)
def test_extra_reps_are_whole_numbers_within_the_rep_limits(client, field, value, message):
    raise_ = exercise_named(client)
    response = client.post(
        "/api/workouts", json=workout(raise_, [{"weight_kg": 10, "reps": 12, field: value}])
    )
    assert response.status_code == 422
    assert message in response.text


@pytest.mark.parametrize("version", [None, "1.2.0", "1.3.4"])
def test_an_older_app_editing_a_workout_keeps_its_extra_reps(client, version):
    raise_ = exercise_named(client)
    sets = [
        {"weight_kg": 10, "reps": 12, "partial_reps": 4, "assisted_reps": 2},
        {"weight_kg": 10, "reps": 10, "partial_reps": 3},
    ]
    created = saved(client, raise_, sets)
    # The older app sends back the sets it knows, without the fields it has never seen.
    old = workout(
        raise_, [{"weight_kg": 12.5, "reps": 11}, {"weight_kg": 10, "reps": 10}, {"reps": 8}]
    )
    response = client.put(
        f"/api/workouts/{created['id']}",
        json=old,
        headers={"X-Relay-Version": version} if version else {},
    )
    assert response.status_code == 200, response.text
    assert extra_reps(response.json()) == [(11, 4, 2), (10, 3, None), (8, None, None)]
    assert response.json()["movements"][0]["sets"][0]["weight_kg"] == 12.5


@pytest.mark.parametrize("headers", [{}, VERSION, {"X-Relay-Version": "1.4.0"}])
def test_an_app_that_sends_extra_reps_can_change_and_clear_them(client, headers):
    """Sending the field proves the app knows it, whatever release it reports (previews)."""
    raise_ = exercise_named(client)
    created = saved(
        client, raise_, [{"weight_kg": 10, "reps": 12, "partial_reps": 4, "assisted_reps": 2}]
    )
    edited = workout(
        raise_, [{"weight_kg": 10, "reps": 12, "partial_reps": 6, "assisted_reps": None}]
    )
    response = client.put(f"/api/workouts/{created['id']}", json=edited, headers=headers)
    assert response.status_code == 200, response.text
    assert extra_reps(response.json()) == [(12, 6, None)]


def test_merging_exercises_keeps_tracking_extra_reps(client):
    source, target = custom(client), official(client)
    track_extra_reps(client, source)
    created = saved(client, source, [{"weight_kg": 40, "reps": 10, "partial_reps": 3}])
    response = merge(client, source, target)
    assert response.status_code == 200, response.text
    assert response.json()["extra_reps_enabled"] is True
    moved = client.get(f"/api/workouts/{created['id']}").json()
    assert moved["movements"][0]["exercise"]["id"] == target["id"]
    assert extra_reps(moved) == [(10, 3, None)]


def test_friends_see_a_sets_extra_reps_but_not_how_the_exercise_is_logged(client, other_client):
    raise_ = track_extra_reps(client, exercise_named(client))
    saved(client, raise_, [{"weight_kg": 10, "reps": 12, "partial_reps": 4, "assisted_reps": 2}])
    share(client, "public")
    page = other_client.get(f"/api/sharing/profiles/{client.user['id']}/workouts").json()
    [shared] = page["workouts"]
    assert extra_reps(shared) == [(12, 4, 2)]
    assert shared["movements"][0]["exercise"]["extra_reps_enabled"] is False


def csv_rows(content: str) -> list[dict[str, str]]:
    return list(csv.DictReader(StringIO(content.removeprefix("﻿"))))


def test_workout_csv_carries_extra_reps_out_and_back_in(client, other_client):
    raise_ = exercise_named(client)
    saved(
        client,
        raise_,
        [
            {"weight_kg": 10, "reps": 12, "partial_reps": 4, "assisted_reps": 2},
            {"weight_kg": 10, "reps": 10, "partial_reps": 0},
            {"weight_kg": 10, "reps": 9},
        ],
    )
    exported = client.get("/api/workouts/export.csv")
    assert exported.status_code == 200
    content = exported.content.decode("utf-8-sig")
    header = content.splitlines()[0].split(",")
    # New columns follow the ones older files and spreadsheets already use.
    assert header[-2:] == ["Partial reps", "Assisted reps"]
    assert [
        (row["Reps"], row["Partial reps"], row["Assisted reps"]) for row in csv_rows(content)
    ] == [
        ("12", "4", "2"),
        ("10", "0", ""),
        ("9", "", ""),
    ]

    file = {"file": ("workouts.csv", content.encode(), "text/csv")}
    # The same file is recognised as already imported, extra reps included.
    again = client.post("/api/workouts/import", files=file)
    assert again.status_code == 201, again.text
    assert again.json()["workouts_created"] == 0

    imported = other_client.post("/api/workouts/import", files=file)
    assert imported.status_code == 201, imported.text
    assert imported.json()["sets_imported"] == 3
    [restored] = other_client.get("/api/workouts").json()
    assert extra_reps(restored) == [(12, 4, 2), (10, 0, None), (9, None, None)]


def test_csv_without_the_extra_rep_columns_still_matches_saved_sets(client):
    """A file exported before the columns existed is not imported a second time."""
    raise_ = exercise_named(client)
    created = saved(client, raise_, [{"weight_kg": 10, "reps": 12, "partial_reps": 4}])
    content = client.get("/api/workouts/export.csv").content.decode("utf-8-sig")
    rows = csv_rows(content)
    older = StringIO(newline="")
    fields = [name for name in rows[0] if name not in {"Partial reps", "Assisted reps"}]
    writer = csv.DictWriter(older, fieldnames=fields, extrasaction="ignore", lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    response = client.post(
        "/api/workouts/import",
        files={"file": ("workouts.csv", older.getvalue().encode(), "text/csv")},
    )
    assert response.status_code == 201, response.text
    assert response.json()["workouts_created"] == 0
    assert [item["id"] for item in client.get("/api/workouts").json()] == [created["id"]]


def test_csv_refuses_extra_reps_that_are_not_whole_counts(client):
    content = (
        "Date Lifted,Exercise,Weight (kg),Reps,Partial reps\n2026-06-01,Lateral Raise,10,12,-3\n"
    )
    response = client.post(
        "/api/workouts/import",
        files={"file": ("workouts.csv", content.encode(), "text/csv")},
    )
    assert response.status_code == 422
    assert "Row 2: Partial reps must be between 0 and 10000." in response.text


def test_migration_adds_extra_reps_without_changing_saved_sets():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0068_partial_assisted_reps.py"
    spec = importlib.util.spec_from_file_location("partial_assisted_reps_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")

    def columns(connection, table):
        return {column["name"] for column in inspect(connection).get_columns(table)}

    with engine.begin() as connection:
        for sql in [
            "CREATE TABLE exercises (id TEXT PRIMARY KEY, name TEXT)",
            "CREATE TABLE workout_sets (id TEXT PRIMARY KEY, reps INTEGER, "
            "CONSTRAINT workout_set_reps_nonnegative CHECK (reps IS NULL OR reps >= 0))",
            "INSERT INTO exercises VALUES ('raise', 'Lateral Raise')",
            "INSERT INTO workout_sets VALUES ('s1', 12), ('s2', NULL)",
        ]:
            connection.execute(text(sql))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(text("SELECT extra_reps_enabled FROM exercises")).scalar() == 0
        assert connection.execute(
            text("SELECT id, reps, partial_reps, assisted_reps FROM workout_sets ORDER BY id")
        ).all() == [("s1", 12, None, None), ("s2", None, None, None)]
        connection.execute(text("UPDATE workout_sets SET partial_reps = 4, assisted_reps = 0"))
        for column in ("partial_reps", "assisted_reps"):
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text(f"UPDATE workout_sets SET {column} = -1"))
        # The existing rule on full reps is still enforced after the table is rebuilt.
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE workout_sets SET reps = -1"))

        migration.downgrade()
        assert columns(connection, "exercises") == {"id", "name"}
        assert columns(connection, "workout_sets") == {"id", "reps"}
        assert connection.execute(text("SELECT id, reps FROM workout_sets ORDER BY id")).all() == [
            ("s1", 12),
            ("s2", None),
        ]


def test_draft_sets_may_carry_extra_reps():
    """The live draft shared between devices accepts the new fields on its sets."""
    from app.active_workouts import DraftSet

    draft_set = DraftSet.model_validate(
        {"key": "set-1", "reps": 12, "partial_reps": 4, "assisted_reps": 2}
    )
    assert (draft_set.partial_reps, draft_set.assisted_reps) == (4, 2)
    untouched = deepcopy(DraftSet.model_validate({"key": "set-2", "reps": 12}))
    assert (untouched.partial_reps, untouched.assisted_reps) == (None, None)
    with pytest.raises(ValueError):
        DraftSet.model_validate({"key": "set-3", "reps": 12, "partial_reps": -1})
