from __future__ import annotations

import base64
import hashlib
import re
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from io import BytesIO

import pytest
from conftest import (
    TEST_INVITE_CODE,
    TEST_PASSWORD,
    create_session,
    make_user,
    register_user,
    upload,
)
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select

from app.accounts import LEGACY_OWNED_MODELS
from app.auth import (
    SESSION_COOKIE,
    LoginThrottle,
    hash_password,
    origin_matches_host,
    password_needs_rehash,
    verify_password,
)
from app.config import get_settings
from app.database import Base, SessionLocal
from app.main import create_app
from app.models import (
    ActiveWorkoutReminder,
    AppSetting,
    BodyMeasurement,
    BodyWeightGoal,
    CardioSession,
    Clip,
    Exercise,
    ExerciseMuscleContribution,
    MachinePhoto,
    PersonalRecord,
    PushSubscription,
    SupersetGroup,
    Timestamp,
    TrainingWorkout,
    User,
    UserSession,
    UserSetting,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSession,
    WorkoutSet,
    movement_machine_photos,
)

pytestmark = pytest.mark.auth_flow

PUBLIC_ROUTES = {
    ("GET", "/api/health"),
    ("GET", "/api/auth/config"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
}


@contextmanager
def app_client(**settings_overrides):
    settings = get_settings().model_copy(update=settings_overrides)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def login(test_client: TestClient, username: str, password: str = TEST_PASSWORD, **kwargs):
    return test_client.post(
        "/api/auth/login", json={"username": username, "password": password}, **kwargs
    )


def named(test_client: TestClient, name: str) -> dict:
    return next(item for item in test_client.get("/api/exercises").json() if item["name"] == name)


def workout_payload(exercise_id: str, name: str = "Friday push") -> dict:
    return {
        "name": name,
        "workout_date": date.today().isoformat(),
        "category": "push",
        "movements": [
            {
                "exercise_id": exercise_id,
                "sets": [{"reps": 5, "weight_kg": 100, "completed": True}],
            }
        ],
    }


def jpeg_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (64, 48), "#336699").save(buffer, format="JPEG")
    return buffer.getvalue()


def upload_photo(test_client: TestClient, exercise_id: str, caption: str = "Leg press"):
    return test_client.post(
        f"/api/exercises/{exercise_id}/machine-photos",
        data={"caption": caption},
        files={"file": ("machine.jpg", jpeg_bytes(), "image/jpeg")},
    )


# --- password hashing ---


def test_password_hash_is_self_describing_salted_scrypt():
    first = hash_password("a long enough password")
    second = hash_password("a long enough password")
    scheme, n, r, p, _salt, _key = first.split("$")
    assert (scheme, n, r, p) == ("scrypt", "32768", "8", "3")
    assert first != second
    assert verify_password("a long enough password", first)
    assert not verify_password("a different password", first)
    assert not verify_password("anything", "not-a-hash")
    assert not password_needs_rehash(first)


def test_login_upgrades_a_hash_made_with_older_cost_settings(client):
    legacy = "scrypt$16384$8$1$"
    with SessionLocal() as db:
        user = db.scalar(select(User))
        salt = b"0123456789abcdef"
        key = hashlib.scrypt(TEST_PASSWORD.encode(), salt=salt, n=2**14, r=8, p=1, dklen=64)
        user.password_hash = (
            f"{legacy}{base64.b64encode(salt).decode()}${base64.b64encode(key).decode()}"
        )
        db.commit()
    assert password_needs_rehash(user.password_hash)

    assert login(TestClient(client.app), "owner").status_code == 200

    with SessionLocal() as db:
        upgraded = db.scalar(select(User)).password_hash
    assert not upgraded.startswith(legacy) and not password_needs_rehash(upgraded)
    assert verify_password(TEST_PASSWORD, upgraded)


# --- register / login / logout / me ---


def test_register_requires_explicit_login_before_access(anonymous_client):
    response = anonymous_client.post(
        "/api/auth/register",
        json={
            "username": "  Lifter ",
            "password": TEST_PASSWORD,
            "display_name": "  Lee   Lifter ",
            "invite_code": TEST_INVITE_CODE,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
        "id",
        "username",
        "display_name",
        "is_admin",
        "can_upload_videos",
        "created_at",
        "profile_photo_url",
    }
    assert body["profile_photo_url"] is None
    assert body["username"] == "lifter"
    assert body["display_name"] == "Lee Lifter"
    assert body["is_admin"] is True
    assert body["can_upload_videos"] is True
    assert "set-cookie" not in response.headers
    assert SESSION_COOKIE not in anonymous_client.cookies
    assert anonymous_client.get("/api/auth/me").status_code == 401
    assert anonymous_client.get("/api/exercises").status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count(UserSession.id))) == 0
    assert login(anonymous_client, "lifter", "wrong password").status_code == 401
    assert anonymous_client.get("/api/auth/me").status_code == 401
    signed_in = login(anonymous_client, "lifter")
    assert signed_in.status_code == 200
    cookie = signed_in.headers["set-cookie"].lower()
    assert f"{SESSION_COOKIE}=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/" in cookie
    assert "secure" not in cookie
    assert anonymous_client.get("/api/auth/me").json() == body
    with SessionLocal() as db:
        stored = db.scalar(select(User))
        assert stored.password_hash.startswith("scrypt$")
        assert TEST_PASSWORD not in stored.password_hash
        token = anonymous_client.cookies.get(SESSION_COOKIE)
        session_row = db.scalar(select(UserSession))
        assert session_row.token_hash != token and len(session_row.token_hash) == 64


def test_secure_cookie_flag_follows_setting():
    with app_client(cookie_secure=True) as secure_client:
        response = secure_client.post(
            "/api/auth/register",
            json={
                "username": "aaa",
                "password": TEST_PASSWORD,
                "display_name": "A",
                "invite_code": TEST_INVITE_CODE,
            },
        )
        assert response.status_code == 201
        assert "set-cookie" not in response.headers
        response = login(secure_client, "aaa")
        assert "secure" in response.headers["set-cookie"].lower()


def test_register_validation_and_duplicate_username(client):
    base = {
        "username": "new",
        "password": TEST_PASSWORD,
        "display_name": "New",
        "invite_code": TEST_INVITE_CODE,
    }
    short = client.post("/api/auth/register", json={**base, "password": "short"})
    assert short.status_code == 422
    assert short.json()["error"]["code"] == "validation_error"
    assert (
        client.post("/api/auth/register", json={**base, "password": "x" * 257}).status_code == 422
    )
    for username in ("ab", "x" * 33, ".lifter", "lift er", "lifter@example.com", "lífter", "ßab"):
        invalid = client.post("/api/auth/register", json={**base, "username": username})
        assert invalid.status_code == 422, username
    assert client.post("/api/auth/register", json={**base, "display_name": " "}).status_code == 422
    assert (
        client.post("/api/auth/register", json={**base, "display_name": "x" * 81}).status_code
        == 422
    )
    duplicate = client.post(
        "/api/auth/register", json={**base, "username": client.user["username"].upper()}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "username_taken"


def test_registration_accepts_username_boundaries_and_punctuation(anonymous_client):
    for username in ("123", "a" * 32, "Lift.er_01-2"):
        browser = TestClient(anonymous_client.app)
        user = register_user(browser, f"  {username}  ")
        assert user["username"] == username.lower()
        assert login(TestClient(anonymous_client.app), username.upper()).status_code == 200
        assert "email" not in user


def test_email_only_requests_cannot_register_or_sign_in(anonymous_client):
    body = {"email": "owner@example.com", "password": TEST_PASSWORD, "display_name": "Owner"}
    assert anonymous_client.post("/api/auth/register", json=body).status_code == 422
    assert anonymous_client.post("/api/auth/login", json=body).status_code == 422


def test_login_logout_and_me(client):
    # A second browser signs in with the same account.
    browser = TestClient(client.app)
    assert browser.get("/api/auth/me").status_code == 401
    assert browser.get("/api/auth/me").json()["error"]["code"] == "not_authenticated"

    response = login(browser, "OWNER")
    assert response.status_code == 200
    assert response.json()["id"] == client.user["id"]
    assert browser.get("/api/auth/me").status_code == 200

    assert browser.post("/api/auth/logout").status_code == 204
    assert browser.get("/api/auth/me").status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count(UserSession.id))) == 1  # only the original browser
    # Logging out again, or while signed out, is harmless.
    assert browser.post("/api/auth/logout").status_code == 204
    # The first browser is unaffected.
    assert client.get("/api/auth/me").status_code == 200


def test_logout_revokes_the_server_side_session_even_if_the_cookie_is_replayed(client):
    token = client.cookies.get(SESSION_COOKIE)
    client.post("/api/auth/logout")
    replay = TestClient(client.app, cookies={SESSION_COOKIE: token})
    assert replay.get("/api/auth/me").status_code == 401


def test_wrong_password_and_unknown_username_are_indistinguishable(anonymous_client):
    register_user(anonymous_client)
    browser = TestClient(anonymous_client.app)
    wrong = login(browser, "owner", "not the password")
    unknown = login(browser, "nobody", "not the password")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"]["code"] == "invalid_credentials"
    assert SESSION_COOKIE not in browser.cookies


def test_login_is_throttled_after_repeated_failures(anonymous_client):
    register_user(anonymous_client)
    browser = TestClient(anonymous_client.app)
    for _ in range(10):
        assert login(browser, "owner", "wrong password!").status_code == 401
    blocked = login(browser, "owner", TEST_PASSWORD)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "too_many_attempts"
    # The client address is limited too, whichever username is tried.
    assert login(browser, "someone-else", "wrong password!").status_code == 429


def test_login_throttle_window_expires_and_success_resets_username_counter():
    now = [0.0]
    throttle = LoginThrottle(max_failures=3, window_seconds=60, clock=lambda: now[0])
    for _ in range(3):
        throttle.record_failure("username:a", "ip:1")
    assert throttle.is_blocked("username:a")
    assert throttle.is_blocked("ip:1")
    assert not throttle.is_blocked("username:b")
    now[0] = 61
    assert not throttle.is_blocked("username:a", "ip:1")
    for _ in range(3):
        throttle.record_failure("username:a")
    throttle.reset("username:a")
    assert not throttle.is_blocked("username:a")


def test_failures_from_other_addresses_cannot_cheaply_lock_an_account(anonymous_client):
    register_user(anonymous_client)
    throttle = anonymous_client.app.state.login_throttle
    # Nine attackers' addresses each burn their own allowance against the owner's username.
    for attacker in range(9):
        for _ in range(10):
            throttle.record_failure(f"ip:203.0.113.{attacker}", "username:owner")
    browser = TestClient(anonymous_client.app)
    assert login(browser, "owner").status_code == 200  # Also resets the count.

    # Only a sustained attack from many addresses reaches the per-account ceiling.
    for attacker in range(10):
        for _ in range(10):
            throttle.record_failure(f"ip:198.51.100.{attacker}", "username:owner")
    blocked = login(TestClient(anonymous_client.app), "owner")
    assert blocked.status_code == 429
    register_user(browser, "fresh", "Fresh")
    assert login(browser, "fresh").status_code == 200


# --- registration policy ---


def test_auth_config_reports_the_invite_code(anonymous_client):
    config = anonymous_client.get("/api/auth/config")
    assert config.status_code == 200
    assert config.json() == {"registration_open": True, "invite_code_required": True}


def test_public_safe_defaults():
    fields = type(get_settings()).model_fields
    assert fields["allow_registration"].default is False
    assert fields["registration_invite_code"].default is None
    assert fields["api_docs"].default is False
    assert fields["video_uploads"].default == "admin"


def test_api_docs_are_only_served_when_enabled(anonymous_client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        body = anonymous_client.get(path).text.lower()
        assert "swagger" not in body and "redoc" not in body and '"openapi"' not in body
    with app_client(api_docs=True) as docs_client:
        assert docs_client.get("/openapi.json").json()["paths"]
        assert docs_client.get("/docs").status_code == 200


def test_first_account_cannot_be_claimed_from_the_browser_without_an_invite_code():
    with SessionLocal() as db:
        db.add(
            CardioSession(session_date=date(2026, 1, 6), activity_type="Walk", duration_minutes=30)
        )
        db.commit()
    with app_client(registration_invite_code=None, allow_registration=True) as open_client:
        assert open_client.get("/api/auth/config").json() == {
            "registration_open": False,
            "invite_code_required": False,
        }
        response = open_client.post(
            "/api/auth/register",
            json={"username": "first", "password": TEST_PASSWORD, "display_name": "Me"},
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "setup_required"
        assert "app.manage create-user" in response.json()["error"]["message"]
    with SessionLocal() as db:
        assert db.scalar(select(func.count(User.id))) == 0
        assert db.scalar(select(CardioSession.user_id)) is None  # Legacy data is still unclaimed.

    # Once the owner exists (for example via the CLI), open registration works without a code.
    make_user("owner", is_admin=True)
    with app_client(registration_invite_code=None, allow_registration=True) as open_client:
        assert open_client.get("/api/auth/config").json()["registration_open"] is True
        joined = open_client.post(
            "/api/auth/register",
            json={"username": "friend", "password": TEST_PASSWORD, "display_name": "F"},
        )
        assert joined.status_code == 201
        assert joined.json()["is_admin"] is False


def test_invite_code_is_required_when_configured():
    with app_client(registration_invite_code="open-sesame") as invite_client:
        assert invite_client.get("/api/auth/config").json() == {
            "registration_open": True,
            "invite_code_required": True,
        }
        body = {"username": "aaa", "password": TEST_PASSWORD, "display_name": "A"}
        for code in (None, "", "wrong", "open-sesame "):
            response = invite_client.post("/api/auth/register", json={**body, "invite_code": code})
            assert response.status_code == 403
            assert response.json()["error"]["code"] == "invalid_invite_code"
        assert (
            invite_client.post(
                "/api/auth/register", json={**body, "invite_code": "open-sesame"}
            ).status_code
            == 201
        )


def test_invite_code_guessing_is_throttled():
    with app_client(registration_invite_code="open-sesame") as invite_client:
        body = {"username": "aaa", "password": TEST_PASSWORD, "display_name": "A"}
        for _ in range(10):
            invite_client.post("/api/auth/register", json={**body, "invite_code": "guess"})
        response = invite_client.post(
            "/api/auth/register", json={**body, "invite_code": "open-sesame"}
        )
        assert response.status_code == 429


def test_closed_registration_still_allows_the_first_account():
    with app_client(allow_registration=False) as closed_client:
        assert closed_client.get("/api/auth/config").json()["registration_open"] is True
        owner = register_user(closed_client)
        assert owner["is_admin"] is True
        assert closed_client.get("/api/auth/config").json()["registration_open"] is False

        other = TestClient(closed_client.app)
        response = other.post(
            "/api/auth/register",
            json={"username": "late", "password": TEST_PASSWORD, "display_name": "Late"},
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "registration_closed"
        # Existing users can still sign in.
        assert login(other, "owner").status_code == 200


def test_only_the_first_account_is_admin_and_video_access_follows_policy(client, other_client):
    assert client.user["is_admin"] is True
    assert other_client.user["is_admin"] is False
    assert other_client.user["can_upload_videos"] is False
    assert other_client.get("/api/auth/me").json()["can_upload_videos"] is False
    with app_client(video_uploads="everyone") as open_client:
        member = register_user(open_client, "first")
        assert member["can_upload_videos"] is True
        second = register_user(TestClient(open_client.app), "second")
        assert second["is_admin"] is False
        assert second["can_upload_videos"] is True


# --- legacy data ---


def test_first_user_claims_legacy_rows_without_duplicating_the_catalog(anonymous_client):
    with SessionLocal() as db:
        bench = Exercise(
            name="Barbell Bench Press",
            category=WorkoutCategory.PUSH,
            muscle_group="Chest",
            is_custom=False,
        )
        custom = Exercise(
            name="Landmine Press",
            category=WorkoutCategory.PUSH,
            muscle_group="Shoulders",
            is_custom=True,
        )
        workout = TrainingWorkout(
            name="Old push", workout_date=date(2026, 1, 5), category=WorkoutCategory.PUSH
        )
        movement = WorkoutMovement(exercise=bench, order_index=0)
        movement.sets.append(WorkoutSet(order_index=0, reps=5, weight_kg=100, completed=True))
        workout.movements.append(movement)
        db.add_all(
            [
                custom,
                workout,
                BodyMeasurement(measurement_date=date(2026, 1, 5), weight_kg=80),
                BodyWeightGoal(
                    start_date=date(2026, 1, 1),
                    target_date=date(2026, 6, 1),
                    start_weight_kg=80,
                    target_weight_kg=75,
                ),
                CardioSession(
                    session_date=date(2026, 1, 6), activity_type="Walking", duration_minutes=30
                ),
                PushSubscription(endpoint="https://push.example.test/legacy", p256dh="k", auth="a"),
                WorkoutSession(
                    name="Old video", workout_date=date(2026, 1, 5), expected_clip_count=1
                ),
                AppSetting(key="week_start", value="sunday"),
                AppSetting(key="preferred_weight_unit", value="lb"),
            ]
        )
        db.commit()

    owner = register_user(anonymous_client)

    assert owner["is_admin"] is True
    with SessionLocal() as db:
        for model in (
            Exercise,
            TrainingWorkout,
            BodyMeasurement,
            BodyWeightGoal,
            CardioSession,
            PushSubscription,
            WorkoutSession,
        ):
            owners = set(db.scalars(select(model.user_id)))
            assert owners == {owner["id"]}, model.__name__
        assert db.scalar(select(func.count(AppSetting.key))) == 0
        assert (
            db.scalar(select(func.count(Exercise.id)).where(Exercise.name == "Barbell Bench Press"))
            == 1
        )
        assert db.get(UserSetting, (owner["id"], "week_start")).value == "sunday"
    exercises = {item["name"]: item for item in anonymous_client.get("/api/exercises").json()}
    assert "Landmine Press" in exercises and "Back Squat" in exercises
    assert [item["name"] for item in anonymous_client.get("/api/workouts").json()] == ["Old push"]
    preferences = anonymous_client.get("/api/training-preferences").json()
    assert preferences["week_start"] == "sunday"
    assert preferences["preferred_weight_unit"] == "lb"

    # The next account starts clean: nothing legacy leaks to it.
    newcomer = TestClient(anonymous_client.app)
    register_user(newcomer, "new", "New")
    assert newcomer.get("/api/workouts").json() == []
    assert newcomer.get("/api/body-measurements").json() == []
    assert newcomer.get("/api/training-preferences").json()["week_start"] == "monday"
    assert "Landmine Press" not in {item["name"] for item in newcomer.get("/api/exercises").json()}
    assert newcomer.get("/api/exercises").json()


def test_sample_data_is_seeded_per_new_account_and_removed_per_account():
    with app_client(seed_sample_data=True) as sample_client:
        first = register_user(sample_client, "one")
        second_browser = TestClient(sample_client.app)
        register_user(second_browser, "two")
        assert len(sample_client.get("/api/workouts").json()) == 5
        assert len(second_browser.get("/api/workouts").json()) == 5
        assert len(second_browser.get("/api/body-measurements").json()) == 3
        assert first["is_admin"] is True

        assert sample_client.delete("/api/sample-data").status_code == 204
        assert sample_client.get("/api/workouts").json() == []
        assert sample_client.get("/api/body-measurements").json() == []
        assert len(second_browser.get("/api/workouts").json()) == 5
        assert len(second_browser.get("/api/body-measurements").json()) == 3


def test_first_user_with_legacy_workouts_does_not_receive_sample_data():
    with SessionLocal() as db:
        db.add(
            TrainingWorkout(
                name="Real workout", workout_date=date(2026, 1, 5), category=WorkoutCategory.PUSH
            )
        )
        db.commit()
    with app_client(seed_sample_data=True) as sample_client:
        register_user(sample_client)
        assert [item["name"] for item in sample_client.get("/api/workouts").json()] == [
            "Real workout"
        ]


# --- profile ---


def test_profile_update(client, other_client):
    updated = client.patch("/api/profile", json={"display_name": " New  Name ", "username": "New"})
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "New Name"
    assert updated.json()["username"] == "new"
    assert client.get("/api/auth/me").json()["username"] == "new"
    assert login(TestClient(client.app), "new").status_code == 200

    only_name = client.patch("/api/profile", json={"display_name": "Solo"})
    assert only_name.json()["username"] == "new"
    assert client.patch("/api/profile", json={"username": "same@x"}).status_code == 422
    assert client.patch("/api/profile", json={"display_name": ""}).status_code == 422

    taken = client.patch("/api/profile", json={"username": other_client.user["username"]})
    assert taken.status_code == 409
    assert taken.json()["error"]["code"] == "username_taken"
    # Re-submitting your own username is not a conflict.
    assert client.patch("/api/profile", json={"username": "new"}).status_code == 200


def test_password_change_revokes_other_sessions_only(client):
    phone = TestClient(client.app)
    assert login(phone, "owner").status_code == 200

    wrong = client.put(
        "/api/profile/password",
        json={"current_password": "not the password", "new_password": "brand new password 1"},
    )
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "invalid_password"
    assert phone.get("/api/auth/me").status_code == 200

    too_short = client.put(
        "/api/profile/password",
        json={"current_password": TEST_PASSWORD, "new_password": "short"},
    )
    assert too_short.status_code == 422

    changed = client.put(
        "/api/profile/password",
        json={"current_password": TEST_PASSWORD, "new_password": "brand new password 1"},
    )
    assert changed.status_code == 204
    assert client.get("/api/auth/me").status_code == 200
    assert phone.get("/api/auth/me").status_code == 401
    fresh = TestClient(client.app)
    assert login(fresh, "owner").status_code == 401
    assert login(fresh, "owner", "brand new password 1").status_code == 200


# --- account deletion ---


def row_counts(user_id: str) -> dict[str, int]:
    with SessionLocal() as db:
        workout_ids = select(TrainingWorkout.id).where(TrainingWorkout.user_id == user_id)
        movement_ids = select(WorkoutMovement.id).where(WorkoutMovement.workout_id.in_(workout_ids))
        session_ids = select(WorkoutSession.id).where(WorkoutSession.user_id == user_id)
        exercise_ids = select(Exercise.id).where(Exercise.user_id == user_id)
        counts = {
            "users": select(func.count(User.id)).where(User.id == user_id),
            "user_sessions": select(func.count(UserSession.id)).where(
                UserSession.user_id == user_id
            ),
            "user_settings": select(func.count()).where(UserSetting.user_id == user_id),
            "exercises": select(func.count(Exercise.id)).where(Exercise.user_id == user_id),
            "muscles": select(func.count(ExerciseMuscleContribution.id)).where(
                ExerciseMuscleContribution.exercise_id.in_(exercise_ids)
            ),
            "photos": select(func.count(MachinePhoto.id)).where(MachinePhoto.user_id == user_id),
            "workouts": select(func.count(TrainingWorkout.id)).where(
                TrainingWorkout.user_id == user_id
            ),
            "movements": select(func.count(WorkoutMovement.id)).where(
                WorkoutMovement.workout_id.in_(workout_ids)
            ),
            "sets": select(func.count(WorkoutSet.id)).where(
                WorkoutSet.movement_id.in_(movement_ids)
            ),
            "photo_links": select(func.count())
            .select_from(movement_machine_photos)
            .where(movement_machine_photos.c.movement_id.in_(movement_ids)),
            "supersets": select(func.count(SupersetGroup.id)).where(
                SupersetGroup.workout_id.in_(workout_ids)
            ),
            "records": select(func.count(PersonalRecord.id)).where(
                PersonalRecord.user_id == user_id
            ),
            "cardio": select(func.count(CardioSession.id)).where(CardioSession.user_id == user_id),
            "measurements": select(func.count(BodyMeasurement.id)).where(
                BodyMeasurement.user_id == user_id
            ),
            "goals": select(func.count(BodyWeightGoal.id)).where(BodyWeightGoal.user_id == user_id),
            "video_sessions": select(func.count(WorkoutSession.id)).where(
                WorkoutSession.user_id == user_id
            ),
            "clips": select(func.count(Clip.id)).where(Clip.session_id.in_(session_ids)),
            "timestamps": select(func.count(Timestamp.id)).where(
                Timestamp.session_id.in_(session_ids)
            ),
            "subscriptions": select(func.count(PushSubscription.id)).where(
                PushSubscription.user_id == user_id
            ),
            "reminders": select(func.count()).where(ActiveWorkoutReminder.user_id == user_id),
        }
        return {name: db.scalar(statement) for name, statement in counts.items()}


def populate_account(test_client: TestClient) -> dict:
    bench = named(test_client, "Barbell Bench Press")
    fly = named(test_client, "Cable Fly")
    photo = upload_photo(test_client, bench["id"]).json()
    payload = workout_payload(bench["id"])
    payload["movements"][0].update(machine_photo_ids=[photo["id"]], superset_key="a")
    # Populate a genuine PR after the first set establishes the exercise's baseline.
    payload["movements"][0]["sets"].append({"reps": 6, "weight_kg": 100, "completed": True})
    payload["movements"].append({**workout_payload(fly["id"])["movements"][0], "superset_key": "a"})
    workout = test_client.post("/api/workouts", json=payload)
    assert workout.status_code == 201, workout.text
    assert (
        test_client.post(
            "/api/body-measurements", json={"measurement_date": "2026-07-01", "weight_kg": 80}
        ).status_code
        == 200
    )
    assert (
        test_client.post(
            "/api/body-weight-goals",
            json={
                "start_date": "2026-07-01",
                "target_date": "2026-12-01",
                "start_weight_kg": 80,
                "target_weight_kg": 75,
            },
        ).status_code
        == 201
    )
    assert (
        test_client.post(
            "/api/cardio",
            json={"session_date": "2026-07-01", "activity_type": "Walk", "duration_minutes": 30},
        ).status_code
        == 201
    )
    assert (
        test_client.put(
            "/api/training-preferences",
            json={"preferred_weight_unit": "lb", "week_start": "sunday", "zone2_goal_minutes": 100},
        ).status_code
        == 200
    )
    subscription = test_client.post(
        "/api/notifications/push/subscriptions",
        json={
            "endpoint": f"https://push.example.test/{test_client.user['id']}",
            "p256dh": "k",
            "auth": "a",
        },
    )
    assert subscription.status_code == 204
    return {"workout": workout.json(), "photo": photo}


def test_account_deletion_removes_everything_the_user_owns(client, other_client, fake_upload):
    settings = get_settings()
    populate_account(client)
    theirs = populate_account(other_client)
    # The workout can reference the photo; pin it to prove that join rows are removed too.
    session = create_session(client)
    assert upload(client, session["id"], "clip-1", 0).status_code == 200
    with SessionLocal() as db:
        db.add(
            ActiveWorkoutReminder(
                endpoint="https://push.example.test/reminder",
                user_id=client.user["id"],
                timer_id="t",
                due_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.add(
            Timestamp(
                session_id=session["id"],
                clip_id=db.scalar(select(Clip.id).where(Clip.session_id == session["id"])),
                order_index=0,
                label="Set 1",
                start_seconds=0,
            )
        )
        db.commit()
    assert len(list(settings.machine_photos_dir.iterdir())) == 4  # two photos x (full + thumb)
    own_upload_dir = settings.uploads_dir / session["id"]
    assert own_upload_dir.is_dir()
    before = row_counts(client.user["id"])
    assert all(value > 0 for value in before.values()), before

    wrong = client.request("DELETE", "/api/profile", json={"password": "not the password"})
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "invalid_password"
    assert client.get("/api/auth/me").status_code == 200

    deleted = client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert deleted.status_code == 204
    assert "max-age=0" in deleted.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").status_code == 401
    assert all(value == 0 for value in row_counts(client.user["id"]).values())
    assert not own_upload_dir.exists()
    # Only the other account's photo (full + thumbnail) is left on disk.
    assert len(list(settings.machine_photos_dir.iterdir())) == 2
    assert login(TestClient(client.app), "owner").status_code == 401

    # The other account is untouched.
    assert other_client.get("/api/auth/me").status_code == 200
    assert [item["id"] for item in other_client.get("/api/workouts").json()] == [
        theirs["workout"]["id"]
    ]
    assert other_client.get(theirs["photo"]["full_url"]).status_code == 200
    assert row_counts(other_client.user["id"])["workouts"] == 1


# These tables were introduced after accounts and require an owner from their first row.
ACCOUNT_TABLES = {
    "user_sessions",
    "user_settings",
    "account_backups",
    "app_feedback",
    "profile_sharing",
    "youtube_connections",
    "youtube_oauth_states",
    # Created only by signed-in accounts (user_id is required), so never legacy data.
    "workout_types",
    "workout_reactions",
    "workout_comments",
    "comment_reactions",
    "live_workouts",
}


def user_owned_tables():
    return [
        table
        for table in Base.metadata.sorted_tables
        if "user_id" in table.c and table.name not in ACCOUNT_TABLES
    ]


def test_every_user_owned_table_is_claimed_from_legacy_data():
    """A new table with user_id must be added to LEGACY_OWNED_MODELS, or the owner loses data."""
    claimed = {model.__table__.name for model in LEGACY_OWNED_MODELS}
    assert {table.name for table in user_owned_tables()} == claimed


def test_account_deletion_leaves_no_rows_in_any_user_owned_table(client, other_client):
    upload_photo(client, named(client, "Leg Press")["id"])
    client.post("/api/workouts", json=workout_payload(named(client, "Barbell Bench Press")["id"]))
    owner_id = client.user["id"]
    assert client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD}).status_code
    with SessionLocal() as db:
        for table in [*user_owned_tables(), *(Base.metadata.tables[t] for t in ACCOUNT_TABLES)]:
            remaining = db.scalar(
                select(func.count()).select_from(table).where(table.c.user_id == owner_id)
            )
            assert remaining == 0, table.name
        assert db.scalar(select(func.count()).select_from(Exercise)) > 0  # other account kept


# --- CSRF ---


def test_cross_origin_unsafe_requests_are_rejected(client):
    evil = {"Origin": "https://evil.example"}
    response = client.post("/api/workouts", json=workout_payload("x"), headers=evil)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_rejected"
    for method in ("PUT", "PATCH", "DELETE"):
        rejected = client.request(method, "/api/exercises/x/favorite", headers=evil, json={})
        assert rejected.status_code == 403
    assert client.post("/api/auth/logout", headers=evil).status_code == 403
    assert login(TestClient(client.app), "owner", headers=evil).status_code == 403
    assert client.post("/api/auth/logout", headers={"Origin": "null"}).status_code == 403
    # Reads are not state-changing, so they are not origin-checked.
    assert client.get("/api/exercises", headers=evil).status_code == 200
    # The session survived the forged attempts.
    assert client.get("/api/auth/me").status_code == 200


def test_same_origin_and_originless_requests_are_allowed(client):
    same_origin = client.post(
        "/api/exercises",
        json={"name": "Origin check", "category": "push", "muscle_group": "Chest"},
        headers={"Origin": "http://testserver"},
    )
    assert same_origin.status_code == 201
    originless = client.post(
        "/api/exercises",
        json={"name": "No origin check", "category": "push", "muscle_group": "Chest"},
    )
    assert originless.status_code == 201


def test_origin_host_matching():
    assert origin_matches_host("https://gym.example.com", "gym.example.com")
    assert origin_matches_host("http://LOCALHOST:8000", "localhost:8000")
    assert not origin_matches_host("https://gym.example.com", "gym.example.com:8443")
    assert not origin_matches_host("https://evil.example", "gym.example.com")
    assert not origin_matches_host("null", "gym.example.com")
    assert not origin_matches_host("https://gym.example.com", None)


# --- authentication coverage ---


def test_every_api_route_except_the_public_ones_requires_authentication(anonymous_client):
    # The OpenAPI document lists every mounted route however routers were nested or included.
    checked = 0
    for route_path, operations in anonymous_client.app.openapi()["paths"].items():
        if not route_path.startswith("/api"):
            continue
        path = re.sub(r"\{[^}]+\}", "x", route_path)
        for method in operations:
            method = method.upper()
            if (method, route_path) in PUBLIC_ROUTES:
                continue
            response = anonymous_client.request(method, path)
            assert response.status_code == 401, (method, route_path, response.status_code)
            assert response.json()["error"]["code"] == "not_authenticated", (method, route_path)
            checked += 1
    assert checked > 50
    assert anonymous_client.get("/api/health").status_code == 200
    assert anonymous_client.get("/api/auth/config").status_code == 200
    assert anonymous_client.post("/api/auth/logout").status_code == 204


def test_invalid_garbage_and_expired_sessions_are_rejected(client):
    assert (
        TestClient(client.app, cookies={SESSION_COOKIE: "garbage"}).get("/api/auth/me").status_code
        == 401
    )
    with SessionLocal() as db:
        row = db.scalar(select(UserSession))
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()
    assert client.get("/api/auth/me").status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count(UserSession.id))) == 0  # expired row was pruned


def test_expired_sessions_are_pruned_when_someone_signs_in(client):
    with SessionLocal() as db:
        row = db.scalar(select(UserSession))
        db.add(
            UserSession(
                user_id=row.user_id,
                token_hash="0" * 64,
                expires_at=datetime.now(UTC) - timedelta(days=1),
            )
        )
        db.commit()
    assert login(TestClient(client.app), "owner").status_code == 200
    with SessionLocal() as db:
        assert db.scalar(select(func.count(UserSession.id))) == 2


def test_sign_in_lasts_ninety_days_by_default(client):
    response = login(TestClient(client.app), "owner")
    assert f"max-age={90 * 24 * 60 * 60}" in response.headers["set-cookie"].lower()
    with SessionLocal() as db:
        expires = db.scalar(select(UserSession.expires_at)).replace(tzinfo=UTC)
    assert expires > datetime.now(UTC) + timedelta(days=89, hours=23)


def test_session_expiry_slides_forward_after_a_day_of_use(client):
    with SessionLocal() as db:
        row = db.scalar(select(UserSession))
        row.expires_at = datetime.now(UTC) + timedelta(days=88, hours=23)
        db.commit()
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert SESSION_COOKIE in response.headers["set-cookie"]
    with SessionLocal() as db:
        row = db.scalar(select(UserSession))
        expires = row.expires_at.replace(tzinfo=UTC)
        assert expires > datetime.now(UTC) + timedelta(days=89, hours=23)

    # Within a day of the last refresh nothing is rewritten or re-sent.
    again = client.get("/api/auth/me")
    assert "set-cookie" not in again.headers


def test_short_session_lifetimes_still_slide_forward():
    with app_client(session_days=1) as short_client:
        register_user(short_client)
        with SessionLocal() as db:
            row = db.scalar(select(UserSession))
            row.expires_at = datetime.now(UTC) + timedelta(hours=11)
            db.commit()
        assert "set-cookie" in short_client.get("/api/auth/me").headers


def test_session_cookie_name_is_configurable_so_instances_on_one_host_stay_separate():
    with app_client(session_cookie="gym_session_test") as test_client:
        register_user(test_client)
        assert SESSION_COOKIE not in test_client.cookies
        assert test_client.get("/api/auth/me").status_code == 200
        # The other instance's cookie is ignored rather than treated as this instance's session.
        token = test_client.cookies.get("gym_session_test")
        stray = TestClient(test_client.app, cookies={SESSION_COOKIE: token})
        assert stray.get("/api/auth/me").status_code == 401
        logout = test_client.post("/api/auth/logout")
        assert "gym_session_test=" in logout.headers["set-cookie"]
        assert test_client.get("/api/auth/me").status_code == 401


# --- cross-user isolation ---


def test_users_cannot_see_or_change_each_others_workouts(client, other_client):
    bench = named(client, "Barbell Bench Press")
    created = client.post("/api/workouts", json=workout_payload(bench["id"])).json()
    workout_url = f"/api/workouts/{created['id']}"

    assert other_client.get("/api/workouts").json() == []
    assert other_client.get(workout_url).status_code == 404
    assert other_client.put(workout_url, json=workout_payload(bench["id"])).status_code == 404
    assert other_client.delete(workout_url).status_code == 404
    assert other_client.get("/api/workouts/snapshot").json()["workouts"] == []
    assert other_client.get("/api/personal-records").json() == []
    assert other_client.get("/api/muscle-volume").json() == []
    dashboard = other_client.get("/api/dashboard").json()
    assert dashboard["workouts_this_week"] == 0 and dashboard["heatmap"] == []
    assert "Friday push" not in other_client.get("/api/workouts/export.csv").text
    assert "Barbell Bench Press" not in other_client.get("/api/workouts/export.csv").text
    assert client.get(workout_url).status_code == 200  # the owner still has it

    # Using someone else's exercise in your own workout is not allowed either.
    foreign = other_client.post("/api/workouts", json=workout_payload(bench["id"]))
    assert foreign.status_code == 422
    assert other_client.get(f"/api/progress/{bench['id']}").status_code == 404
    assert (
        other_client.patch(
            f"/api/exercises/{bench['id']}/favorite", json={"is_favorite": True}
        ).status_code
        == 404
    )
    assert other_client.get(f"/api/exercises/{bench['id']}/machine-photos").status_code == 404
    assert (
        other_client.get(f"/api/exercises/{bench['id']}/machine-photos/last-used").status_code
        == 404
    )
    assert upload_photo(other_client, bench["id"]).status_code == 404
    assert not named(client, "Barbell Bench Press")["is_favorite"]


def test_each_user_has_their_own_exercise_library_and_favorites(client, other_client):
    mine = {item["id"] for item in client.get("/api/exercises").json()}
    theirs = {item["id"] for item in other_client.get("/api/exercises").json()}
    assert mine and theirs and not mine & theirs

    custom = {"name": "Shared Name Press", "category": "push", "muscle_group": "Chest"}
    assert client.post("/api/exercises", json=custom).status_code == 201
    assert other_client.post("/api/exercises", json=custom).status_code == 201
    assert client.post("/api/exercises", json=custom).status_code == 409
    assert [item["name"] for item in other_client.get("/api/exercises?search=Shared").json()] == [
        "Shared Name Press"
    ]

    bench = named(client, "Barbell Bench Press")
    client.patch(f"/api/exercises/{bench['id']}/favorite", json={"is_favorite": True})
    assert named(client, "Barbell Bench Press")["is_favorite"] is True
    assert named(other_client, "Barbell Bench Press")["is_favorite"] is False


def test_body_measurements_goals_and_cardio_are_private(client, other_client):
    day = {"measurement_date": "2026-07-01", "weight_kg": 80}
    mine = client.post("/api/body-measurements", json=day).json()
    theirs = other_client.post("/api/body-measurements", json={**day, "weight_kg": 95})
    assert theirs.status_code == 200 and theirs.json()["id"] != mine["id"]
    assert [item["weight_kg"] for item in client.get("/api/body-measurements").json()] == [80]
    assert [item["weight_kg"] for item in other_client.get("/api/body-measurements").json()] == [95]
    assert other_client.delete(f"/api/body-measurements/{mine['id']}").status_code != 204
    assert other_client.delete(f"/api/body-measurements/{mine['id']}").status_code == 404
    csv_text = other_client.get("/api/body-measurements/export.csv").text
    assert "80" not in csv_text.replace("2026", "") and "95" in csv_text
    imported = other_client.post(
        "/api/body-measurements/import",
        files={
            "file": ("w.csv", b"Date,Weight (kg),Body Fat (%),Notes\n2026-07-01,90,,\n", "text/csv")
        },
    )
    assert imported.status_code == 201
    assert client.get("/api/body-measurements").json()[0]["weight_kg"] == 80

    goal = {
        "start_date": "2026-07-01",
        "target_date": "2026-12-01",
        "start_weight_kg": 80,
        "target_weight_kg": 75,
    }
    goal_id = client.post("/api/body-weight-goals", json=goal).json()["id"]
    assert other_client.get("/api/body-weight-goals").json() == []
    assert other_client.put(f"/api/body-weight-goals/{goal_id}", json=goal).status_code == 404
    assert other_client.delete(f"/api/body-weight-goals/{goal_id}").status_code == 404
    other_goal = other_client.post("/api/body-weight-goals", json=goal).json()["id"]
    # Activating another user's goal must not deactivate mine.
    assert client.get("/api/body-weight-goals").json()[0]["active"] is True
    assert other_goal != goal_id

    cardio = {"session_date": "2026-07-01", "activity_type": "Walk", "duration_minutes": 30}
    cardio_id = client.post("/api/cardio", json=cardio).json()["id"]
    assert other_client.get("/api/cardio").json()["sessions"] == []
    assert other_client.put(f"/api/cardio/{cardio_id}", json=cardio).status_code == 404
    assert (
        other_client.patch(
            f"/api/cardio/{cardio_id}/calories", json={"calories_kcal": 5}
        ).status_code
        == 404
    )
    assert (
        other_client.patch(f"/api/cardio/{cardio_id}/metrics", json={"distance_km": 2}).status_code
        == 404
    )
    assert other_client.delete(f"/api/cardio/{cardio_id}").status_code == 404
    assert other_client.get("/api/dashboard").json()["total_cardio_sessions"] == 0


def test_machine_photo_files_are_only_served_to_their_owner(client, other_client):
    bench = named(client, "Barbell Bench Press")
    photo = upload_photo(client, bench["id"]).json()
    assert client.get(photo["full_url"]).status_code == 200
    assert client.get(photo["thumbnail_url"]).status_code == 200
    assert other_client.get(photo["full_url"]).status_code == 404
    assert other_client.get(photo["thumbnail_url"]).status_code == 404
    assert TestClient(client.app).get(photo["full_url"]).status_code == 401
    assert (
        other_client.patch(
            f"/api/machine-photos/{photo['id']}", json={"caption": "Mine now"}
        ).status_code
        == 404
    )
    assert other_client.delete(f"/api/machine-photos/{photo['id']}").status_code == 404
    other_bench = named(other_client, "Barbell Bench Press")
    pinned = workout_payload(other_bench["id"])
    pinned["movements"][0]["machine_photo_ids"] = [photo["id"]]
    assert other_client.post("/api/workouts", json=pinned).status_code == 422
    assert client.get(f"/api/exercises/{bench['id']}/machine-photos").json()[0]["id"] == photo["id"]


def test_preferences_colors_and_cache_revisions_are_per_user(client, other_client):
    assert (
        client.put(
            "/api/training-preferences",
            json={"preferred_weight_unit": "lb", "week_start": "sunday", "zone2_goal_minutes": 90},
        ).status_code
        == 200
    )
    mine = client.get("/api/training-preferences").json()
    theirs = other_client.get("/api/training-preferences").json()
    assert mine["preferred_weight_unit"] == "lb" and theirs["preferred_weight_unit"] == "kg"
    assert theirs["week_start"] == "monday" and theirs["zone2_goal_minutes"] == 150

    colors = client.get("/api/workout-type-colors").json()
    assert (
        client.put("/api/workout-type-colors", json={**colors, "push": "#123456"}).status_code
        == 200
    )
    assert other_client.get("/api/workout-type-colors").json()["push"] == colors["push"]

    before = other_client.get("/api/workouts/revision").json()["revision"]
    own_before = client.get("/api/workouts/revision").json()["revision"]
    bench = named(client, "Barbell Bench Press")
    client.post("/api/workouts", json=workout_payload(bench["id"]))
    assert other_client.get("/api/workouts/revision").json()["revision"] == before
    assert client.get("/api/workouts/revision").json()["revision"] != own_before
    assert before != own_before  # accounts never share a starting revision


def test_video_sessions_are_admin_only_by_default(client, other_client):
    restricted = other_client.get("/api/sessions")
    assert restricted.status_code == 403
    assert restricted.json()["error"]["code"] == "video_uploads_restricted"
    assert (
        other_client.post(
            "/api/sessions",
            json={"name": "x", "workout_date": "2026-07-12", "expected_clip_count": 1},
        ).status_code
        == 403
    )
    assert other_client.get("/api/sessions/anything").status_code == 403
    assert client.get("/api/sessions").status_code == 200


def test_video_sessions_are_scoped_to_their_owner(client, other_client, fake_upload, monkeypatch):
    monkeypatch.setattr(client.app.state.settings, "video_uploads", "everyone")
    session = create_session(client)
    clip = upload(client, session["id"], "clip-1", 0).json()
    base = f"/api/sessions/{session['id']}"

    assert client.get("/api/sessions").json()[0]["id"] == session["id"]
    assert other_client.get("/api/sessions").json() == []
    for method, url in (
        ("GET", base),
        ("DELETE", base),
        ("POST", f"{base}/process"),
        ("POST", f"{base}/retry-processing"),
        ("POST", f"{base}/retry-youtube-processing"),
        ("POST", f"{base}/cancel"),
        ("DELETE", f"{base}/clips/{clip['id']}"),
    ):
        response = other_client.request(method, url)
        assert response.status_code == 404, (method, url)
        assert response.json()["error"]["code"] == "session_not_found"
    assert (
        other_client.patch(f"{base}/clips/{clip['id']}", json={"exercise_label": "x"}).status_code
        == 404
    )
    assert (
        other_client.post(
            f"{base}/clips/reorder", json={"clips": [{"clip_id": clip["id"], "order_index": 0}]}
        ).status_code
        == 404
    )
    assert upload(other_client, session["id"], "clip-2", 0).status_code == 404
    assert client.get(base).status_code == 200


# --- push notifications ---


def test_push_subscription_belongs_to_the_user_who_registered_it(client, other_client):
    endpoint = "https://push.example.test/shared-device"
    subscription = {"endpoint": endpoint, "p256dh": "k", "auth": "a"}
    reminder = {
        "endpoint": endpoint,
        "timer_id": "one",
        "started_at": datetime.now(UTC).timestamp(),
    }
    assert (
        client.post("/api/notifications/push/subscriptions", json=subscription).status_code == 204
    )
    assert client.put("/api/notifications/push/active-workout", json=reminder).status_code == 204
    # Another account cannot schedule alerts for it, cancel it, or delete it.
    assert (
        other_client.put("/api/notifications/push/active-workout", json=reminder).status_code == 404
    )
    other_client.post("/api/notifications/push/active-workout/cancel", json=reminder)
    other_client.request(
        "DELETE", "/api/notifications/push/subscriptions", json={"endpoint": endpoint}
    )
    with SessionLocal() as db:
        assert db.scalar(select(PushSubscription.user_id)) == client.user["id"]
        assert db.scalar(select(ActiveWorkoutReminder.cancelled)) is False

    # Registering the same endpoint under another account moves it, and clears the old reminder.
    assert (
        other_client.post("/api/notifications/push/subscriptions", json=subscription).status_code
        == 204
    )
    with SessionLocal() as db:
        assert db.scalar(select(func.count(PushSubscription.id))) == 1
        assert db.scalar(select(PushSubscription.user_id)) == other_client.user["id"]
        assert db.scalar(select(ActiveWorkoutReminder.cancelled)) is True
    assert client.put("/api/notifications/push/active-workout", json=reminder).status_code == 404
    assert (
        other_client.put("/api/notifications/push/active-workout", json=reminder).status_code == 204
    )


def test_notifications_only_reach_the_owning_users_subscriptions(monkeypatch, tmp_path):
    import pywebpush

    from app.notifications import send_push_notification

    alice, bob = make_user("alice"), make_user("bob")
    with SessionLocal() as db:
        db.add_all(
            [
                PushSubscription(
                    user_id=alice, endpoint="https://p.test/alice", p256dh="k", auth="a"
                ),
                PushSubscription(user_id=bob, endpoint="https://p.test/bob", p256dh="k", auth="a"),
                PushSubscription(endpoint="https://p.test/legacy", p256dh="k", auth="a"),
            ]
        )
        db.commit()
    sent: list[str] = []
    monkeypatch.setattr(
        pywebpush,
        "webpush",
        lambda subscription_info, **_: sent.append(subscription_info["endpoint"]),
    )
    settings = get_settings().model_copy(
        update={"web_push_vapid_private_key_path": tmp_path / "vapid.pem"}
    )

    assert send_push_notification(SessionLocal, settings, title="t", body="b", user_id=alice)
    assert sent == ["https://p.test/alice"]
    sent.clear()
    assert (
        send_push_notification(
            SessionLocal,
            settings,
            title="t",
            body="b",
            user_id=bob,
            endpoint="https://p.test/alice",
        )
        is False
    )
    assert sent == []


def test_youtube_completion_alert_goes_only_to_the_session_owner(monkeypatch):
    from app.processing import SessionProcessor

    class ReadyUploader:
        is_mock = False

        def processing_status(self, _video_id: str) -> str:
            return "succeeded"

    owner = make_user("video-owner", is_admin=True)
    make_user("bystander")
    with SessionLocal() as db:
        session = WorkoutSession(
            user_id=owner,
            name="Push day",
            workout_date=date(2026, 7, 12),
            expected_clip_count=1,
            uploaded_clip_count=1,
            status="youtube_processing",
            youtube_video_id="video",
        )
        db.add(session)
        db.commit()
        session_id = session.id
    sent: list[dict] = []
    monkeypatch.setattr("app.processing.send_push_notification", lambda *_, **kw: sent.append(kw))
    SessionProcessor(SessionLocal, get_settings(), ReadyUploader()).check_youtube_processing(
        session_id
    )
    assert [item["user_id"] for item in sent] == [owner]


def test_video_links_only_touch_the_session_owners_workouts():
    from app.models import Clip as ClipModel
    from app.models import ClipUploadStatus, SessionStatus
    from app.processing import link_session_videos_to_workout

    owner, bystander = make_user("aaa"), make_user("bbb")
    with SessionLocal() as db:
        movements = {}
        for label, user_id in (("owner", owner), ("bystander", bystander)):
            exercise = Exercise(
                user_id=user_id,
                name="Back Squat",
                category=WorkoutCategory.LOWER,
                muscle_group="Quads",
            )
            workout = TrainingWorkout(
                user_id=user_id,
                name="Lower body",
                workout_date=date(2026, 7, 12),
                category=WorkoutCategory.LOWER,
            )
            movement = WorkoutMovement(exercise=exercise, order_index=0)
            movement.sets.append(WorkoutSet(order_index=0, reps=5, weight_kg=100, completed=True))
            workout.movements.append(movement)
            db.add(workout)
            movements[label] = movement
        session = WorkoutSession(
            user_id=owner,
            name="Lower body",
            workout_date=date(2026, 7, 12),
            expected_clip_count=1,
            uploaded_clip_count=1,
            status=SessionStatus.COMPLETE,
            youtube_video_id="video",
        )
        clip = ClipModel(
            client_clip_id="c",
            original_filename="a.mov",
            stored_filename="a.mov",
            order_index=0,
            exercise_label="Back squat",
            file_size=1,
            upload_status=ClipUploadStatus.UPLOADED,
            duration_ms=1000,
        )
        session.clips.append(clip)
        session.timestamps.append(
            Timestamp(
                clip=clip,
                order_index=0,
                label="Back squat - Set 1",
                start_seconds=0,
                youtube_url="https://youtu.be/video?t=0",
            )
        )
        db.add(session)
        db.commit()
        assert link_session_videos_to_workout(db, session) == 1
        db.commit()
        assert "youtu.be" in (movements["owner"].notes or "")
        assert movements["bystander"].notes is None


# --- startup ---


def test_fresh_database_starts_without_accounts_or_seeded_rows():
    with app_client(seed_sample_data=True) as fresh:
        assert fresh.get("/api/auth/me").status_code == 401
        with SessionLocal() as db:
            assert db.scalar(select(func.count(User.id))) == 0
            assert db.scalar(select(func.count(Exercise.id))) == 0
            assert db.scalar(select(func.count(TrainingWorkout.id))) == 0


def test_restart_resynchronizes_each_accounts_default_exercises(client, other_client):
    with SessionLocal() as db:
        db.execute(
            Exercise.__table__.delete().where(
                Exercise.user_id == client.user["id"], Exercise.name == "Pec Deck"
            )
        )
        db.commit()
    with TestClient(create_app()):
        pass
    assert "Pec Deck" in {item["name"] for item in client.get("/api/exercises").json()}
    assert "Pec Deck" in {item["name"] for item in other_client.get("/api/exercises").json()}
    with SessionLocal() as db:
        names = list(db.scalars(select(Exercise.name).where(Exercise.user_id == client.user["id"])))
        assert len(names) == len(set(names))


@pytest.mark.parametrize("path", ["/api/auth/me", "/api/exercises"])
def test_unauthenticated_responses_use_the_standard_error_shape(anonymous_client, path):
    response = anonymous_client.get(path)
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "not_authenticated", "message": "Sign in to continue."}
    }
