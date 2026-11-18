from __future__ import annotations

import importlib.util
import re
from datetime import date, timedelta
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text, update
from test_auth import named
from test_sharing import befriend, profile, share

from app.database import SessionLocal
from app.models import TrainingWorkout, User
from app.profile_borders import BORDERS, METRICS, border_stats, longest_run, plates

BENCH, SQUAT, DEADLIFT = "Barbell Bench Press", "Back Squat", "Deadlift"


def workout(
    test_client: TestClient,
    day: date | str,
    exercise: str = BENCH,
    sets: list[dict] | None = None,
    **fields,
) -> dict:
    response = test_client.post(
        "/api/workouts",
        json={
            "name": "Border session",
            "workout_date": str(day),
            "category": "push",
            "movements": [
                {
                    "exercise_id": named(test_client, exercise)["id"],
                    "sets": sets or [{"weight_kg": 40, "reps": 8}],
                }
            ],
            **fields,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def cardio(test_client: TestClient, day: date | str, minutes: int = 30, **fields) -> None:
    response = test_client.post(
        "/api/cardio",
        json={
            "session_date": str(day),
            "activity_type": "Run",
            "duration_minutes": minutes,
            **fields,
        },
    )
    assert response.status_code == 201, response.text


def weigh_in(test_client: TestClient, day: date | str, weight_kg: float = 80) -> None:
    response = test_client.post(
        "/api/body-measurements", json={"measurement_date": str(day), "weight_kg": weight_kg}
    )
    assert response.status_code == 200, response.text


def set_sex(test_client: TestClient, sex: str):
    return test_client.patch("/api/profile", json={"sex": sex})


def borders(test_client: TestClient) -> dict[str, dict]:
    response = test_client.get("/api/profile/borders")
    assert response.status_code == 200, response.text
    return {item["key"]: item for item in response.json()["borders"]}


def wear(test_client: TestClient, key: str | None):
    return test_client.put("/api/profile/border", json={"border": key})


def stats(test_client: TestClient, today: date | None = None) -> dict[str, float]:
    with SessionLocal() as db:
        return border_stats(db, db.get(User, test_client.user["id"]), today)


def test_every_border_has_one_key_and_a_known_metric():
    assert len({border.key for border in BORDERS}) == len(BORDERS)
    assert all(border.metric in METRICS for border in BORDERS)
    by_sex = {border.family or border.key for border in BORDERS if isinstance(border.target, tuple)}
    assert by_sex == {"pound-for-pound", "bench", "squat", "deadlift", "big-three"}


RARITY_ORDER = ["common", "rare", "epic", "legendary"]


def test_each_family_climbs_in_target_and_rarity_from_tier_one():
    families: dict[str, list] = {}
    for border in BORDERS:
        if border.family:
            families.setdefault(border.family, []).append(border)
    assert len(families) == 9
    for family, tiers in families.items():
        assert [border.tier for border in tiers] == list(range(1, len(tiers) + 1)), family
        assert len({border.metric for border in tiers}) == 1, family
        targets = [
            border.target if isinstance(border.target, tuple) else (border.target,)
            for border in tiers
        ]
        for lower, higher in zip(targets, targets[1:], strict=False):
            assert all(a < b for a, b in zip(lower, higher, strict=True)), family
        ranks = [RARITY_ORDER.index(border.rarity) for border in tiers]
        assert ranks == sorted(ranks) and ranks[-1] > ranks[0], family


def test_plates_count_twenty_kilo_plates_a_side_on_a_twenty_kilo_bar():
    assert [plates(weight) for weight in (60, 100, 140, 180, 220)] == [1, 2, 3, 4, 5]
    assert plates(20) is None and plates(40) is None and plates(80) is None


def test_longest_run_counts_evenly_spaced_dates():
    day = date(2026, 3, 2)
    assert longest_run([]) == 0
    assert longest_run([day, day, day + timedelta(days=1), day + timedelta(days=3)]) == 2
    mondays = [day, day + timedelta(days=7), day + timedelta(days=21)]
    assert longest_run(mondays, 7) == 2


def test_sex_is_chosen_once_and_then_locked(client):
    assert client.get("/api/auth/me").json()["sex"] is None
    assert set_sex(client, "other").status_code == 422

    chosen = set_sex(client, "female")
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["sex"] == "female"

    # Saving the rest of the profile, or the same answer again, still works.
    assert client.patch("/api/profile", json={"display_name": "Renamed"}).json()["sex"] == "female"
    assert set_sex(client, "female").status_code == 200

    changed = set_sex(client, "male")
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "sex_locked"
    assert client.get("/api/auth/me").json()["sex"] == "female"


def test_a_new_account_has_no_progress_because_sample_workouts_never_count(client):
    with SessionLocal() as db:
        db.execute(update(TrainingWorkout).values(is_sample=True))
        db.commit()
    workout(client, "2026-01-05")
    with SessionLocal() as db:
        db.execute(update(TrainingWorkout).values(is_sample=True))
        db.commit()

    listed = borders(client)
    assert len(listed) == len(BORDERS)
    assert not any(item["unlocked"] for item in listed.values())
    assert listed["first-steps"]["progress"] == {"current": 0, "target": 5, "unit": "workouts"}
    assert listed["first-steps"]["requirement"] == "Log 5 workouts"
    assert listed["first-steps"]["group"] == "Consistency"
    assert listed["everest"]["rarity"] == "legendary"


def test_a_border_is_worn_only_once_it_is_earned(client):
    assert wear(client, "first-steps").status_code == 403
    assert wear(client, "first-steps").json()["error"]["code"] == "border_locked"
    assert wear(client, "no-such-border").status_code == 404

    for offset in range(5):
        workout(client, date(2026, 1, 5) + timedelta(days=offset * 2))
    assert borders(client)["first-steps"]["unlocked"] is True
    assert borders(client)["centurion"]["progress"]["current"] == 5

    worn = wear(client, "first-steps")
    assert worn.status_code == 200, worn.text
    assert worn.json()["profile_border"] == "first-steps"
    assert worn.json()["profile_border_name"] == "First Steps"
    assert client.get("/api/auth/me").json()["profile_border"] == "first-steps"
    assert client.get("/api/profile/borders").json()["selected"] == "first-steps"

    assert wear(client, "centurion").status_code == 403
    assert client.get("/api/auth/me").json()["profile_border"] == "first-steps"
    assert wear(client, None).json()["profile_border"] is None


def test_strength_borders_use_the_standard_for_the_accounts_sex(client, other_client):
    for lifter in (client, other_client):
        workout(lifter, "2026-01-05", BENCH, [{"weight_kg": 50, "reps": 3}])

    waiting = borders(client)["bench-club-1"]
    assert waiting["needs_sex"] is True and waiting["progress"] is None
    assert waiting["requirement"] == "Bench press 60 kg · 1 plate (men) or 40 kg (women)"
    assert waiting["unlocked"] is False
    assert (waiting["family"], waiting["tier"]) == ("bench", 1)
    assert wear(client, "bench-club-1").status_code == 403

    assert set_sex(client, "female").status_code == 200
    assert set_sex(other_client, "male").status_code == 200
    hers, his = borders(client), borders(other_client)
    assert hers["bench-club-1"]["requirement"] == "Bench press 40 kg"
    assert hers["bench-club-1"]["unlocked"] is True
    assert hers["bench-club-1"]["progress"] == {"current": 50, "target": 40, "unit": "kg"}
    assert hers["bench-club-2"]["requirement"] == "Bench press 60 kg · 1 plate"
    assert hers["bench-club-2"]["unlocked"] is False
    assert his["bench-club-1"]["requirement"] == "Bench press 60 kg · 1 plate"
    assert his["bench-club-1"]["unlocked"] is False
    assert his["bench-club-1"]["progress"] == {"current": 50, "target": 60, "unit": "kg"}
    assert wear(client, "bench-club-1").status_code == 200
    assert wear(client, "bench-club-2").status_code == 403
    assert wear(other_client, "bench-club-1").status_code == 403


def test_strength_borders_read_working_sets_of_the_barbell_lifts(client):
    set_sex(client, "male")
    weigh_in(client, "2026-01-01", 80)
    workout(
        client,
        "2026-01-05",
        BENCH,
        [
            {"weight_kg": 120, "reps": 5, "set_type": "warmup"},
            {"weight_kg": 110, "reps": 0, "failed": True},
            {"weight_kg": 84, "reps": 5},
        ],
    )
    workout(client, "2026-01-06", "Dumbbell Bench Press", [{"weight_kg": 150, "reps": 1}])
    workout(client, "2026-01-07", SQUAT, [{"weight_kg": 140, "reps": 1}])
    workout(client, "2026-01-08", DEADLIFT, [{"weight_kg": 180, "reps": 2}])

    numbers = stats(client)
    assert numbers["bench_kg"] == 84
    assert numbers["squat_kg"] == 140
    assert numbers["deadlift_kg"] == 180
    assert numbers["big_three_kg"] == 404
    assert numbers["bench_body_weight_pct"] == 105
    # 84 x 5, 150 x 1, 140 x 1 and 180 x 2: warm-ups and failed sets add nothing.
    assert numbers["tonnes"] == (420 + 150 + 140 + 360) / 1000

    listed = borders(client)
    earned = {key for key, item in listed.items() if item["unlocked"]}
    # Men: bench 60 / 100, squat 100 / 140 / 180, deadlift 140 / 180 / 220, total 300 / 400 / 454.
    assert {"bench-club-1", "squat-club-1", "squat-club-2"} <= earned
    assert {"deadlift-club-1", "deadlift-club-2", "big-three-1", "big-three-2"} <= earned
    assert not earned & {"bench-club-2", "squat-club-3", "deadlift-club-3", "big-three-3"}
    assert listed["pound-for-pound"]["unlocked"]
    assert listed["deadlift-club-3"]["requirement"] == "Deadlift 220 kg · 5 plates"
    assert listed["big-three-3"]["requirement"] == (
        "Total 454 kg across your best bench, squat and deadlift"
    )
    assert listed["pound-for-pound"]["requirement"] == "Bench press 100% of your body weight"


def test_weight_targets_are_shown_in_the_accounts_unit(client):
    set_sex(client, "male")
    saved = client.put(
        "/api/training-preferences",
        json={"preferred_weight_unit": "lb", "week_start": "monday", "zone2_goal_minutes": 150},
    )
    assert saved.status_code == 200, saved.text
    workout(client, "2026-01-05", BENCH, [{"weight_kg": 100, "reps": 1}])

    bench = borders(client)["bench-club-2"]
    assert bench["requirement"] == "Bench press 220 lb · 2 plates"
    assert bench["progress"] == {"current": 220.5, "target": 220, "unit": "lb"}
    assert bench["unlocked"] is True


def test_a_log_streak_joins_workouts_cardio_and_weigh_ins(client):
    start = date(2026, 2, 2)
    workout(client, start)
    cardio(client, start + timedelta(days=1))
    for offset in range(2, 6):
        weigh_in(client, start + timedelta(days=offset))
    assert stats(client)["log_streak"] == 6
    assert not borders(client)["seven-straight"]["unlocked"]

    cardio(client, start + timedelta(days=6))
    assert borders(client)["seven-straight"]["unlocked"]
    # A later, shorter run does not lower the best one.
    workout(client, start + timedelta(days=20))
    assert stats(client)["log_streak"] == 7


def test_schedule_borders_count_mondays_weeks_months_and_start_times(client):
    monday = date(2025, 1, 6)
    for week in range(3):
        for offset in (0, 2, 4):
            workout(client, monday + timedelta(weeks=week, days=offset))
    # The fourth week has a Monday session only, which ends the three-a-week run.
    workout(client, monday + timedelta(weeks=3), start_time="06:10", end_time="07:00")
    workout(client, monday + timedelta(weeks=5), start_time="21:30", end_time="22:15")
    workout(client, monday + timedelta(weeks=5, days=1), start_time="00:20", end_time="01:00")
    workout(client, date(2025, 6, 10), start_time="12:00", end_time="13:00")

    numbers = stats(client)
    assert numbers["monday_streak"] == 4
    assert numbers["week_streak"] == 3
    assert numbers["early_starts"] == 1
    assert numbers["late_starts"] == 2
    assert numbers["months_trained"] == 3
    assert numbers["workouts"] == 13
    assert numbers["training_hours"] == (50 + 45 + 40 + 60) / 60


def test_cardio_borders_take_the_best_week_and_month(client):
    monday = date(2025, 3, 3)
    for offset in (0, 2, 4):
        workout(client, monday + timedelta(days=offset))
        cardio(client, monday + timedelta(days=offset), 100, distance_km=12)
    cardio(client, monday + timedelta(days=7), 60, distance_km=10, elevation_gain_m=250)
    cardio(client, date(2025, 4, 20), 45, distance_km=5, incline_percent=10)

    numbers = stats(client)
    assert numbers["cardio_week_minutes"] == 300
    assert numbers["cardio_month_km"] == 46
    assert numbers["hybrid_weeks"] == 1
    # 250 m logged, plus the climb estimated from 5 km at a 10% incline.
    assert numbers["climbed_m"] == 250 + 498

    listed = borders(client)
    assert listed["cardiomaniac-1"]["unlocked"] and listed["cardiomaniac-2"]["unlocked"]
    assert not listed["cardiomaniac-3"]["unlocked"]
    assert listed["cardiomaniac-3"]["progress"] == {"current": 300, "target": 600, "unit": "min"}
    assert listed["marathon-month"]["unlocked"]
    assert listed["marathon-month"]["family"] is None and listed["marathon-month"]["tier"] is None
    assert listed["hybrid"]["progress"] == {"current": 1, "target": 4, "unit": "weeks"}
    assert listed["everest"]["progress"] == {"current": 748, "target": 8849, "unit": "m"}


def test_record_borders_count_weight_and_rep_prs_per_workout(client):
    workout(client, "2026-01-05", BENCH, [{"weight_kg": 60, "reps": 5}])
    workout(client, "2026-01-07", SQUAT, [{"weight_kg": 80, "reps": 5}])
    assert stats(client)["records"] == 0

    both = client.post(
        "/api/workouts",
        json={
            "name": "PR day",
            "workout_date": "2026-01-12",
            "category": "full_body",
            "movements": [
                {
                    "exercise_id": named(client, BENCH)["id"],
                    "sets": [{"weight_kg": 60, "reps": 6}, {"weight_kg": 65, "reps": 3}],
                },
                {
                    "exercise_id": named(client, SQUAT)["id"],
                    "sets": [{"weight_kg": 90, "reps": 3}],
                },
            ],
        },
    )
    assert both.status_code == 201, both.text
    numbers = stats(client)
    assert numbers["records"] == 3
    assert numbers["records_in_workout"] == 3
    assert borders(client)["hat-trick"]["unlocked"]


def test_future_workouts_do_not_count_yet(client):
    workout(client, "2026-01-05")
    workout(client, "2026-01-09")
    assert stats(client, date(2026, 1, 6))["workouts"] == 1
    assert stats(client, date(2026, 1, 9))["workouts"] == 2


def test_friends_see_the_worn_border_and_sex(client, other_client):
    share(client)
    share(other_client)
    befriend(other_client, client)
    for offset in range(5):
        workout(client, date(2026, 1, 5) + timedelta(days=offset))
    set_sex(client, "female")
    assert wear(client, "first-steps").status_code == 200

    seen = profile(other_client, client).json()
    assert seen["profile_border"] == "first-steps"
    assert seen["profile_border_name"] == "First Steps"
    assert seen["sex"] == "female"

    friends = other_client.get("/api/sharing/friends").json()["friends"]
    assert [friend["profile_border"] for friend in friends] == ["first-steps"]
    feed = other_client.get("/api/sharing/feed").json()
    assert feed["items"][0]["friend"]["profile_border"] == "first-steps"

    # A border the app no longer knows is not sent to anyone.
    with SessionLocal() as db:
        db.execute(update(User).where(User.id == client.user["id"]).values(profile_border="gone"))
        db.commit()
    assert profile(other_client, client).json()["profile_border"] is None
    assert client.get("/api/auth/me").json()["profile_border"] is None


def test_a_friends_only_profile_hides_sex_from_non_friends(client, other_client):
    share(client, "followers")
    share(other_client)
    set_sex(client, "male")

    seen = profile(other_client, client).json()
    assert seen["can_view"] is False
    assert seen["sex"] is None


def test_profile_borders_migration_adds_and_removes_the_account_columns():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0062_profile_borders.py"
    spec = importlib.util.spec_from_file_location("profile_borders_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0061_password_reset_requests"
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT)"))
        connection.execute(text("INSERT INTO users VALUES ('owner', 'owner')"))
        connection.execute(text("CREATE TABLE child (user_id TEXT REFERENCES users(id))"))
        connection.execute(text("INSERT INTO child VALUES ('owner')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(
            text("SELECT username, sex, profile_border FROM users WHERE id='owner'")
        ).one() == ("owner", None, None)
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert columns == {"id", "username"}
        assert connection.scalar(text("SELECT COUNT(*) FROM child")) == 1


def test_every_border_has_artwork_in_the_app():
    shapes = Path(__file__).resolve().parents[2] / "frontend/src/profileBorderShapes.tsx"
    drawn = set(
        re.findall(r"^  '?([a-z0-9-]+)'?: \(", shapes.read_text(encoding="utf-8"), flags=re.M)
    )
    assert drawn == {border.key for border in BORDERS}
