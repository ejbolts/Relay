import csv
import io
from datetime import date
from types import SimpleNamespace

import pytest

from app.body_measurement_csv import export_body_measurements, parse_body_measurement_rows
from app.csv_text import TEXT_ENCODING_HEADER, encode_text
from app.tracker_csv import export_workouts, parse_rows


@pytest.mark.parametrize(
    "text", ["=1+1", "+1+1", "-1+1", "@SUM(1)", "  =1+1", "\t=1+1", "'literal"]
)
def test_spreadsheet_safe_notes_round_trip(text):
    item = SimpleNamespace(
        measurement_date=date(2026, 11, 1), weight_kg=80, body_fat_pct=None, notes=text
    )
    output = export_body_measurements([item])
    row = next(csv.DictReader(io.StringIO(output)))
    assert row["Notes"].startswith("'")
    assert TEXT_ENCODING_HEADER in row
    # Bodyweight import has always trimmed surrounding whitespace.
    assert parse_body_measurement_rows(output.encode())[0].notes == text.strip()


def test_workout_names_and_exercises_round_trip_without_formula_cells():
    item = SimpleNamespace(
        order_index=0,
        weight_kg=40,
        reps=8,
        bodyweight_kg=None,
        percentile=None,
        warmup=False,
        completed=True,
    )
    movement = SimpleNamespace(order_index=0, exercise=SimpleNamespace(name="=1+1"), sets=[item])
    workout = SimpleNamespace(
        id="session-id",
        workout_date=date(2026, 11, 1),
        name="'literal",
        workout_type=None,
        movements=[movement],
    )
    output = export_workouts([workout])
    row = next(csv.DictReader(io.StringIO(output)))
    assert row["Exercise"] == "'=1+1"
    assert row["Workout name"] == "''literal"
    parsed, warnings = parse_rows(output.encode())
    assert not warnings
    assert parsed[0].exercise_name == "=1+1"
    assert parsed[0].session_name == "'literal"


def test_legacy_csv_apostrophes_are_not_removed():
    raw = b"Date,Weight (kg),Notes\n2026-11-01,80,'literal\n"
    assert parse_body_measurement_rows(raw)[0].notes == "'literal"
    assert encode_text("ordinary notes") == "ordinary notes"
