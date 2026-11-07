from __future__ import annotations

import csv
from io import StringIO

import pytest

from app.tracker_csv import CARDIO_HEADERS, CSV_HEADERS, SESSION_HEADERS, WORKOUT_TYPE_HEADERS


def upload(client, content, *, preview=False):
    return client.post(
        "/api/workouts/import/preview" if preview else "/api/workouts/import",
        files={"file": ("sample.csv", content, "text/csv")},
    )


def export(client, **params):
    response = client.get("/api/workouts/export.csv", params=params)
    assert response.status_code == 200, response.text
    return response.content, list(csv.DictReader(StringIO(response.content.decode("utf-8-sig"))))


def csv_content(rows):
    stream = StringIO()
    writer = csv.DictWriter(
        stream, (*CSV_HEADERS, *SESSION_HEADERS, *WORKOUT_TYPE_HEADERS, *CARDIO_HEADERS)
    )
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


def sessions(client):
    return client.get("/api/cardio").json()["sessions"]


def create_cardio(client, **overrides):
    response = client.post(
        "/api/cardio",
        json={
            "session_date": "2026-10-01",
            "activity_type": "Custom ergometer",
            "duration_minutes": 31,
            "distance_km": 5.123456,
            "calories_kcal": 0,
            "average_heart_rate_bpm": 145,
            "average_speed_kph": 9.87654,
            "incline_percent": 0,
            "average_power_watts": 175,
            "average_mets": 6.75,
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def assert_metrics(actual, expected):
    for field in (
        "duration_minutes",
        "distance_km",
        "calories_kcal",
        "average_heart_rate_bpm",
        "average_speed_kph",
        "incline_percent",
        "average_power_watts",
        "average_mets",
    ):
        assert actual[field] == expected[field], field


def test_standalone_cardio_export_range_isolation_round_trip_and_undo(client, other_client):
    original = create_cardio(client)
    create_cardio(client, session_date="2026-09-30")
    create_cardio(client, session_date="2026-10-02")
    create_cardio(other_client, activity_type="Other account's private activity")
    content, rows = export(client, start_date="2026-10-01", end_date="2026-10-01")
    assert len(rows) == 1
    assert rows[0]["Duration (seconds)"] == "1860"
    assert rows[0]["Distance (km)"] == "5.123456"
    assert rows[0]["Calories (kcal)"] == "0"
    assert rows[0]["Reps"] == ""
    assert rows[0]["Workout ID"].startswith("cardio:")
    assert "Other account" not in content.decode()
    assert len(export(client)[1]) == 3
    assert len(export(client, start_date="2026-10-01")[1]) == 2
    assert len(export(client, end_date="2026-10-01")[1]) == 2
    assert export(client, start_date="2026-10-03")[1] == []
    assert upload(client, content).json()["workouts_skipped"] == 1
    assert client.get("/api/workouts").json() == []

    preview = upload(other_client, content, preview=True)
    assert preview.status_code == 200, preview.text
    assert preview.json()["workouts_to_create"] == 1
    assert any("cardio-only" in item for item in preview.json()["warnings"])
    result = upload(other_client, content)
    assert result.status_code == 201, result.text
    restored = next(item for item in sessions(other_client) if item["source_workout_id"])
    assert_metrics(restored, original)
    workout = other_client.get("/api/workouts").json()[0]
    assert workout["category"] == "cardio"
    assert workout["movements"][0]["exercise"]["kind"] == "cardio"
    assert upload(other_client, content).json()["workouts_skipped"] == 1
    response = other_client.delete(f"/api/workouts/import/batches/{result.json()['batch_id']}")
    assert response.status_code == 200, response.text
    assert other_client.get("/api/workouts").json() == []
    assert len(sessions(other_client)) == 1  # The unrelated standalone session survives.


def test_mixed_workout_preserves_completed_sets_and_session_metrics(client, other_client):
    library = client.get("/api/exercises").json()
    cardio = next(item for item in library if item["kind"] == "cardio")
    second_cardio = next(item for item in library if item["kind"] == "cardio" and item != cardio)
    strength = next(item for item in library if item["name"] == "Barbell Bench Press")
    cardio_sets = [
        {
            "duration_seconds": 601,
            "distance_km": 1.234567,
            "calories_kcal": 100,
            "average_heart_rate_bpm": 130,
            "speed_kph": 7.4,
            "incline_percent": 0,
        },
        {
            "duration_seconds": 1202,
            "distance_km": 2.345678,
            "calories_kcal": 250,
            "average_heart_rate_bpm": 145,
            "speed_kph": 7.8,
            "incline_percent": 2,
        },
    ]
    response = client.post(
        "/api/workouts",
        json={
            "name": "Mixed sample",
            "workout_date": "2026-10-01",
            "category": "other",
            "movements": [
                {"exercise_id": strength["id"], "sets": [{"weight_kg": 80, "reps": 8}]},
                {
                    "exercise_id": cardio["id"],
                    "sets": [
                        *cardio_sets,
                        {"duration_seconds": 999, "calories_kcal": 999, "completed": False},
                    ],
                },
                {"exercise_id": second_cardio["id"], "sets": [{"duration_seconds": 600}]},
            ],
        },
    )
    assert response.status_code == 201, response.text
    originals = sorted(sessions(client), key=lambda item: item["activity_type"])
    for i, original in enumerate(originals):
        patched = client.patch(
            f"/api/cardio/{original['id']}/metrics",
            json={
                "average_power_watts": 150 + i * 25,
                "average_mets": 6.5 + i,
            },
        )
        assert patched.status_code == 200, patched.text
        originals[i] = patched.json()
    content, rows = export(client)
    assert len(rows) == 4  # No extra ledger rows and no unfinished sets.
    assert rows[0]["Duration (seconds)"] == rows[0]["Calories (kcal)"] == ""
    assert rows[1]["Calories (kcal)"] == "100"
    assert rows[2]["Calories (kcal)"] == "250"
    assert rows[1]["Cardio session calories (kcal)"] == "350"
    assert rows[3]["Calories (kcal)"] == ""
    assert upload(client, content).json()["workouts_skipped"] == 1
    imported = upload(other_client, content)
    assert imported.status_code == 201, imported.text
    restored = sorted(sessions(other_client), key=lambda item: item["activity_type"])
    assert len(restored) == 2
    for actual, expected in zip(restored, originals, strict=True):
        assert_metrics(actual, expected)
    movements = other_client.get("/api/workouts").json()[0]["movements"]
    assert len(movements) == 3
    for actual, expected in zip(movements[1]["sets"], cardio_sets, strict=True):
        for field, value in expected.items():
            assert actual[field] == value
    assert upload(other_client, export(other_client)[0]).json()["workouts_skipped"] == 1


@pytest.mark.parametrize(
    ("header", "value"),
    [
        ("Duration (seconds)", -1),
        ("Duration (seconds)", 172801),
        ("Duration (seconds)", 1.5),
        ("Distance (km)", "nan"),
        ("Distance (km)", "inf"),
        ("Distance (km)", 10001),
        ("Calories (kcal)", -1),
        ("Calories (kcal)", 100001),
        ("Calories (kcal)", 2.5),
        ("Average heart rate (bpm)", 19),
        ("Average heart rate (bpm)", 251),
        ("Speed (km/h)", 101),
        ("Incline (%)", -1),
        ("Average power (W)", 0),
        ("Average power (W)", 3001),
        ("Average METs", 0),
        ("Average METs", 51),
        ("Cardio session calories (kcal)", -1),
        ("Average speed (km/h)", "infinity"),
        ("Exercise kind", "unknown"),
    ],
)
def test_invalid_metrics_are_rejected_without_writes(client, header, value):
    row = {
        "Date Lifted": "2026-10-01",
        "Exercise": "Custom ergometer",
        "Exercise kind": "cardio",
        "Duration (seconds)": 600,
        header: value,
    }
    content = csv_content([row])
    for preview in (True, False):
        result = upload(client, content, preview=preview)
        assert result.status_code == 422, result.text
    assert client.get("/api/workouts").json() == []
    assert sessions(client) == []


@pytest.mark.parametrize(
    ("header", "value"),
    [("Calories (kcal)", "200"), ("Distance (km)", "5.123457"), ("Average METs", "6.750001")],
)
def test_different_cardio_values_are_not_silently_skipped(client, header, value):
    original = create_cardio(client)
    content, rows = export(client)
    rows[0][header] = value
    updated = csv_content(rows)
    assert upload(client, updated, preview=True).json()["workouts_to_create"] == 1
    assert upload(client, updated).json()["workouts_created"] == 1
    assert (
        next(item for item in sessions(client) if item["id"] == original["id"])["calories_kcal"]
        == 0
    )


def test_inconsistent_session_metrics_fail_preview_and_commit(client):
    row = {
        "Date Lifted": "2026-10-01",
        "Exercise": "Custom ergometer",
        "Exercise kind": "cardio",
        "Duration (seconds)": 600,
        "Cardio session calories (kcal)": 100,
    }
    content = csv_content([row, {**row, "Cardio session calories (kcal)": 200}])
    assert upload(client, content, preview=True).status_code == 422
    assert upload(client, content).status_code == 422
    assert client.get("/api/workouts").json() == []


@pytest.mark.parametrize(("kind", "duration"), [("cardio", 59), ("strength", 600)])
def test_session_metrics_cannot_be_silently_discarded(client, kind, duration):
    content = csv_content(
        [
            {
                "Date Lifted": "2026-10-01",
                "Exercise": "Custom ergometer",
                "Exercise kind": kind,
                "Duration (seconds)": duration,
                "Average power (W)": 175,
            }
        ]
    )
    for preview in (True, False):
        result = upload(client, content, preview=preview)
        assert result.status_code == 422, result.text
        assert "at least 60 seconds" in result.json()["error"]["message"]
    assert client.get("/api/workouts").json() == []
