import importlib.util
from datetime import date, timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.cardio_estimates import estimate_elevation_gain_m, estimate_mets
from app.cardio_ocr import OcrLine, parse_cardio_ocr


def mets(activity, **values):
    return estimate_mets(activity=activity, duration_minutes=30, **values)


@pytest.mark.parametrize(
    ("activity", "values", "expected"),
    [
        # ACSM walking: 3.5 + 0.1 × m/min + 1.8 × m/min × grade.
        ("Walking", {"speed_kph": 5}, 3.4),
        ("Incline Treadmill Walking", {"speed_kph": 5, "incline_percent": 12}, 8.5),
        # Speed from distance and time when no average speed was logged.
        ("Incline Treadmill Walking", {"distance_km": 2.5, "incline_percent": 12}, 8.5),
        # Outdoor grade from elevation gain over distance.
        ("Hiking", {"distance_km": 2.5, "elevation_gain_m": 300}, 8.5),
        # ACSM running: 3.5 + 0.2 × m/min + 0.9 × m/min × grade.
        ("Running", {"speed_kph": 10}, 10.5),
        ("Treadmill", {"speed_kph": 10, "incline_percent": 2}, 11.4),
        # ACSM leg cycling from power and body weight.
        ("Cycling", {"power_watts": 150, "body_weight_kg": 75}, 8.3),
        # Active calories exclude the 1 MET spent at rest.
        ("Cycling", {"calories_kcal": 300, "body_weight_kg": 80}, 8.5),
        ("Custom ergometer", {"calories_kcal": 300, "body_weight_kg": 80}, 8.5),
        # Typical values when nothing was measured.
        ("Cycling", {"power_watts": 150}, 7.0),
        ("Rowing", {}, 7.0),
        ("Running", {}, 9.8),
        ("Stair climber", {}, 9.0),
        ("Custom ergometer", {}, None),
        ("Custom ergometer", {"calories_kcal": 300}, None),
    ],
)
def test_met_estimates_follow_the_best_available_measurement(activity, values, expected):
    assert mets(activity, **values) == expected


def test_met_estimates_stay_in_a_plausible_range():
    assert mets("Running", speed_kph=29, incline_percent=30) == 25
    assert mets("Yoga flow", calories_kcal=1, body_weight_kg=500) == 1
    # An implausible speed is ignored rather than extrapolated.
    assert mets("Walking", speed_kph=60) == 3.5


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ({"distance_km": 2, "incline_percent": 12}, 238),
        ({"speed_kph": 6, "incline_percent": 10}, 299),
        ({"distance_km": 2, "incline_percent": 0}, 0),
        ({"distance_km": 2}, None),
        ({"incline_percent": 12}, None),
    ],
)
def test_elevation_estimates_need_incline_and_distance(values, expected):
    assert estimate_elevation_gain_m(duration_minutes=30, **values) == expected


def cardio_payload(**values):
    return {
        "session_date": date.today().isoformat(),
        "activity_type": "Incline treadmill walking",
        "duration_minutes": 30,
        **values,
    }


def week(client, source="cardio"):
    data = client.get(f"/api/{source}").json()
    periods = data["energy_periods" if source == "cardio" else "cardio_energy_periods"]
    return next(item for item in periods if item["period"] == "week")


def test_blank_met_and_elevation_are_estimated_and_logged_values_win(client):
    session = client.post(
        "/api/cardio",
        json=cardio_payload(average_speed_kph=5, incline_percent=12, distance_km=2.5),
    ).json()
    assert session["average_mets"] is None and session["elevation_gain_m"] is None
    assert session["estimated_mets"] == 8.5
    assert session["estimated_elevation_gain_m"] == 298

    period = week(client)
    assert (period["average_mets"], period["mets_sessions"]) == (8.5, 1)
    assert (period["elevation_gain_m"], period["elevation_sessions"]) == (298, 1)
    assert period["met_minutes"] == 255
    assert week(client, "dashboard") == period

    logged = client.patch(
        f"/api/cardio/{session['id']}/metrics",
        json={"average_mets": 6, "elevation_gain_m": 120.5},
    ).json()
    assert (logged["average_mets"], logged["elevation_gain_m"]) == (6, 120.5)
    assert logged["estimated_mets"] == 8.5
    period = week(client)
    assert (period["average_mets"], period["elevation_gain_m"]) == (6, 120.5)

    # An app release that predates elevation gain omits it and must not clear it.
    kept = client.put(
        f"/api/cardio/{session['id']}",
        json=cardio_payload(average_speed_kph=5, incline_percent=12, distance_km=2.5),
    ).json()
    assert kept["elevation_gain_m"] == 120.5
    cleared = client.put(
        f"/api/cardio/{session['id']}", json=cardio_payload(elevation_gain_m=None)
    ).json()
    assert cleared["elevation_gain_m"] is None


@pytest.mark.parametrize("elevation", [-1, 30_001])
def test_invalid_elevation_gain_is_rejected(client, elevation):
    response = client.post("/api/cardio", json=cardio_payload(elevation_gain_m=elevation))
    assert response.status_code == 422


def test_calorie_estimates_use_the_body_weight_nearest_the_session(client):
    today = date.today()
    for days_ago, weight in ((40, 100), (10, 80)):
        created = client.post(
            "/api/body-measurements",
            json={
                "measurement_date": (today - timedelta(days=days_ago)).isoformat(),
                "weight_kg": weight,
            },
        )
        assert created.status_code in (200, 201), created.text

    def estimate(days_ago):
        response = client.post(
            "/api/cardio",
            json=cardio_payload(
                activity_type="Custom ergometer",
                session_date=(today - timedelta(days=days_ago)).isoformat(),
                calories_kcal=300,
            ),
        )
        assert response.status_code == 201, response.text
        return response.json()["estimated_mets"]

    assert estimate(0) == 8.5  # latest weigh-in, 80 kg
    assert estimate(20) == 7  # the weigh-in before the session, 100 kg
    assert estimate(60) == 7  # before any weigh-in: the first one
    sessions = client.get("/api/cardio").json()["sessions"]
    assert sorted(item["estimated_mets"] for item in sessions) == [7, 7, 8.5]


def line(text_value, top):
    return OcrLine(text=text_value, confidence=0.99, left=40, top=top, right=400, bottom=top + 30)


@pytest.mark.parametrize(
    ("value", "expected"),
    [("Elevation Gain 1,234 m", 1234), ("Elevation Gain 400 ft", 121.9)],
)
def test_screenshot_scan_reads_elevation_gain(value, expected):
    parsed = parse_cardio_ocr([line("Workout Time 0:30:00", 0), line(value, 60)])
    assert parsed["elevation_gain_m"] == expected
    assert "elevation gain" in parsed["fields_found"]


def test_upgrade_adds_validated_elevation_gain_and_preserves_sessions():
    path = Path(__file__).parents[1] / "migrations/versions/0060_cardio_elevation_gain.py"
    spec = importlib.util.spec_from_file_location("cardio_elevation_gain_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE cardio_sessions (id TEXT PRIMARY KEY, activity_type TEXT)")
        )
        connection.execute(text("INSERT INTO cardio_sessions VALUES ('existing', 'Walking')"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        assert connection.execute(
            text("SELECT activity_type, elevation_gain_m FROM cardio_sessions")
        ).one() == ("Walking", None)
        connection.execute(text("UPDATE cardio_sessions SET elevation_gain_m = 0"))
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE cardio_sessions SET elevation_gain_m = -1"))
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE cardio_sessions SET elevation_gain_m = 30001"))

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()

        columns = {column["name"] for column in inspect(connection).get_columns("cardio_sessions")}
        assert columns == {"id", "activity_type"}
        assert connection.scalar(text("SELECT COUNT(*) FROM cardio_sessions")) == 1
