from __future__ import annotations

import csv
from io import StringIO

import pytest


@pytest.fixture(params=["workouts", "body-measurements"])
def export_source(client, request):
    resource = request.param
    dates = ["2026-05-27", "2026-05-28", "2026-08-28", "2026-08-29"]
    if resource == "workouts":
        date_column = "Date Lifted"
        content = (
            "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
            "Bodyweight (lb),Percentile (%),Warmup\n"
        ) + "".join(f"{day},Barbell Bench Press,80,,8,,,,0\n" for day in dates)
    else:
        date_column = "Date"
        content = "Date,Weight (kg)\n" + "".join(f"{day},85\n" for day in dates)
    imported = client.post(
        f"/api/{resource}/import",
        files={"file": ("history.csv", content.encode(), "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    return f"/api/{resource}/export.csv", date_column, dates


def exported_dates(client, endpoint, date_column, params=None):
    response = client.get(endpoint, params=params)
    assert response.status_code == 200, response.text
    reader = csv.DictReader(StringIO(response.content.decode("utf-8-sig")))
    assert date_column in reader.fieldnames
    return [row[date_column] for row in reader]


def test_export_range_includes_both_boundaries_and_excludes_outside_dates(client, export_source):
    endpoint, date_column, _ = export_source
    assert exported_dates(
        client,
        endpoint,
        date_column,
        {"start_date": "2026-05-28", "end_date": "2026-08-28"},
    ) == ["2026-05-28", "2026-08-28"]


def test_all_time_export_keeps_full_history(client, export_source):
    endpoint, date_column, dates = export_source
    assert exported_dates(client, endpoint, date_column) == dates


def test_export_single_day_and_open_ended_ranges(client, export_source):
    endpoint, date_column, dates = export_source
    assert exported_dates(
        client,
        endpoint,
        date_column,
        {"start_date": "2026-08-28", "end_date": "2026-08-28"},
    ) == ["2026-08-28"]
    assert (
        exported_dates(
            client,
            endpoint,
            date_column,
            {"start_date": "2026-08-28"},
        )
        == dates[2:]
    )
    assert (
        exported_dates(
            client,
            endpoint,
            date_column,
            {"end_date": "2026-05-28"},
        )
        == dates[:2]
    )


def test_empty_export_range_preserves_csv_headers(client, export_source):
    endpoint, date_column, _ = export_source
    assert (
        exported_dates(
            client,
            endpoint,
            date_column,
            {"start_date": "2020-01-01", "end_date": "2020-02-01"},
        )
        == []
    )


@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "2026-08-29", "end_date": "2026-08-28"},
        {"start_date": "not-a-date"},
        {"end_date": "2026-02-30"},
    ],
)
def test_export_rejects_invalid_date_ranges(client, export_source, params):
    endpoint, _, _ = export_source
    assert client.get(endpoint, params=params).status_code == 422


def test_export_one_workout_keeps_other_sessions_on_that_day_out(client, other_client):
    content = (
        "Date Lifted,Exercise,Weight (kg),Reps,Warmup,Workout ID,Workout name\n"
        "2026-08-28,Barbell Bench Press,80,8,0,morning,Push AM\n"
        "2026-08-28,Barbell Bench Press,82.5,6,0,morning,Push AM\n"
        "2026-08-28,Barbell Squat,100,5,0,evening,Legs PM\n"
        "2026-08-29,Barbell Squat,105,5,0,next-day,Legs\n"
    )
    imported = client.post(
        "/api/workouts/import",
        files={"file": ("history.csv", content.encode(), "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    workouts = client.get("/api/workouts").json()
    morning = next(item for item in workouts if item["name"] == "Push AM")

    response = client.get("/api/workouts/export.csv", params={"workout_id": morning["id"]})

    assert response.status_code == 200, response.text
    assert 'filename="workout-2026-08-28.csv"' in response.headers["content-disposition"]
    rows = list(csv.DictReader(StringIO(response.content.decode("utf-8-sig"))))
    assert [(row["Workout name"], row["Weight (kg)"]) for row in rows] == [
        ("Push AM", "80"),
        ("Push AM", "82.5"),
    ]
    assert {row["Workout ID"] for row in rows} == {morning["id"]}
    # Another account cannot export it by ID.
    hidden = other_client.get("/api/workouts/export.csv", params={"workout_id": morning["id"]})
    assert hidden.status_code == 404
