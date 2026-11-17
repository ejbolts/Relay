from __future__ import annotations

import re
from datetime import date, timedelta

from test_auth import named, upload_photo
from test_cardio_energy import cardio_payload

from app.account_limits import (
    CARDIO_NOT_SAVED,
    EXERCISE_NOT_CREATED,
    IMPORT_NOT_SAVED,
    PHOTO_NOT_UPLOADED,
    TRY_AGAIN_SOON,
    WORKOUT_NOT_SAVED,
    AccountLimits,
    SaveRateLimiter,
)


def set_limits(admin_client, **values) -> dict:
    current = admin_client.get("/api/admin/limits").json()["values"]
    response = admin_client.put("/api/admin/limits", json={**current, **values})
    assert response.status_code == 200, response.text
    return response.json()["values"]


def strength_ids(test_client, count: int) -> list[str]:
    exercises = test_client.get("/api/exercises").json()
    return [item["id"] for item in exercises if item["kind"] == "strength"][:count]


def workout(exercise_ids: str | list[str], *, sets: int = 1, **fields) -> dict:
    """A workout with each exercise once (an exercise can only appear once per workout)."""
    if isinstance(exercise_ids, str):
        exercise_ids = [exercise_ids]
    set_notes = fields.pop("set_notes", None)
    return {
        "name": "Session",
        "workout_date": date.today().isoformat(),
        "category": "push",
        "notes": fields.pop("notes", None),
        "movements": [
            {
                "exercise_id": exercise_id,
                "sets": [
                    {"reps": 5, "weight_kg": 50, "completed": True, "notes": set_notes}
                    for _ in range(sets)
                ],
            }
            for exercise_id in exercise_ids
        ],
    }


def assert_refused_quietly(response, message: str, status: int = 422) -> None:
    """Refusals read like any failed save: no mention of a limit or a number."""
    assert response.status_code == status, response.text
    error = response.json()["error"]
    assert error == {"code": "not_saved", "message": message}
    assert "limit" not in response.text.lower()
    assert not re.search(r"\d", error["message"])


def test_admin_sees_and_changes_the_limits_and_others_cannot(client, other_client):
    limits = client.get("/api/admin/limits").json()
    assert limits["values"] == limits["defaults"] == AccountLimits().model_dump()
    assert limits["values"]["photo_upload_megabytes"] == 5
    assert limits["bounds"]["exercises_per_workout"] == {"minimum": 1, "maximum": 100}

    assert set_limits(client, sets_per_workout=80)["sets_per_workout"] == 80
    assert client.get("/api/admin/limits").json()["values"]["sets_per_workout"] == 80

    too_high = {**limits["values"], "exercises_per_workout": 101}
    assert client.put("/api/admin/limits", json=too_high).status_code == 422
    assert other_client.get("/api/admin/limits").status_code == 403
    assert other_client.put("/api/admin/limits", json=limits["values"]).status_code == 403


def test_workout_size_and_total_limits_are_hidden(client, other_client):
    set_limits(
        client,
        workouts_per_account=2,
        exercises_per_workout=2,
        sets_per_workout=3,
        set_note_characters=5,
    )
    ids = strength_ids(other_client, 3)
    bench = ids[0]

    for attempt in (
        workout(ids),
        workout(ids[:2], sets=2),
        workout(bench, set_notes="far too long"),
    ):
        assert_refused_quietly(other_client.post("/api/workouts", json=attempt), WORKOUT_NOT_SAVED)

    for _ in range(2):
        assert other_client.post("/api/workouts", json=workout(bench, sets=3)).status_code == 201
    assert_refused_quietly(
        other_client.post("/api/workouts", json=workout(bench)), WORKOUT_NOT_SAVED
    )
    assert len(other_client.get("/api/workouts").json()) == 2

    # The account total does not apply to admins; the size of a workout does.
    admin_bench = named(client, "Barbell Bench Press")["id"]
    for _ in range(3):
        assert client.post("/api/workouts", json=workout(admin_bench)).status_code == 201
    assert_refused_quietly(
        client.post("/api/workouts", json=workout(admin_bench, sets=4)), WORKOUT_NOT_SAVED
    )


def test_a_workout_saved_before_a_limit_was_lowered_can_still_be_edited(client, other_client):
    bench = named(other_client, "Barbell Bench Press")["id"]
    saved = other_client.post("/api/workouts", json=workout(bench, sets=4, notes="x" * 40))
    assert saved.status_code == 201
    set_limits(client, sets_per_workout=2, workout_note_characters=10)

    unchanged = workout(bench, sets=4, notes="x" * 40)
    assert (
        other_client.put(f"/api/workouts/{saved.json()['id']}", json=unchanged).status_code == 200
    )
    grown = workout(bench, sets=5, notes="x" * 40)
    assert_refused_quietly(
        other_client.put(f"/api/workouts/{saved.json()['id']}", json=grown), WORKOUT_NOT_SAVED
    )


def test_custom_exercise_limit(client, other_client):
    set_limits(client, custom_exercises_per_account=1)

    def create(name: str):
        return other_client.post(
            "/api/exercises",
            json={"name": name, "category": "push", "kind": "strength", "muscle_group": "Chest"},
        )

    assert create("Cable fly variation").status_code == 201
    assert_refused_quietly(create("Another fly variation"), EXERCISE_NOT_CREATED)


def test_photo_count_and_upload_size_limits(client, other_client):
    set_limits(client, photos_per_account=1, photo_upload_megabytes=1)
    leg_press = named(other_client, "Leg Press")["id"]

    assert upload_photo(other_client, leg_press).status_code == 201
    assert_refused_quietly(upload_photo(other_client, leg_press), PHOTO_NOT_UPLOADED)
    # The admin is not held to the photo count, but is held to the upload size.
    admin_leg_press = named(client, "Leg Press")["id"]
    for _ in range(2):
        assert upload_photo(client, admin_leg_press).status_code == 201
    oversized = client.post(
        f"/api/exercises/{admin_leg_press}/machine-photos",
        data={"caption": "Big"},
        files={"file": ("big.jpg", b"\xff" * (1024 * 1024 + 1), "image/jpeg")},
    )
    # The upload size is the one limit people are told about.
    assert oversized.status_code == 413
    assert oversized.json()["error"] == {
        "code": "photo_too_large",
        "message": "Photos can be up to 1 MB.",
    }


def test_cardio_session_limit(client, other_client):
    set_limits(client, cardio_sessions_per_account=1)

    assert other_client.post("/api/cardio", json=cardio_payload()).status_code == 201
    assert_refused_quietly(
        other_client.post("/api/cardio", json=cardio_payload()), CARDIO_NOT_SAVED
    )


def csv_file(days: int, sets_per_day: int = 1, exercise: str = "Barbell Bench Press") -> tuple:
    header = "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
    header += "Bodyweight (lb),Percentile (%),Warmup\n"
    start = date.today() - timedelta(days=days)
    rows = "".join(
        f"{(start + timedelta(days=day)).isoformat()},{exercise},50,,5,,,,FALSE\n"
        for day in range(days)
        for _ in range(sets_per_day)
    )
    return ("workouts.csv", (header + rows).encode(), "text/csv")


def test_csv_imports_follow_the_same_limits_and_save_nothing_when_refused(client, other_client):
    set_limits(client, workouts_per_account=2, sets_per_workout=3, custom_exercises_per_account=1)

    def imported(file):
        return other_client.post("/api/workouts/import", files={"file": file})

    assert_refused_quietly(imported(csv_file(days=3)), IMPORT_NOT_SAVED)
    assert_refused_quietly(imported(csv_file(days=1, sets_per_day=4)), IMPORT_NOT_SAVED)
    assert other_client.get("/api/workouts").json() == []

    assert imported(csv_file(days=2, sets_per_day=3)).status_code == 201
    assert len(other_client.get("/api/workouts").json()) == 2


def test_csv_import_cannot_create_more_custom_exercises_than_allowed(client, other_client):
    set_limits(client, custom_exercises_per_account=1)
    response = other_client.post(
        "/api/workouts/import",
        files={"file": csv_file(days=1, exercise="Brand new movement")},
    )
    assert response.status_code == 201
    second = other_client.post(
        "/api/workouts/import",
        files={"file": csv_file(days=1, exercise="Another new movement")},
    )
    assert_refused_quietly(second, IMPORT_NOT_SAVED)


def test_changes_are_rate_limited_per_account_but_reading_and_admins_are_not(client, other_client):
    set_limits(client, saves_per_minute=2)
    bench = named(other_client, "Barbell Bench Press")["id"]

    def favorite(test_client, exercise_id):
        return test_client.patch(
            f"/api/exercises/{exercise_id}/favorite", json={"is_favorite": True}
        )

    assert favorite(other_client, bench).status_code == 200
    assert favorite(other_client, bench).status_code == 200
    assert_refused_quietly(favorite(other_client, bench), TRY_AGAIN_SOON, status=429)
    assert other_client.get("/api/exercises").status_code == 200
    admin_bench = named(client, "Barbell Bench Press")["id"]
    for _ in range(4):
        assert favorite(client, admin_bench).status_code == 200


def test_rate_limiter_counts_the_last_minute_only():
    limiter = SaveRateLimiter()
    assert limiter.allow("a", 2, now=0) and limiter.allow("a", 2, now=1)
    assert not limiter.allow("a", 2, now=59)
    assert limiter.allow("b", 2, now=59)
    assert limiter.allow("a", 2, now=60.5)
