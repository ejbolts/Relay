from datetime import UTC, date, datetime, timedelta
from io import BytesIO

import pytest
from conftest import TEST_PASSWORD, register_user
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select, update
from test_auth import named, upload_photo

from app.database import SessionLocal
from app.models import Friendship, PersonalRecord, ProfileSharing, TrainingWorkout, User

NOTHING_EXTRA = {
    "share_notes": False,
    "share_body_weight": False,
    "share_goals": False,
    "share_machine_photos": False,
}
EVERYTHING = {key: True for key in NOTHING_EXTRA}


def share(test_client: TestClient, visibility: str = "public", **choices: bool) -> dict:
    response = test_client.put("/api/sharing", json={"visibility": visibility, **choices})
    assert response.status_code == 200, response.text
    return response.json()


def profile(test_client: TestClient, owner: TestClient):
    return test_client.get(f"/api/sharing/profiles/{owner.user['id']}")


def befriend(requester: TestClient, recipient: TestClient) -> None:
    """Send a friend request and accept it."""
    sent = requester.post(f"/api/sharing/friends/{recipient.user['id']}")
    assert sent.status_code == 200, sent.text
    accepted = recipient.post(f"/api/sharing/friends/{requester.user['id']}/accept")
    assert accepted.json() == {"status": "friends"}, accepted.text


def jpeg() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (300, 300), "#336699").save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.mark.parametrize("stored_choices", [True, False])
def test_private_owner_can_preview_without_exposing_profile(client, other_client, stored_choices):
    share(other_client)
    if stored_choices:
        share(client, "private", **NOTHING_EXTRA)
    else:
        with SessionLocal() as db:
            choices = db.get(ProfileSharing, client.user["id"])
            if choices:
                db.delete(choices)
                db.commit()
    exercise = named(client, "Barbell Bench Press")["id"]
    created = client.post(
        "/api/workouts",
        json={
            "name": "My private training",
            "workout_date": date.today().isoformat(),
            "category": "push",
            "notes": "Not shared",
            "movements": [{"exercise_id": exercise, "sets": [{"reps": 8, "weight_kg": 50}]}],
        },
    )
    assert created.status_code == 201, created.text
    own = profile(client, client)
    assert own.status_code == 200, own.text
    assert own.json()["is_you"] is True
    assert own.json()["can_view"] is True
    assert own.json()["visibility"] == "private"
    assert own.json()["workout_count"] == 1
    assert own.json()["body_weight"] is None
    assert own.json()["goals"] is None
    base = f"/api/sharing/profiles/{client.user['id']}"
    page = client.get(base + "/workouts").json()
    assert page["total"] == 1
    assert page["workouts"][0]["notes"] is None
    assert client.get(base + "/workout-filters").json()["exercises"][0]["id"] == exercise
    assert profile(other_client, client).status_code == 404
    assert other_client.get(base + "/workouts").status_code == 404
    assert other_client.get(base + "/workout-filters").status_code == 404
    assert profile(client, other_client).status_code == 403
    assert client.get("/api/sharing").json()["visibility"] == "private"


def test_shared_consistency_uses_owner_history_and_respects_access(client, other_client):
    share(client)
    share(other_client)
    today = date.today()
    exercise = named(other_client, "Barbell Bench Press")["id"]
    custom = other_client.post(
        "/api/workout-types", json={"name": "Torso", "color": "#abcdef"}
    ).json()
    # More history than the first shared workout page, plus repeated dates and old history.
    dates = [today - timedelta(days=offset) for offset in range(15)]
    dates += [today, today - timedelta(days=200)]
    for day in dates:
        response = other_client.post(
            "/api/workouts",
            json={
                "name": "Owner training",
                "workout_date": day.isoformat(),
                "category": "other",
                "workout_type_id": custom["id"],
                "movements": [
                    {
                        "exercise_id": exercise,
                        "sets": [
                            {"reps": 8, "weight_kg": 40, "bodyweight_kg": 81, "completed": True}
                        ],
                    }
                ],
            },
        )
        assert response.status_code == 201, response.text
    # Samples must neither extend the streak nor add calendar dates.
    with SessionLocal() as db:
        db.add(
            TrainingWorkout(
                user_id=other_client.user["id"],
                name="Sample",
                category="push",
                workout_date=today - timedelta(days=15),
                is_sample=True,
            )
        )
        db.commit()
    result = profile(client, other_client).json()["consistency"]
    assert result["current_streak"] == 15
    assert result["training_days"] == 15
    assert len(result["heatmap"]) == 16
    assert all(day["workouts"] == [] for day in result["heatmap"])
    assert result["heatmap"][-1]["workout_count"] == 2
    assert result["heatmap"][-1]["workout_types"][0]["id"] == custom["id"]
    assert result["heatmap"][-1]["workout_types"][0]["color"] == "#abcdef"
    assert profile(other_client, client).json()["consistency"]["heatmap"] == []
    # The owner's home dashboard agrees on streak and dates (apart from the sample).
    dashboard = other_client.get("/api/dashboard").json()
    assert {day["workout_date"] for day in result["heatmap"]} < {
        day["workout_date"] for day in dashboard["heatmap"]
    }
    share(other_client, "followers")
    assert profile(client, other_client).json()["consistency"] is None
    assert client.post(f"/api/sharing/friends/{other_client.user['id']}").is_success
    assert profile(client, other_client).json()["consistency"] is None
    assert other_client.post(f"/api/sharing/friends/{client.user['id']}/accept").is_success
    assert profile(client, other_client).json()["consistency"] == result
    # Going private hides the profile entirely, including the calendar.
    share(other_client, "private")
    assert profile(client, other_client).status_code == 404


def detailed_workout(exercise_id: str, photo_id: str, name: str = "Push day") -> dict:
    return {
        "name": name,
        "workout_date": date.today().isoformat(),
        "category": "push",
        "notes": "Felt strong",
        "movements": [
            {
                "exercise_id": exercise_id,
                "notes": "Video - Bench @ 0:10: https://youtu.be/private",
                "machine_photo_ids": [photo_id],
                "sets": [
                    {
                        "reps": 5,
                        "weight_kg": 100,
                        "bodyweight_kg": 82.5,
                        "notes": "Paused",
                        "completed": True,
                    },
                    {
                        # A first set establishes the baseline; improving it earns a Volume PR.
                        "reps": 6,
                        "weight_kg": 100,
                        "bodyweight_kg": 82.5,
                        "completed": True,
                    },
                ],
            }
        ],
    }


def add_training_history(test_client: TestClient) -> dict:
    bench = named(test_client, "Barbell Bench Press")["id"]
    photo = upload_photo(test_client, bench).json()
    sample_only_photo = upload_photo(test_client, bench, "Sample bench").json()
    workout = test_client.post("/api/workouts", json=detailed_workout(bench, photo["id"]))
    assert workout.status_code == 201, workout.text
    sample = test_client.post(
        "/api/workouts", json=detailed_workout(bench, sample_only_photo["id"], name="Sample day")
    ).json()
    with SessionLocal() as db:
        db.execute(
            update(TrainingWorkout).where(TrainingWorkout.id == sample["id"]).values(is_sample=True)
        )
        db.commit()
    today = date.today()
    assert test_client.post(
        "/api/body-measurements",
        json={"measurement_date": today.isoformat(), "weight_kg": 82.5, "notes": "Morning"},
    ).is_success
    assert test_client.post(
        "/api/body-weight-goals",
        json={
            "start_date": today.isoformat(),
            "target_date": (today + timedelta(days=60)).isoformat(),
            "start_weight_kg": 82.5,
            "target_weight_kg": 78,
        },
    ).is_success
    assert test_client.post(
        "/api/cardio",
        json={
            "session_date": today.isoformat(),
            "activity_type": "Bike",
            "duration_minutes": 40,
            "qualifies_zone2": True,
            "notes": "Easy spin",
        },
    ).is_success
    assert test_client.put(
        "/api/profile/photo", files={"file": ("me.jpg", jpeg(), "image/jpeg")}
    ).is_success
    return {"workout": workout.json(), "photo": photo, "sample_only_photo": sample_only_photo}


def test_new_accounts_start_public_and_keep_choices(client):
    assert client.get("/api/sharing").json() == {
        "visibility": "public",
        **NOTHING_EXTRA,
        "pending_requests": 0,
    }
    saved = share(client, "followers", share_goals=True)
    assert saved == {
        "visibility": "followers",
        **NOTHING_EXTRA,
        "share_goals": True,
        "pending_requests": 0,
    }
    assert client.get("/api/sharing").json() == saved

    # Choices are kept while private, so sharing again restores them.
    private = share(client, "private", share_goals=True)
    assert private["visibility"] == "private" and private["share_goals"] is True
    assert client.put("/api/sharing", json={"visibility": "everyone"}).status_code == 422
    assert client.get("/api/sharing").headers["cache-control"] == "no-store"


def test_people_search_matches_names_and_exact_uuid_without_wildcards(client, other_client):
    share(client)
    share(other_client)
    target_id = other_client.user["id"]
    with SessionLocal() as db:
        db.execute(
            update(User)
            .where(User.id == target_id)
            .values(display_name="Case_100% Lifter Élodie", username="tagged.user")
        )
        db.commit()
    for term in (
        "  case_100%  ",
        "LIFTER",
        "élodie",
        "TAGGED.",
        "%",
        "_",
        target_id.upper(),
        target_id.replace("-", ""),
    ):
        response = client.get("/api/sharing/profiles", params={"q": term})
        assert response.status_code == 200
        assert [item["id"] for item in response.json()] == [target_id]
        assert "username" not in response.json()[0]
    for term in ("not-a-uuid", target_id[:8], "  "):
        assert client.get("/api/sharing/profiles", params={"q": term}).json() == []
    assert len(client.get("/api/sharing/profiles").json()) == 2
    assert client.get("/api/sharing/profiles", params={"q": "x" * 101}).status_code == 422


def test_people_search_keeps_profile_permissions(client, other_client):
    share(client)
    share(other_client, "private")
    target_id = other_client.user["id"]
    terms = (target_id, other_client.user["username"], other_client.user["display_name"])
    for term in terms:
        assert client.get("/api/sharing/profiles", params={"q": term}).json() == []
    share(other_client, "followers")
    [found] = client.get("/api/sharing/profiles", params={"q": target_id}).json()
    assert found["can_view"] is False and found["workout_count"] is None
    assert found["shares"] is None and "username" not in found
    assert client.patch(f"/api/admin/users/{target_id}", json={"disabled": True}).is_success
    for term in terms:
        assert client.get("/api/sharing/profiles", params={"q": term}).json() == []
    share(client, "private")
    assert client.get("/api/sharing/profiles", params={"q": target_id}).status_code == 403


def test_private_members_neither_see_others_nor_appear(client, other_client):
    share(client)
    share(other_client, "private")
    response = other_client.get("/api/sharing/profiles")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "sharing_required"
    assert profile(other_client, client).status_code == 403

    # A private member is indistinguishable from one who does not exist.
    assert [item["is_you"] for item in client.get("/api/sharing/profiles").json()] == [True]
    assert profile(client, other_client).status_code == 404
    assert client.get("/api/sharing/profiles/missing").status_code == 404
    assert client.post(f"/api/sharing/friends/{other_client.user['id']}").status_code == 404
    assert client.post(f"/api/sharing/friends/{client.user['id']}").status_code == 422


def test_public_profiles_are_open_but_friend_requests_still_need_accepting(client, other_client):
    add_training_history(client)
    share(client, "public")
    share(other_client, "followers")

    [owner] = [
        item for item in other_client.get("/api/sharing/profiles").json() if not item["is_you"]
    ]
    assert owner["visibility"] == "public" and owner["can_view"] is True
    assert owner["workout_count"] == 1
    assert owner["friend_status"] == "none"
    assert "username" not in owner

    sent = other_client.post(f"/api/sharing/friends/{client.user['id']}")
    assert sent.json() == {"status": "outgoing"}
    requester = profile(client, other_client).json()
    assert requester["friend_status"] == "incoming"
    # The public member still cannot see a friends-only requester before accepting.
    assert requester["can_view"] is False
    friends = client.get("/api/sharing/friends").json()
    assert [item["display_name"] for item in friends["requests"]] == ["Other"]
    assert friends["friends"] == [] and friends["sent"] == []
    sent_by_other = other_client.get("/api/sharing/friends").json()["sent"]
    assert [item["display_name"] for item in sent_by_other] == ["Owner"]


def test_friendships_are_mutual_and_start_when_accepted(client, other_client):
    share(client, "followers")
    share(other_client, "followers")
    owner_id, other_id = client.user["id"], other_client.user["id"]
    requested = datetime(2026, 10, 1, 12, tzinfo=UTC)
    assert client.post(f"/api/sharing/friends/{other_id}").json() == {"status": "outgoing"}
    with SessionLocal() as db:
        friendship = db.scalar(select(Friendship))
        friendship.created_at = requested
        db.commit()
    detail = profile(client, other_client).json()
    assert detail["friend_status"] == "outgoing" and detail["friends_since"] is None
    assert profile(other_client, client).json()["friend_status"] == "incoming"
    # Asking again changes nothing; their own request accepts yours.
    assert client.post(f"/api/sharing/friends/{other_id}").json() == {"status": "outgoing"}
    assert other_client.post(f"/api/sharing/friends/{owner_id}").json() == {"status": "friends"}
    mine = profile(client, other_client).json()
    theirs = profile(other_client, client).json()
    assert mine["friend_status"] == theirs["friend_status"] == "friends"
    assert mine["can_view"] is True and theirs["can_view"] is True
    # Accepting starts the friendship, rather than the request or signup date.
    assert mine["friends_since"] == theirs["friends_since"]
    assert datetime.fromisoformat(mine["friends_since"].replace("Z", "+00:00")) > requested
    listed = next(
        item for item in client.get("/api/sharing/profiles").json() if item["id"] == other_id
    )
    assert listed["friends_since"] == mine["friends_since"]
    [friend] = client.get("/api/sharing/friends").json()["friends"]
    assert friend["id"] == other_id and friend["since"] == mine["friends_since"]
    # Either member can end the friendship for both.
    assert other_client.delete(f"/api/sharing/friends/{owner_id}").status_code == 204
    ended = profile(client, other_client).json()
    assert ended["friend_status"] == "none" and ended["can_view"] is False
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Friendship)) == 0


def test_friends_only_profiles_need_an_accepted_friend_request(client, other_client):
    add_training_history(client)
    share(client, "followers", **EVERYTHING)
    share(other_client, "public")
    owner_id = client.user["id"]
    other_id = other_client.user["id"]

    # Before accepting: name and photo only.
    locked = profile(other_client, client).json()
    assert locked["visibility"] == "followers"
    assert locked["can_view"] is False
    assert locked["workout_count"] is None and locked["shares"] is None
    assert locked["body_weight"] is None and locked["goals"] is None
    assert locked["profile_photo_url"].startswith(f"/api/sharing/profiles/{owner_id}/photo")
    assert other_client.get(locked["profile_photo_url"]).status_code == 200
    blocked = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "friend_required"

    assert other_client.post(f"/api/sharing/friends/{owner_id}").json() == {"status": "outgoing"}
    assert other_client.post(f"/api/sharing/friends/{owner_id}").json() == {"status": "outgoing"}
    assert profile(other_client, client).json()["can_view"] is False
    assert client.get("/api/sharing").json()["pending_requests"] == 1
    requests = client.get("/api/sharing/friends").json()["requests"]
    assert [item["display_name"] for item in requests] == ["Other"]
    # Only the member who was asked can accept.
    assert other_client.post(f"/api/sharing/friends/{owner_id}/accept").status_code == 404

    # Declining removes the request; accepting a new one opens the profile.
    assert client.delete(f"/api/sharing/friends/{other_id}").status_code == 204
    assert profile(other_client, client).json()["friend_status"] == "none"
    other_client.post(f"/api/sharing/friends/{owner_id}")
    accepted = client.post(f"/api/sharing/friends/{other_id}/accept")
    assert accepted.json() == {"status": "friends"}
    opened = profile(other_client, client).json()
    assert opened["can_view"] is True and opened["friend_status"] == "friends"
    assert opened["body_weight"] is not None
    assert other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").status_code == 200
    assert client.get("/api/sharing").json()["pending_requests"] == 0

    # Removing a friend locks the profile again.
    assert client.delete(f"/api/sharing/friends/{other_id}").status_code == 204
    assert profile(other_client, client).json()["can_view"] is False
    missing = client.post(f"/api/sharing/friends/{other_id}/accept")
    assert missing.status_code == 404


def test_making_a_profile_public_keeps_friend_requests_waiting(client, other_client):
    share(client, "followers")
    share(other_client, "public")
    other_client.post(f"/api/sharing/friends/{client.user['id']}")
    assert share(client, "public")["pending_requests"] == 1
    assert profile(other_client, client).json()["friend_status"] == "outgoing"
    client.post(f"/api/sharing/friends/{other_client.user['id']}/accept")

    # Friends stay friends when the profile becomes friends-only again.
    share(client, "followers")
    assert profile(other_client, client).json()["can_view"] is True


def test_shared_profile_includes_only_the_chosen_parts(client, other_client):
    history = add_training_history(client)
    share(client, "public")
    share(other_client, "public")
    owner_id = client.user["id"]

    view = profile(other_client, client).json()
    assert view["workout_count"] == 1 and view["recent_workout_count"] == 1
    assert view["last_workout_date"] == date.today().isoformat()
    # Friends see the cardio and PR totals shown on the owner's Today.
    assert view["cardio_count"] == 1
    with SessionLocal() as db:
        records = db.scalars(
            select(PersonalRecord).where(
                PersonalRecord.user_id == owner_id,
                PersonalRecord.value > 0,
                PersonalRecord.record_type.in_(["weight", "reps_at_weight"]),
            )
        ).all()
    assert view["record_count"] == len(records) > 0
    assert view["shares"] == {
        key: False for key in ("notes", "body_weight", "goals", "machine_photos")
    }
    # The profile photo is always shared.
    assert other_client.get(view["profile_photo_url"]).headers["cache-control"] == (
        "private, no-cache"
    )
    assert view["body_weight"] is None and view["goals"] is None
    # Cardio is shared with workouts, without its notes unless notes are shared.
    [cardio] = view["cardio_sessions"]
    assert cardio["activity_type"] == "Bike" and cardio["duration_minutes"] == 40
    assert cardio["notes"] is None
    photo_path = f"/api/sharing/profiles/{owner_id}/machine-photos/{history['photo']['id']}"
    assert other_client.get(photo_path).status_code == 404

    page = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").json()
    assert page["total"] == 1  # The sample workout is never shared.
    [shared] = page["workouts"]
    assert shared["id"] == history["workout"]["id"]
    assert shared["notes"] is None
    [movement] = shared["movements"]
    assert movement["notes"] is None
    assert movement["machine_photos"] == []
    assert movement["sets"][0]["notes"] is None
    assert movement["sets"][0]["bodyweight_kg"] is None
    assert movement["sets"][0]["weight_kg"] == 100
    assert {record["workout_id"] for record in page["personal_records"]} == {shared["id"]}
    [record] = page["personal_records"]
    assert record["record_type"] == "reps_at_weight"
    assert record["value"] == 6 and record["weight_kg"] == 100

    share(client, "public", **EVERYTHING)
    view = profile(other_client, client).json()
    assert all(view["shares"].values())
    assert view["body_weight"] == [
        {"measurement_date": date.today().isoformat(), "weight_kg": 82.5, "body_fat_pct": None}
    ]
    assert view["goals"]["body_weight"]["target_weight_kg"] == 78
    # Unmeasured cardio cannot be assigned to a personal heart-rate zone.
    assert view["goals"]["zone2"]["completed_minutes"] == 0
    assert view["goals"]["cardio_goals"][0]["completed_minutes"] == 0
    assert [session["notes"] for session in view["cardio_sessions"]] == ["Easy spin"]

    [shared] = other_client.get(f"/api/sharing/profiles/{owner_id}/workouts").json()["workouts"]
    assert shared["notes"] == "Felt strong"
    [movement] = shared["movements"]
    assert movement["notes"].startswith("Video - Bench")
    assert movement["sets"][0]["notes"] == "Paused"
    assert movement["sets"][0]["bodyweight_kg"] == 82.5
    [photo] = movement["machine_photos"]
    assert photo["thumbnail_url"] == f"{photo_path}?variant=thumbnail"
    for url in (photo["thumbnail_url"], photo["full_url"]):
        image = other_client.get(url)
        assert image.status_code == 200 and image.headers["content-type"] == "image/webp"
    # A photo used only by sample workouts stays private.
    sample_only = (
        f"/api/sharing/profiles/{owner_id}/machine-photos/{history['sample_only_photo']['id']}"
    )
    assert other_client.get(sample_only).status_code == 404


def test_workouts_are_paged_newest_first(client, other_client):
    bench = named(client, "Barbell Bench Press")["id"]
    for days_ago in range(3):
        payload = {
            "name": f"Day {days_ago}",
            "workout_date": (date.today() - timedelta(days=days_ago)).isoformat(),
            "category": "push",
            "movements": [{"exercise_id": bench, "sets": [{"reps": 5, "weight_kg": 60}]}],
        }
        assert client.post("/api/workouts", json=payload).status_code == 201
    share(client)
    share(other_client)
    path = f"/api/sharing/profiles/{client.user['id']}/workouts"

    first = other_client.get(path, params={"limit": 2}).json()
    rest = other_client.get(path, params={"limit": 2, "offset": 2}).json()
    assert first["total"] == rest["total"] == 3
    assert [item["name"] for item in first["workouts"] + rest["workouts"]] == [
        "Day 0",
        "Day 1",
        "Day 2",
    ]
    assert other_client.get(path, params={"limit": 51}).status_code == 422


def test_shared_workout_filters_cover_full_history_and_filtered_pagination(client, other_client):
    history = add_training_history(client)
    bench = history["workout"]["movements"][0]["exercise"]["id"]
    squat = named(client, "Back Squat")["id"]
    older = detailed_workout(bench, history["photo"]["id"], "Older push")
    older["workout_date"] = (date.today() - timedelta(days=45)).isoformat()
    assert client.post("/api/workouts", json=older).status_code == 201
    lower = {
        "name": "Lower",
        "workout_date": (date.today() - timedelta(days=5)).isoformat(),
        "category": "lower",
        "movements": [{"exercise_id": squat, "sets": [{"reps": 5, "weight_kg": 60}]}],
    }
    assert client.post("/api/workouts", json=lower).status_code == 201
    share(client, "public", share_machine_photos=True)
    share(other_client)
    base = f"/api/sharing/profiles/{client.user['id']}"
    options = other_client.get(base + "/workout-filters").json()
    assert {item["id"] for item in options["exercises"]} == {bench, squat}
    assert [item["id"] for item in options["machines"]] == [history["photo"]["id"]]
    assert options["machines"][0]["thumbnail_url"].startswith(base + "/machine-photos/")
    first = other_client.get(base + "/workouts", params={"category": "push", "limit": 1}).json()
    rest = other_client.get(
        base + "/workouts", params={"category": "push", "limit": 1, "offset": 1}
    ).json()
    assert first["total"] == rest["total"] == 2
    assert first["workouts"][0]["name"] == "Push day"
    assert rest["workouts"][0]["name"] == "Older push"
    assert other_client.get(base + "/workouts", params={"exercise_id": squat}).json()["total"] == 1
    assert (
        other_client.get(
            base + "/workouts", params={"machine_photo_id": history["photo"]["id"]}
        ).json()["total"]
        == 2
    )
    page = other_client.get(
        base + "/workouts",
        params={
            "category": "push",
            "start_date": date.today().isoformat(),
            "end_date": date.today().isoformat(),
        },
    ).json()
    assert page["total"] == 1 and page["workouts"][0]["name"] == "Push day"
    assert (
        other_client.get(
            base + "/workouts", params={"exercise_id": "another-members-exercise"}
        ).json()["total"]
        == 0
    )
    assert (
        other_client.get(
            base + "/workouts", params={"machine_photo_id": history["sample_only_photo"]["id"]}
        ).json()["total"]
        == 0
    )
    assert (
        other_client.get(
            base + "/workouts", params={"start_date": "2026-10-10", "end_date": "2026-10-01"}
        ).status_code
        == 422
    )


def test_shared_filter_options_respect_profile_access_and_photo_sharing(client, other_client):
    history = add_training_history(client)
    share(client, "public")
    share(other_client)
    base = f"/api/sharing/profiles/{client.user['id']}"
    assert other_client.get(base + "/workout-filters").json()["machines"] == []
    assert (
        other_client.get(
            base + "/workouts", params={"machine_photo_id": history["photo"]["id"]}
        ).status_code
        == 403
    )
    share(client, "followers")
    assert other_client.get(base + "/workout-filters").status_code == 403
    assert other_client.get(base + "/workouts", params={"category": "push"}).status_code == 403
    share(client, "private")
    assert other_client.get(base + "/workout-filters").status_code == 404


def test_going_private_hides_the_profile_and_others(client, other_client):
    share(client)
    share(other_client)
    other_client.post(f"/api/sharing/friends/{client.user['id']}")
    client.post(f"/api/sharing/friends/{other_client.user['id']}/accept")
    assert profile(other_client, client).status_code == 200

    share(client, "private")
    assert profile(other_client, client).status_code == 404
    assert [item["is_you"] for item in other_client.get("/api/sharing/profiles").json()] == [True]
    assert other_client.get("/api/sharing/friends").json()["friends"] == []
    assert client.get("/api/sharing/profiles").status_code == 403
    assert client.get("/api/sharing/friends").json() == {
        "locked": True,
        "friends": [],
        "requests": [],
        "sent": [],
        "blocked": [],
    }
    # Removing a friend is always possible.
    assert other_client.delete(f"/api/sharing/friends/{client.user['id']}").status_code == 204
    share(client)
    assert profile(other_client, client).json()["friend_status"] == "none"


def test_disabled_and_deleted_accounts_are_not_shared(client, other_client):
    share(client)
    share(other_client)
    other_id = other_client.user["id"]
    assert client.patch(f"/api/admin/users/{other_id}", json={"disabled": True}).is_success
    assert client.get(f"/api/sharing/profiles/{other_id}").status_code == 404
    assert [item["id"] for item in client.get("/api/sharing/profiles").json()] == [
        client.user["id"]
    ]

    third = TestClient(client.app)
    third.user = register_user(third, "third", "Third")
    share(third, "followers")
    third.post(f"/api/sharing/friends/{client.user['id']}")
    client.post(f"/api/sharing/friends/{third.user['id']}")
    assert client.get("/api/sharing/profiles/" + third.user["id"]).json()["friend_status"] == (
        "friends"
    )
    assert third.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD}).is_success
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ProfileSharing)) == 2
        assert db.scalar(select(func.count()).select_from(Friendship)) == 0
    third.close()


def test_cardio_choice_is_no_longer_part_of_sharing(client, other_client):
    add_training_history(client)
    # An older app may still send the removed choice; it is ignored rather than rejected.
    saved = share(client, "public", share_cardio=False)
    assert "share_cardio" not in saved
    share(other_client, "public")
    view = profile(other_client, client).json()
    assert "cardio" not in view["shares"]
    assert len(view["cardio_sessions"]) == 1


def test_existing_accounts_without_choices_stay_private(client):
    with SessionLocal() as db:
        db.delete(db.get(ProfileSharing, client.user["id"]))
        db.commit()
    assert client.get("/api/sharing").json()["visibility"] == "private"


def test_friend_notifications_cover_requests_and_acceptances(client, other_client):
    target = client.user["id"]
    requester = other_client.user["id"]
    empty = {"requests": [], "accepted": [], "reactions": [], "comments": []}
    assert client.get("/api/sharing/notifications").json() == empty
    assert other_client.post(f"/api/sharing/friends/{target}").json()["status"] == "outgoing"
    # A retry does not create another event.
    other_client.post(f"/api/sharing/friends/{target}")
    notices = client.get("/api/sharing/notifications").json()
    assert [item["id"] for item in notices["requests"]] == [requester]
    assert notices["requests"][0]["is_read"] is False and notices["accepted"] == []
    assert other_client.get("/api/sharing/notifications").json() == empty
    # Reading a request keeps it actionable.
    request = notices["requests"][0]
    seen = {"kind": "request", "id": requester, "since": request["since"]}
    assert client.post("/api/sharing/notifications/read", json={"items": [seen]}).is_success
    [still_waiting] = client.get("/api/sharing/notifications").json()["requests"]
    assert still_waiting["is_read"] is True

    # Accepting tells the requester; the member who accepted gets no notice.
    client.post(f"/api/sharing/friends/{requester}/accept")
    assert client.get("/api/sharing/notifications").json() == empty
    [accepted] = other_client.get("/api/sharing/notifications").json()["accepted"]
    assert accepted["id"] == target and accepted["is_read"] is False
    assert other_client.post(
        f"/api/sharing/notifications/{target}/dismiss", json={"since": accepted["since"]}
    ).is_success
    assert other_client.get("/api/sharing/notifications").json()["accepted"][0]["is_read"] is True

    # A stale dismissal cannot consume a later acceptance.
    client.delete(f"/api/sharing/friends/{requester}")
    other_client.post(f"/api/sharing/friends/{target}")
    client.post(f"/api/sharing/friends/{requester}/accept")
    other_client.post(
        f"/api/sharing/notifications/{target}/dismiss", json={"since": accepted["since"]}
    )
    [renewed] = other_client.get("/api/sharing/notifications").json()["accepted"]
    assert renewed["is_read"] is False


def test_friends_only_search_request_and_notification_accept(client, other_client):
    share(client, "followers")
    target = client.user["id"]
    requester = other_client.user["id"]
    for term in (client.user["display_name"], client.user["username"], target):
        found = other_client.get("/api/sharing/profiles", params={"q": term}).json()
        owner = next(item for item in found if item["id"] == target)
        assert owner["can_view"] is False and owner["workout_count"] is None
    assert other_client.post(f"/api/sharing/friends/{target}").json()["status"] == "outgoing"
    assert other_client.get(f"/api/sharing/profiles/{target}/workouts").status_code == 403
    notices = client.get("/api/sharing/notifications").json()
    assert [item["id"] for item in notices["requests"]] == [requester]
    assert notices["accepted"] == []
    assert client.post(f"/api/sharing/friends/{requester}/accept").status_code == 200
    notices = client.get("/api/sharing/notifications").json()
    assert notices["requests"] == [] and notices["accepted"] == []
    assert other_client.get(f"/api/sharing/profiles/{target}").json()["can_view"] is True
    other_client.delete(f"/api/sharing/friends/{target}")
    other_client.post(f"/api/sharing/friends/{target}")
    assert client.delete(f"/api/sharing/friends/{requester}").status_code == 204
    assert client.get("/api/sharing/notifications").json()["requests"] == []
