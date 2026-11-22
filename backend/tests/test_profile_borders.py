from __future__ import annotations

import importlib.util
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text, update
from test_auth import named
from test_sharing import befriend, profile, share

from app import profile_borders
from app.database import SessionLocal
from app.models import TrainingWorkout, User
from app.profile_borders import (
    BORDERS,
    METRICS,
    Window,
    border_stats,
    find_border,
    limited_borders,
    longest_run,
    plates,
)

BENCH, SQUAT, DEADLIFT = "Barbell Bench Press", "Back Squat", "Deadlift"


@pytest.fixture(autouse=True)
def backdates_allowed(monkeypatch):
    """Most tests log months of history at once; the backdate allowance has its own test."""
    monkeypatch.setattr(profile_borders, "BACKDATES_PER_WEEK", 10_000)
    return monkeypatch


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
        return border_stats(db, db.get(User, test_client.user["id"]), today).values


def test_every_border_has_one_key_and_a_known_metric():
    assert len({border.key for border in BORDERS}) == len(BORDERS)
    assert all(border.metric in METRICS for border in BORDERS)
    by_sex = {border.family or border.key for border in BORDERS if isinstance(border.target, tuple)}
    assert by_sex == {"bench", "squat", "deadlift", "bodyweight"}


RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"]


def test_each_family_climbs_in_target_and_rarity_from_tier_one():
    families: dict[str, list] = {}
    for border in BORDERS:
        if border.family:
            families.setdefault(border.family, []).append(border)
    assert len(families) == 10
    for family, tiers in families.items():
        assert [border.tier for border in tiers] == list(range(1, len(tiers) + 1)), family
        # One measure per family, except Gravity Defier: reps first, then weight added.
        metrics = list(dict.fromkeys(border.metric for border in tiers))
        assert len(metrics) == (2 if family == "bodyweight" else 1), family
        for metric in metrics:
            same = [border for border in tiers if border.metric == metric]
            for lower, higher in zip(same, same[1:], strict=False):
                for sex in ("male", "female"):
                    assert lower.target_for(sex) < higher.target_for(sex), family
        ranks = [RARITY_ORDER.index(border.rarity) for border in tiers]
        assert ranks == sorted(ranks) and ranks[-1] > ranks[0], family


def test_only_strength_reaches_mythic_and_effort_alone_stays_below_legendary():
    mythic = {border.family for border in BORDERS if border.rarity == "mythic"}
    assert mythic == {"bench", "squat", "deadlift", "bodyweight"}
    for family in mythic:
        tiers = [border for border in BORDERS if border.family == family]
        assert [border.rarity for border in tiers] == [
            "common",
            "rare",
            "epic",
            "legendary",
            "mythic",
        ]
    # A big week of cardio is effort anyone can add, so it looks no rarer than epic.
    assert find_border("cardiomaniac-3").rarity == "epic"


def test_plates_count_twenty_kilo_plates_a_side_on_a_twenty_kilo_bar():
    assert [plates(weight) for weight in (60, 100, 140, 180, 220)] == [1, 2, 3, 4, 5]
    assert plates(20) is None and plates(40) is None and plates(80) is None


def test_longest_run_counts_evenly_spaced_dates():
    day = date(2026, 3, 2)
    assert longest_run([]) == 0
    assert longest_run([day, day, day + timedelta(days=1), day + timedelta(days=3)]) == 2
    mondays = [day, day + timedelta(days=7), day + timedelta(days=21)]
    assert longest_run(mondays, 7) == 2


def test_a_new_account_has_no_progress_because_sample_workouts_never_count(client):
    with SessionLocal() as db:
        db.execute(update(TrainingWorkout).values(is_sample=True))
        db.commit()
    workout(client, "2026-01-05")
    with SessionLocal() as db:
        db.execute(update(TrainingWorkout).values(is_sample=True))
        db.commit()

    listed = borders(client)
    assert len([item for item in listed.values() if not item["kind"]]) == len(BORDERS)
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
        workout(lifter, "2026-01-05", BENCH, [{"weight_kg": 30, "reps": 3}])

    waiting = borders(client)["bench-club-1"]
    assert waiting["needs_sex"] is True and waiting["progress"] is None
    assert waiting["requirement"] == "Bench press 40 kg (men) or 25 kg (women)"
    assert waiting["unlocked"] is False
    assert (waiting["family"], waiting["tier"]) == ("bench", 1)
    assert wear(client, "bench-club-1").status_code == 403

    assert set_sex(client, "female").status_code == 200
    assert set_sex(other_client, "male").status_code == 200
    hers, his = borders(client), borders(other_client)
    assert hers["bench-club-1"]["requirement"] == "Bench press 25 kg"
    assert hers["bench-club-1"]["unlocked"] is True
    assert hers["bench-club-1"]["progress"] == {"current": 30, "target": 25, "unit": "kg"}
    assert hers["bench-club-2"]["requirement"] == "Bench press 35 kg"
    assert hers["bench-club-2"]["unlocked"] is False
    assert his["bench-club-1"]["requirement"] == "Bench press 40 kg"
    assert his["bench-club-1"]["unlocked"] is False
    assert his["bench-club-1"]["progress"] == {"current": 30, "target": 40, "unit": "kg"}
    assert his["bench-club-2"]["requirement"] == "Bench press 60 kg · 1 plate"
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
    # 84 x 5, 150 x 1, 140 x 1 and 180 x 2: warm-ups and failed sets add nothing.
    assert numbers["tonnes"] == (420 + 150 + 140 + 360) / 1000

    listed = borders(client)
    earned = {key for key, item in listed.items() if item["unlocked"]}
    # Men: bench 40 / 60 / 100, squat 60 / 100 / 140 / 180, deadlift 100 / 140 / 180 / 220.
    assert {"bench-club-1", "bench-club-2", "squat-club-3", "deadlift-club-3"} <= earned
    assert not earned & {"bench-club-3", "squat-club-4", "deadlift-club-4"}
    # The barbell lifts say nothing about bodyweight strength.
    assert not any(key.startswith("gravity-defier") for key in earned)
    assert listed["deadlift-club-4"]["requirement"] == "Deadlift 220 kg · 5 plates"
    assert listed["bench-club-5"]["requirement"] == "Bench press 140 kg · 3 plates"
    assert listed["bench-club-5"]["rarity"] == "mythic"


def test_gravity_defier_reads_pull_ups_chin_ups_and_dips(client, other_client):
    for lifter in (client, other_client):
        weigh_in(lifter, "2026-01-01", 80)
        workout(lifter, "2026-01-05", "Pull-up", [{"weight_kg": 0, "reps": 7}, {"reps": 9}])
        workout(
            lifter,
            "2026-01-07",
            "Dips",
            [
                {"weight_kg": 30, "reps": 5, "set_type": "warmup"},
                {"weight_kg": 16, "reps": 3},
                {"weight_kg": 24, "reps": 0, "failed": True},
            ],
        )
        workout(lifter, "2026-01-08", "Lat Pulldown", [{"weight_kg": 90, "reps": 12}])

    numbers = stats(client)
    # Nine bodyweight pull-ups; 16 kg added on dips at 80 kg is 20%. Warm-ups, failed sets and
    # other exercises do not count.
    assert numbers["bodyweight_reps"] == 9
    assert numbers["bodyweight_added"] == 20

    listed = borders(client)
    first = listed["gravity-defier-1"]
    assert first["requirement"] == "Do 1 rep in one set of pull-ups, chin-ups or dips"
    assert first["unlocked"] and first["needs_sex"] is False
    assert listed["gravity-defier-2"]["requirement"] == (
        "Do 10 reps (men) or 5 reps (women) in one set of pull-ups, chin-ups or dips"
    )
    assert listed["gravity-defier-3"]["needs_sex"] is True

    set_sex(client, "male")
    set_sex(other_client, "female")
    his, hers = borders(client), borders(other_client)
    assert his["gravity-defier-2"]["progress"] == {"current": 9, "target": 10, "unit": "reps"}
    assert his["gravity-defier-3"]["requirement"] == (
        "Do a pull-up, chin-up or dip with 25% of your body weight added"
    )
    assert his["gravity-defier-3"]["progress"] == {"current": 20, "target": 25, "unit": "% BW"}
    assert his["gravity-defier-5"]["rarity"] == "mythic"
    # Men: 1 and 10 reps, then 25%, 50% and 75% added; women: 1 and 5 reps, then 10%, 25%, 40%.
    earned = [
        [lifter[f"gravity-defier-{tier}"]["unlocked"] for tier in range(1, 6)]
        for lifter in (his, hers)
    ]
    assert earned == [[True, False, False, False, False], [True, True, True, False, False]]


def test_weight_targets_are_shown_in_the_accounts_unit(client):
    set_sex(client, "male")
    saved = client.put(
        "/api/training-preferences",
        json={"preferred_weight_unit": "lb", "week_start": "monday", "zone2_goal_minutes": 150},
    )
    assert saved.status_code == 200, saved.text
    workout(client, "2026-01-05", BENCH, [{"weight_kg": 100, "reps": 1}])

    bench = borders(client)["bench-club-3"]
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
    hours = [find_border(key) for key in ("hundred-hours", "time-under-tension", "thousand-hours")]
    assert [(border.family, border.tier, border.target) for border in hours] == [
        ("hours", 1, 100),
        ("hours", 2, 500),
        ("hours", 3, 1000),
    ]
    assert borders(client)["thousand-hours"]["requirement"] == "Train for 1,000 hours in total"


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


def test_profile_borders_migration_adds_and_removes_the_border_column():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0064_profile_borders.py"
    spec = importlib.util.spec_from_file_location("profile_borders_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "0063_share_body_sizes"
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
            text("SELECT username, profile_border FROM users WHERE id='owner'")
        ).one() == ("owner", None)
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
        migration.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        assert columns == {"id", "username"}
        assert connection.scalar(text("SELECT COUNT(*) FROM child")) == 1


def test_every_border_has_artwork_in_the_app_at_its_rarity():
    shapes = Path(__file__).resolve().parents[2] / "frontend/src/profileBorderShapes.tsx"
    source = shapes.read_text(encoding="utf-8")
    table = source[source.index("const SPECS: Record<string, Spec> = {") :]
    table = table[: table.index("\n};")]
    drawn = dict(re.findall(r"^  '?([a-z0-9-]+)'?: \{\s*grade: (\d)", table, re.M))
    assert set(drawn) == {border.key for border in BORDERS}
    for border in BORDERS:
        assert int(drawn[border.key]) == RARITY_ORDER.index(border.rarity) + 1, border.key


def test_events_open_yearly_and_show_a_month_ahead():
    keys = lambda today: [border.key for border in limited_borders(today)]  # noqa: E731
    # Christmas and Summer 2026 are the first events; they show from 1 November.
    assert keys(date(2026, 10, 31)) == []
    assert keys(date(2026, 11, 19)) == ["christmas-2026", "summer-2026"]
    summer = find_border("summer-2027", date(2027, 11, 15))
    assert summer.name == "Summer 2027–28"
    assert summer.window == Window("event", date(2027, 12, 1), date(2028, 2, 29))
    assert find_border("summer-2027", date(2027, 10, 1)) is None
    assert find_border("halloween-2026", date(2026, 11, 19)) is None
    assert find_border("new-year-2027", date(2027, 1, 5)).window.describe() == "in January 2027"
    assert find_border("nonsense-2027", date(2027, 1, 5)) is None


def test_csv_imports_earn_no_borders(client):
    set_sex(client, "male")
    header = "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),"
    header += "Bodyweight (lb),Percentile (%),Warmup\n"
    start = date.today() - timedelta(days=12)
    rows = "".join(
        f"{(start + timedelta(days=day)).isoformat()},{lift},{150 + day},,5,80,,,FALSE\n"
        for day in range(10)
        for lift in (BENCH, "Pull-up")
    )
    imported = client.post(
        "/api/workouts/import",
        files={"file": ("strong.csv", (header + rows).encode(), "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    assert len(client.get("/api/workouts").json()) == 10

    with SessionLocal() as db:
        imported_stats = border_stats(db, db.get(User, client.user["id"]))
    # Ten imported days of heavy benching, weighted pull-ups and weigh-ins: none of it counts.
    assert imported_stats.activity == []
    numbers = imported_stats.values
    for metric in ("workouts", "log_streak", "bench_kg", "bodyweight_reps", "records", "tonnes"):
        assert numbers[metric] == 0, metric
    assert not any(item["unlocked"] for item in borders(client).values())

    # A workout logged in Relay counts as usual.
    workout(client, date.today(), BENCH, [{"weight_kg": 60, "reps": 5}])
    numbers = stats(client)
    assert numbers["workouts"] == 1 and numbers["bench_kg"] == 60
    listed = borders(client)
    assert listed["first-steps"]["progress"] == {"current": 1, "target": 5, "unit": "workouts"}
    assert listed["bench-club-2"]["unlocked"] and not listed["bench-club-3"]["unlocked"]


def test_only_two_backdated_entries_a_week_count(client, backdates_allowed):
    backdates_allowed.setattr(profile_borders, "BACKDATES_PER_WEEK", 2)
    today = date.today()
    # Saved today: yesterday and two days ago are on time; anything older is backdated.
    for days_ago in (1, 2, 10, 11, 12, 13):
        workout(client, today - timedelta(days=days_ago), BENCH, [{"weight_kg": 50, "reps": 5}])
    weigh_in(client, today - timedelta(days=20))
    numbers = stats(client)
    # Two on time plus the first two backdated workouts; the rest, and the weigh-in, wait.
    assert numbers["workouts"] == 4
    assert numbers["log_streak"] == 2

    # The allowance is per week the entries were saved in: a week later, two more count.
    with SessionLocal() as db:
        late = db.scalars(
            select(TrainingWorkout)
            .where(TrainingWorkout.workout_date < today - timedelta(days=11))
            .order_by(TrainingWorkout.workout_date)
        ).all()
        for item in late:
            item.created_at = datetime.combine(today, datetime.min.time()) + timedelta(days=7)
        db.commit()
    assert stats(client, today + timedelta(days=8))["workouts"] == 6

    # Editing an on-time workout to an old date makes it backdated too.
    with SessionLocal() as db:
        recent = db.scalar(
            select(TrainingWorkout).where(TrainingWorkout.workout_date == today - timedelta(days=1))
        )
        recent.workout_date = today - timedelta(days=40)
        db.commit()
    # It now takes one of this week's two places, so one fewer workout counts.
    assert stats(client)["workouts"] == 5
