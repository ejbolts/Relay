from datetime import date

import pytest

from app.cardio_energy import cardio_energy_periods, months_before
from app.models import CardioSession


def period(summaries, name="week"):
    return next(item for item in summaries if item["period"] == name)


def cardio_payload(**values):
    return {
        "session_date": date.today().isoformat(),
        "activity_type": "Cycling",
        "duration_minutes": 30,
        "zone": "Zone 3",
        **values,
    }


def test_record_edit_clear_and_delete_calories(client):
    response = client.post("/api/cardio", json=cardio_payload(calories_kcal=350))
    assert response.status_code == 201
    session = response.json()
    assert session["calories_kcal"] == 350
    client.post("/api/cardio", json=cardio_payload())
    overview = client.get("/api/cardio").json()
    week = period(overview["energy_periods"])
    assert (week["calories_kcal"], week["logged_sessions"], week["total_sessions"]) == (350, 1, 2)
    assert overview["current_week"]["completed_minutes"] == 0
    assert period(client.get("/api/dashboard").json()["cardio_energy_periods"]) == week
    assert (
        client.patch(
            f"/api/cardio/{session['id']}/calories", json={"calories_kcal": 770}
        ).status_code
        == 200
    )
    assert period(client.get("/api/cardio").json()["energy_periods"])["calories_kcal"] == 770
    # Older clients omitting the new field must not wipe recorded calories.
    updated = client.put(f"/api/cardio/{session['id']}", json=cardio_payload()).json()
    assert updated["calories_kcal"] == 770
    client.patch(f"/api/cardio/{session['id']}/calories", json={"calories_kcal": 0})
    assert period(client.get("/api/cardio").json()["energy_periods"])["logged_sessions"] == 1
    client.patch(f"/api/cardio/{session['id']}/calories", json={"calories_kcal": None})
    assert period(client.get("/api/cardio").json()["energy_periods"])["logged_sessions"] == 0
    client.patch(f"/api/cardio/{session['id']}/calories", json={"calories_kcal": 500})
    assert client.delete(f"/api/cardio/{session['id']}").status_code == 204
    assert period(client.get("/api/cardio").json()["energy_periods"])["calories_kcal"] == 0


def test_record_and_edit_cardio_performance_metrics(client):
    session = client.post(
        "/api/cardio",
        json=cardio_payload(
            calories_kcal=350,
            average_heart_rate_bpm=142,
            distance_km=5.25,
            average_speed_kph=10.5,
            incline_percent=6.5,
            average_mets=7.5,
        ),
    ).json()

    assert session["average_heart_rate_bpm"] == 142
    assert session["distance_km"] == 5.25
    assert session["average_speed_kph"] == 10.5
    assert session["incline_percent"] == 6.5
    assert session["average_mets"] == 7.5

    updated = client.patch(
        f"/api/cardio/{session['id']}/metrics",
        json={
            "calories_kcal": 400,
            "average_heart_rate_bpm": 145,
            "distance_km": 5.5,
            "average_speed_kph": 11,
            "incline_percent": None,
            "average_mets": 8.2,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["calories_kcal"] == 400
    assert updated.json()["average_heart_rate_bpm"] == 145
    assert updated.json()["distance_km"] == 5.5
    assert updated.json()["average_speed_kph"] == 11
    assert updated.json()["incline_percent"] is None
    assert updated.json()["average_mets"] == 8.2


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("average_heart_rate_bpm", 251),
        ("distance_km", -1),
        ("average_speed_kph", 101),
        ("incline_percent", 101),
        ("average_mets", 0),
        ("average_mets", 50.1),
    ],
)
def test_invalid_cardio_performance_metrics_are_rejected(client, field, value):
    assert client.post("/api/cardio", json=cardio_payload(**{field: value})).status_code == 422


@pytest.mark.parametrize("calories", [-1, 2.5, 100001, "not a number"])
def test_invalid_calories_are_rejected(client, calories):
    assert (
        client.post("/api/cardio", json=cardio_payload(calories_kcal=calories)).status_code == 422
    )
    session = client.post("/api/cardio", json=cardio_payload()).json()
    assert (
        client.patch(
            f"/api/cardio/{session['id']}/calories", json={"calories_kcal": calories}
        ).status_code
        == 422
    )


def test_calorie_edit_is_narrow_and_missing_session_is_not_found(client):
    assert (
        client.patch("/api/cardio/missing/calories", json={"calories_kcal": 50}).status_code == 404
    )
    session = client.post("/api/cardio", json=cardio_payload()).json()
    assert client.patch(f"/api/cardio/{session['id']}/calories", json={}).status_code == 422
    assert (
        client.patch(
            f"/api/cardio/{session['id']}/calories",
            json={"calories_kcal": 50, "duration_minutes": 10},
        ).status_code
        == 422
    )


def test_linked_calories_survive_workout_edits_and_reordering(client):
    exercises = [item for item in client.get("/api/exercises").json() if item["kind"] == "cardio"][
        :2
    ]
    payload = {
        "name": "Cardio mix",
        "workout_date": date.today().isoformat(),
        "category": "cardio",
        "movements": [
            {"exercise_id": item["id"], "sets": [{"duration_seconds": 1800, "completed": True}]}
            for item in exercises
        ],
    }
    created = client.post("/api/workouts", json=payload)
    assert created.status_code == 201
    workout_id = created.json()["id"]
    sessions = client.get("/api/cardio").json()["sessions"]
    for session in sessions:
        calories = 350 if session["activity_type"] == exercises[0]["name"] else 200
        assert (
            client.patch(
                f"/api/cardio/{session['id']}/calories", json={"calories_kcal": calories}
            ).status_code
            == 200
        )
    payload["movements"].reverse()
    payload["movements"][0]["sets"][0]["duration_seconds"] = 2100
    assert client.put(f"/api/workouts/{workout_id}", json=payload).status_code == 200
    sessions = client.get("/api/cardio").json()["sessions"]
    assert {s["activity_type"]: s["calories_kcal"] for s in sessions} == {
        exercises[0]["name"]: 350,
        exercises[1]["name"]: 200,
    }
    assert (
        period(client.get("/api/dashboard").json()["cardio_energy_periods"])["calories_kcal"] == 550
    )
    assert client.delete(f"/api/workouts/{workout_id}").status_code == 204
    assert period(client.get("/api/cardio").json()["energy_periods"])["calories_kcal"] == 0


def test_cardio_creation_with_exercise_retains_calories_after_sync(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["kind"] == "cardio"
    )
    session = client.post(
        "/api/cardio",
        json=cardio_payload(
            exercise_id=exercise["id"],
            calories_kcal=420,
            average_heart_rate_bpm=144,
            distance_km=5.2,
            average_speed_kph=10.4,
            incline_percent=7,
            average_mets=7.5,
            elevation_gain_m=210,
        ),
    ).json()
    assert session["calories_kcal"] == 420
    assert session["average_mets"] == 7.5
    workout = client.get(f"/api/workouts/{session['source_workout_id']}").json()
    assert workout["movements"][0]["sets"][0]["calories_kcal"] == 420
    assert workout["movements"][0]["sets"][0]["average_heart_rate_bpm"] == 144
    assert workout["movements"][0]["sets"][0]["distance_km"] == 5.2
    assert workout["movements"][0]["sets"][0]["speed_kph"] == 10.4
    assert workout["movements"][0]["sets"][0]["incline_percent"] == 7
    payload = {
        "name": workout["name"],
        "workout_date": workout["workout_date"],
        "category": "cardio",
        "movements": [
            {
                "exercise_id": exercise["id"],
                "sets": [
                    {
                        "duration_seconds": 1800,
                        "distance_km": 5.5,
                        "speed_kph": 11,
                        "incline_percent": 8,
                        "completed": True,
                    }
                ],
            }
        ],
    }
    assert client.put(f"/api/workouts/{workout['id']}", json=payload).status_code == 200
    synced = client.get("/api/cardio").json()["sessions"][0]
    assert synced["calories_kcal"] == 420
    assert synced["average_heart_rate_bpm"] == 144
    assert synced["distance_km"] == 5.5
    assert synced["average_speed_kph"] == 11
    assert synced["incline_percent"] == 8
    assert synced["average_mets"] == 7.5
    assert synced["elevation_gain_m"] == 210
    revision = client.get("/api/workouts/revision").json()["revision"]
    assert (
        client.patch(
            f"/api/cardio/{synced['id']}/metrics",
            json={
                "calories_kcal": 425,
                "average_heart_rate_bpm": 146,
                "distance_km": 5.75,
                "average_speed_kph": 11.5,
                "incline_percent": 9,
                "average_mets": 8.2,
            },
        ).status_code
        == 200
    )
    edited_workout = client.get(f"/api/workouts/{workout['id']}").json()
    edited_set = edited_workout["movements"][0]["sets"][0]
    assert edited_set["calories_kcal"] == 425
    assert edited_set["average_heart_rate_bpm"] == 146
    assert edited_set["distance_km"] == 5.75
    assert edited_set["speed_kph"] == 11.5
    assert edited_set["incline_percent"] == 9
    assert client.get("/api/cardio").json()["sessions"][0]["average_mets"] == 8.2
    assert client.get("/api/workouts/revision").json()["revision"] != revision


def test_cardio_metrics_entered_on_workout_sets_sync_to_cardio(client):
    exercise = next(
        item for item in client.get("/api/exercises").json() if item["kind"] == "cardio"
    )
    payload = {
        "name": "Scanned cardio",
        "workout_date": date.today().isoformat(),
        "category": "cardio",
        "duration_minutes": 30,
        "movements": [
            {
                "exercise_id": exercise["id"],
                "sets": [
                    {
                        "duration_seconds": 1800,
                        "distance_km": 5.2,
                        "speed_kph": 10.4,
                        "calories_kcal": 420,
                        "average_heart_rate_bpm": 144,
                        "completed": True,
                    }
                ],
            }
        ],
    }

    created = client.post("/api/workouts", json=payload)

    assert created.status_code == 201
    session = client.get("/api/cardio").json()["sessions"][0]
    assert session["calories_kcal"] == 420
    assert session["average_heart_rate_bpm"] == 144
    assert session["distance_km"] == 5.2
    assert session["average_speed_kph"] == 10.4


def test_periods_use_today_not_latest_session_and_respect_week_start():
    today = date(2026, 9, 6)  # Sunday.
    sessions = [
        CardioSession(session_date=date.fromisoformat(day), calories_kcal=kcal)
        for day, kcal in [
            ("2026-09-06", 100),
            ("2026-09-05", 200),
            ("2026-08-31", 300),
            ("2026-08-30", 400),
            ("2026-06-06", 500),
            ("2026-06-05", 600),
            ("2026-09-07", 9000),
            ("2025-01-01", 700),
            ("2026-09-02", None),
        ]
    ]
    summaries = [item.model_dump() for item in cardio_energy_periods(sessions, today, "monday")]
    assert period(summaries)["calories_kcal"] == 600
    assert period(summaries)["logged_sessions"] == 3
    assert period(summaries)["total_sessions"] == 4
    assert period(summaries, "month")["calories_kcal"] == 300
    assert period(summaries, "3m")["calories_kcal"] == 1500
    assert period(summaries, "6m")["calories_kcal"] == 2100
    assert period(summaries, "year")["calories_kcal"] == 2100
    assert period(summaries, "all")["calories_kcal"] == 2800
    sunday = cardio_energy_periods(sessions, today, "sunday")[0]
    assert sunday.calories_kcal == 100
    saturday = cardio_energy_periods(sessions, today, "saturday")[0]
    assert saturday.calories_kcal == 300
    assert months_before(date(2024, 5, 31), 3) == date(2024, 2, 29)
    assert months_before(date(2025, 5, 31), 3) == date(2025, 2, 28)


def test_periods_compare_weighted_cardio_performance_with_prior_period():
    today = date(2026, 9, 7)  # Monday.
    sessions = [
        CardioSession(
            session_date=today,
            duration_minutes=30,
            calories_kcal=300,
            average_heart_rate_bpm=140,
            distance_km=5,
            average_speed_kph=10,
            incline_percent=5,
            average_mets=6,
        ),
        CardioSession(
            session_date=today,
            duration_minutes=60,
            calories_kcal=600,
            average_heart_rate_bpm=150,
            distance_km=8,
            average_speed_kph=8,
            incline_percent=10,
            average_mets=9,
        ),
        CardioSession(
            session_date=date(2026, 9, 6),
            duration_minutes=45,
            calories_kcal=400,
            average_heart_rate_bpm=130,
            distance_km=4,
            average_speed_kph=7,
            incline_percent=2,
            average_mets=4,
        ),
    ]

    week = cardio_energy_periods(sessions, today, "monday")[0]

    assert week.calories_kcal == 900
    assert week.previous_calories_kcal == 400
    assert week.average_heart_rate_bpm == 146.7
    assert week.previous_average_heart_rate_bpm == 130
    assert week.distance_km == 13
    assert week.previous_distance_km == 4
    assert week.average_speed_kph == 8.7
    assert week.average_incline_percent == 8.3
    assert week.average_mets == 8
    assert week.met_minutes == 720
    assert week.previous_average_mets == 4
    assert week.previous_met_minutes == 180
    assert week.mets_sessions == 2
    # No elevation was logged, so each session's climb comes from its incline and distance.
    assert (week.elevation_gain_m, week.elevation_sessions) == (1046, 2)
    assert week.previous_elevation_gain_m == 80
    assert week.heart_rate_sessions == week.distance_sessions == 2
    assert week.previous_start_date == date(2026, 8, 31)
    assert week.previous_end_date == date(2026, 9, 6)


def test_empty_and_future_only_periods_are_empty():
    today = date(2026, 9, 6)
    for sessions in [[], [CardioSession(session_date=date(2026, 10, 1), calories_kcal=100)]]:
        summaries = cardio_energy_periods(sessions, today, "monday")
        assert all(
            item.total_sessions == item.logged_sessions == item.calories_kcal == 0
            for item in summaries
        )
        assert all(item.start_date <= item.end_date for item in summaries)
