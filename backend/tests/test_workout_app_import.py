from __future__ import annotations

import csv
from io import StringIO

import pytest

STRONG = [
    "Date",
    "Workout Name",
    "Duration",
    "Exercise Name",
    "Set Order",
    "Weight",
    "Reps",
    "Distance",
    "Seconds",
    "Notes",
    "Workout Notes",
    "RPE",
]
HEVY = [
    "title",
    "start_time",
    "end_time",
    "description",
    "exercise_title",
    "superset_id",
    "exercise_notes",
    "set_index",
    "set_type",
    "weight_kg",
    "reps",
    "distance_km",
    "duration_seconds",
    "rpe",
]


def csv_file(headers, *rows):
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return output.getvalue().encode()


def upload(client, raw, source, *, preview=False, **options):
    return client.post(
        "/api/workouts/import/preview" if preview else "/api/workouts/import",
        files={"file": ("sample.csv", raw, "text/csv")},
        data={"source": source, **options},
    )


def strong_row(**changes):
    values = dict(
        zip(
            STRONG,
            [
                "2026-10-10 08:30:00",
                "Morning",
                "1h 5m",
                "Bench Press",
                "1",
                "80",
                "8.0",
                "0",
                "0",
                "steady\nkeep form",
                "Push day",
                "8",
            ],
            strict=True,
        )
    )
    values.update(changes)
    return [values[key] for key in STRONG]


def hevy_row(**changes):
    values = dict(
        zip(
            HEVY,
            [
                "Evening",
                "10 Oct 2026, 18:00",
                "10 Oct 2026, 19:15",
                "Good session",
                "Bench Press",
                "",
                "Pause",
                "0",
                "normal",
                "80",
                "8",
                "",
                "",
                "8.5",
            ],
            strict=True,
        )
    )
    values.update(changes)
    return [values[key] for key in HEVY]


def test_strong_preserves_details_skips_timers_and_reimports_idempotently(client):
    raw = csv_file(
        STRONG,
        strong_row(**{"Set Order": "W"}),
        strong_row(**{"Set Order": "Rest Timer", "Reps": "0", "Seconds": "120"}),
        strong_row(**{"Set Order": "D"}),
        strong_row(**{"Set Order": "F"}),
    )
    preview = upload(client, raw, "strong", preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["sets_to_import"] == 3
    assert "rest-timer" in " ".join(preview.json()["warnings"])
    assert client.get("/api/workouts").json() == []
    assert upload(client, raw, "strong").status_code == 201
    workout = client.get("/api/workouts").json()[0]
    assert (workout["name"], workout["notes"], workout["duration_minutes"]) == (
        "Morning",
        "Push day",
        65,
    )
    movement = workout["movements"][0]
    assert movement["exercise"]["name"] == "Barbell Bench Press"
    assert movement["notes"] == "steady\nkeep form"
    sets = movement["sets"]
    assert [item["set_type"] for item in sets] == ["warmup", "drop", "normal"]
    assert sets[0]["warmup"] and sets[2]["failed"]
    assert all(item["rpe"] == 8 and item["reps"] == 8 for item in sets)
    assert upload(client, raw, "strong").json()["workouts_skipped"] == 1


def test_hevy_keeps_two_sessions_and_timed_cardio_including_overnight_duration(client):
    raw = csv_file(
        HEVY,
        hevy_row(set_type="warmup", superset_id="1"),
        hevy_row(
            title="Later",
            start_time="10 Oct 2026, 23:45",
            end_time="11 Oct 2026, 00:15",
            exercise_title="Stationary Bike",
            reps="",
            weight_kg="",
            duration_seconds="1800",
            distance_km="12.5",
            set_type="normal",
        ),
    )
    preview = upload(client, raw, "hevy", preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["workouts_to_create"] == 2
    assert "Superset grouping" in " ".join(preview.json()["warnings"])
    assert upload(client, raw, "hevy").status_code == 201
    workouts = client.get("/api/workouts").json()
    bike = next(item for item in workouts if item["name"] == "Later")
    assert bike["workout_date"] == "2026-10-10" and bike["duration_minutes"] == 30
    item = bike["movements"][0]["sets"][0]
    assert (item["duration_seconds"], item["distance_km"], item["reps"]) == (1800, 12.5, None)
    assert upload(client, raw, "hevy").json()["workouts_skipped"] == 2
    # Cardio ledger synchronization follows the existing workout completion path.
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import CardioSession

    with SessionLocal() as db:
        cardio = db.scalar(select(CardioSession))
        assert cardio.duration_minutes == 30 and cardio.distance_km == 12.5


def test_strong_units_are_explicit_and_convert_weights_and_distances(client):
    raw = csv_file(
        STRONG, strong_row(**{"Weight": "220.46226218", "Distance": "1", "Seconds": "60"})
    )
    result = upload(client, raw, "strong", weight_unit="lb", distance_unit="mi")
    assert result.status_code == 201, result.text
    item = client.get("/api/workouts").json()[0]["movements"][0]["sets"][0]
    assert item["weight_kg"] == 100
    assert item["distance_km"] == pytest.approx(1.609344)


def test_strong_measurements_review_missing_dates_preserve_existing_and_isolate_accounts(
    client, other_client
):
    headers = ["Date", "Measurement Type", "Value", "Unit", "Source"]
    raw = csv_file(
        headers,
        ["2026-10-10 10:00:00", "Weight", "176.369809744", "lb", "Manual"],
        ["2026-10-11 10:00:00", "Weight", "82", "kg", "Manual"],
        ["2026-10-11 11:00:00", "Weight", "84", "kg", "Manual"],
        ["2026-10-12 10:00:00", "Body Fat", "15", "%", "Manual"],
    )
    assert (
        client.post(
            "/api/body-measurements",
            json={
                "measurement_date": "2026-10-10",
                "weight_kg": 90,
                "body_fat_pct": 17,
                "notes": "Keep",
            },
        ).status_code
        == 200
    )
    before = client.get("/api/body-measurements").json()
    preview = upload(client, raw, "strong", preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["body_measurements_to_create"] == 1
    assert preview.json()["body_measurements_to_skip"] == 1
    assert client.get("/api/body-measurements").json() == before
    result = upload(client, raw, "strong").json()
    assert result["body_measurements_created"] == 1 and result["workouts_created"] == 0
    after = client.get("/api/body-measurements").json()
    assert next(row for row in after if row["measurement_date"] == "2026-10-10") == before[0]
    assert next(row for row in after if row["measurement_date"] == "2026-10-11")["weight_kg"] == 83
    assert upload(client, raw, "strong").json()["body_measurements_created"] == 0
    assert other_client.get("/api/body-measurements").json() == []
    assert upload(other_client, raw, "strong").json()["body_measurements_created"] == 2


@pytest.mark.parametrize(
    "changes",
    [
        {"Weight": "nan"},
        {"Reps": "1.5"},
        {"RPE": "11"},
        {"Seconds": "inf"},
        {"Date": "nonsense"},
        {"Distance": "-1"},
        {"Duration": "50h"},
    ],
)
def test_invalid_app_rows_save_nothing_even_after_valid_rows(client, changes):
    raw = csv_file(STRONG, strong_row(), strong_row(**changes))
    for preview in (True, False):
        result = upload(client, raw, "strong", preview=preview)
        assert result.status_code == 422, result.text
    assert client.get("/api/workouts").json() == []


def test_wrong_source_unknown_source_and_malformed_csv_do_not_save(client):
    raw = csv_file(STRONG, strong_row())
    assert upload(client, raw, "hevy", preview=True).status_code == 422
    assert upload(client, raw, "unknown").status_code == 422
    assert upload(client, raw + b'"unclosed', "strong").status_code == 422
    assert client.get("/api/workouts").json() == []


def test_strength_level_original_columns_and_bodyweights(client):
    raw = (
        b"Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),Warmup,Time (seconds)\n"
        b"2026-10-10,Bench Press,80,176.4,8,85,1,\n"
    )
    preview = upload(client, raw, "strengthlevel", preview=True)
    assert preview.json()["body_measurements_to_create"] == 1
    assert upload(client, raw, "strengthlevel").status_code == 201
    assert client.get("/api/body-measurements").json()[0]["weight_kg"] == 85


def test_gym_bodyweight_export_uses_shared_preview_and_preserves_all_fields(client, other_client):
    for day, weight in [("2026-10-10", 81), ("2026-10-11", 82)]:
        assert (
            client.post(
                "/api/body-measurements",
                json={
                    "measurement_date": day,
                    "weight_kg": weight,
                    "body_fat_pct": 17.5,
                    "notes": "Sample note, with comma\nand newline",
                },
            ).status_code
            == 200
        )
    raw = client.get("/api/body-measurements/export.csv").content
    before = client.get("/api/body-measurements").json()
    own_preview = upload(client, raw, "gym", preview=True).json()
    assert own_preview["body_measurements_to_create"] == 0
    assert own_preview["body_measurements_to_skip"] == 2
    assert upload(client, raw, "gym").json()["body_measurements_created"] == 0
    assert client.get("/api/body-measurements").json() == before
    preview = upload(other_client, raw, "gym", preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["body_measurements_to_create"] == 2
    assert preview.json()["sessions"] == []
    assert other_client.get("/api/body-measurements").json() == []
    # Saving rechecks dates added since preview and never overwrites them.
    other_client.post(
        "/api/body-measurements", json={"measurement_date": "2026-10-10", "weight_kg": 90}
    )
    result = upload(other_client, raw, "gym")
    assert result.status_code == 201, result.text
    assert result.json()["body_measurements_created"] == 1
    saved = {
        row["measurement_date"]: row for row in other_client.get("/api/body-measurements").json()
    }
    assert saved["2026-10-10"]["weight_kg"] == 90
    for field in ("weight_kg", "body_fat_pct", "notes"):
        assert (
            saved["2026-10-11"][field]
            == next(row for row in before if row["measurement_date"] == "2026-10-11")[field]
        )
    assert other_client.get("/api/workouts").json() == []
    assert upload(client, raw, "strong", preview=True).status_code == 422


@pytest.mark.parametrize(
    "tail",
    [
        "2026-10-11,nan,17,invalid\n",
        "2026-10-10,82,17,duplicate date\n",
        '2026-10-11,82,17,"unclosed',
        "2026-10-11,82,17,note,extra\n",
    ],
)
def test_invalid_native_bodyweight_file_saves_nothing(client, tail):
    raw = ("Date,Weight (kg),Body Fat (%),Notes\n2026-10-10,81,17,valid\n" + tail).encode()
    for preview in (True, False):
        result = upload(client, raw, "gym", preview=preview)
        assert result.status_code == 422, result.text
    assert client.get("/api/body-measurements").json() == []
    assert client.get("/api/workouts").json() == []
