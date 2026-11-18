import importlib.util
from datetime import date, timedelta
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from conftest import TEST_PASSWORD
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text, update
from test_account_archive import download, rebuild, send
from test_account_limits import assert_refused_quietly, set_limits
from test_auth import jpeg_bytes, named, workout_payload
from test_sharing import befriend, share

from app.account_limits import PHOTO_NOT_UPLOADED
from app.config import get_settings
from app.database import SessionLocal
from app.models import TrainingWorkout, WorkoutPhoto
from app.workout_photos import MAX_PHOTOS_PER_WORKOUT


def log_workout(test_client, name: str = "Friday push", days_ago: int = 0, **fields) -> dict:
    payload = workout_payload(named(test_client, "Barbell Bench Press")["id"], name)
    payload["workout_date"] = (date.today() - timedelta(days=days_ago)).isoformat()
    response = test_client.post("/api/workouts", json={**payload, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def add_photo(test_client, workout_id: str):
    return test_client.post(
        f"/api/workouts/{workout_id}/photos",
        files={"file": ("gym.jpg", jpeg_bytes(), "image/jpeg")},
    )


def mark_sample(condition) -> None:
    with SessionLocal() as db:
        db.execute(update(TrainingWorkout).where(condition).values(is_sample=True))
        db.commit()


def photo_files() -> set[str]:
    return {path.name for path in get_settings().machine_photos_dir.iterdir()}


def timeline(test_client, **params) -> dict:
    response = test_client.get("/api/sharing/timeline", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_owner_adds_views_and_removes_workout_photos(client, other_client):
    workout = log_workout(client)
    assert workout["photos"] == []
    revision = client.get("/api/workouts/revision").json()["revision"]

    added = add_photo(client, workout["id"])
    assert added.status_code == 201, added.text
    photo = added.json()
    assert (photo["width"], photo["height"]) == (64, 48)
    assert len(photo_files()) == 2
    # Other devices are told to reload, but the workout's own edit revision is untouched.
    assert client.get("/api/workouts/revision").json()["revision"] != revision
    saved = client.get(f"/api/workouts/{workout['id']}").json()
    assert [item["id"] for item in saved["photos"]] == [photo["id"]]
    assert saved["revision"] == workout["revision"]
    for variant in ("thumbnail_url", "full_url"):
        image = client.get(photo[variant])
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/webp"
        # Another account can neither load nor delete it.
        assert other_client.get(photo[variant]).status_code == 404
    assert other_client.delete(f"/api/workout-photos/{photo['id']}").status_code == 404
    assert add_photo(other_client, workout["id"]).status_code == 404

    assert client.delete(f"/api/workout-photos/{photo['id']}").status_code == 204
    assert client.get(f"/api/workouts/{workout['id']}").json()["photos"] == []
    assert client.get(photo["full_url"]).status_code == 404
    assert photo_files() == set()


def test_editing_a_workout_keeps_its_photos(client):
    workout = log_workout(client)
    photo = add_photo(client, workout["id"]).json()
    payload = workout_payload(named(client, "Barbell Bench Press")["id"], "Renamed")
    # An app from before photos existed sends no photo field and must not remove them.
    edited = client.put(f"/api/workouts/{workout['id']}", json=payload)
    assert edited.status_code == 200, edited.text
    assert edited.json()["name"] == "Renamed"
    assert [item["id"] for item in edited.json()["photos"]] == [photo["id"]]
    assert client.get(photo["full_url"]).status_code == 200


def test_workout_photo_limits(client, other_client):
    # A workout holds at most three photos; the app hides Add photo at the same number.
    assert MAX_PHOTOS_PER_WORKOUT == 3
    workout = log_workout(other_client)
    for _ in range(MAX_PHOTOS_PER_WORKOUT):
        assert add_photo(other_client, workout["id"]).status_code == 201
    full = add_photo(other_client, workout["id"])
    assert full.status_code == 422
    assert full.json()["error"] == {
        "code": "too_many_workout_photos",
        "message": "A workout can have up to 3 photos.",
    }
    assert len(client.get("/api/workouts").json()) == 0
    assert len(other_client.get(f"/api/workouts/{workout['id']}").json()["photos"]) == 3
    assert len(photo_files()) == MAX_PHOTOS_PER_WORKOUT * 2

    # The account total is refused quietly, like the other account limits.
    set_limits(client, workout_photos_per_account=MAX_PHOTOS_PER_WORKOUT)
    second = log_workout(other_client, "Saturday pull", days_ago=1)
    assert_refused_quietly(add_photo(other_client, second["id"]), PHOTO_NOT_UPLOADED)
    assert len(photo_files()) == MAX_PHOTOS_PER_WORKOUT * 2

    unreadable = client.post(
        f"/api/workouts/{log_workout(client)['id']}/photos",
        files={"file": ("notes.jpg", b"not an image", "image/jpeg")},
    )
    assert unreadable.status_code == 422
    assert unreadable.json()["error"]["code"] == "invalid_photo"


def test_deleting_workouts_and_accounts_removes_photo_files(client, other_client):
    kept = log_workout(other_client)
    assert add_photo(other_client, kept["id"]).status_code == 201
    others = photo_files()

    first = log_workout(client)
    second = log_workout(client, "Saturday pull", days_ago=1)
    for workout in (first, second):
        assert add_photo(client, workout["id"]).status_code == 201
    assert len(photo_files()) == 6

    assert client.delete(f"/api/workouts/{first['id']}").status_code == 204
    assert len(photo_files()) == 4
    deleted = client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert deleted.status_code == 204
    assert photo_files() == others
    with SessionLocal() as db:
        assert db.scalar(select(WorkoutPhoto.workout_id)) == kept["id"]


def test_removing_sample_workouts_removes_their_photo_files(client):
    workout = log_workout(client)
    assert add_photo(client, workout["id"]).status_code == 201
    mark_sample(TrainingWorkout.id == workout["id"])
    assert client.delete("/api/sample-data").status_code == 204
    assert photo_files() == set()


def test_friends_see_workout_photos_only_while_the_workout_is_shared(client, other_client):
    share(client, "followers")
    share(other_client, "followers")
    workout = log_workout(client)
    own = add_photo(client, workout["id"]).json()
    base = f"/api/sharing/profiles/{client.user['id']}"
    shared_url = f"{base}/workout-photos/{own['id']}"

    # Not a friend yet, and never without signing in.
    assert other_client.get(shared_url).status_code == 403
    assert TestClient(client.app).get(shared_url).status_code == 401
    befriend(other_client, client)

    [shared] = other_client.get(f"{base}/workouts").json()["workouts"]
    [photo] = shared["photos"]
    assert photo["full_url"] == f"{shared_url}?variant=full"
    assert photo["thumbnail_url"] == f"{shared_url}?variant=thumbnail"
    image = other_client.get(photo["full_url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/webp"
    assert image.headers["cache-control"] == "private, no-cache"
    # A browser that already holds the photo is not sent it again, but access is still checked.
    again = other_client.get(photo["full_url"], headers={"If-None-Match": image.headers["etag"]})
    assert again.status_code == 304
    assert again.content == b""
    # The owner's own address for it never works for a friend.
    assert other_client.get(own["full_url"]).status_code == 404
    assert other_client.get(f"{base}/workout-photos/missing").status_code == 404

    assert other_client.delete(f"/api/sharing/friends/{client.user['id']}").status_code == 204
    stale = other_client.get(photo["full_url"], headers={"If-None-Match": image.headers["etag"]})
    assert stale.status_code == 403
    befriend(other_client, client)
    assert other_client.get(photo["full_url"]).status_code == 200
    share(client, "private")
    assert other_client.get(photo["full_url"]).status_code == 404


def test_sample_workout_photos_are_not_shared(client, other_client):
    share(client)
    share(other_client)
    workout = log_workout(client)
    photo = add_photo(client, workout["id"]).json()
    mark_sample(TrainingWorkout.id == workout["id"])
    shared = f"/api/sharing/profiles/{client.user['id']}/workout-photos/{photo['id']}"
    assert other_client.get(shared).status_code == 404
    assert client.get(photo["full_url"]).status_code == 200


def test_timeline_lists_your_and_friends_workouts_newest_first(client, other_client):
    share(client, "private")
    assert client.get("/api/sharing/timeline").status_code == 403
    share(client, "followers")
    share(other_client, "followers", share_notes=False)
    mine = log_workout(client, "Mine today")
    theirs_old = log_workout(other_client, "Theirs last week", days_ago=6)
    theirs_new = log_workout(other_client, "Theirs yesterday", days_ago=1, notes="Felt strong")
    photo = add_photo(other_client, theirs_new["id"]).json()

    # Until they are friends, the feed holds only your own workouts.
    feed = timeline(client)
    assert [item["workout"]["id"] for item in feed["items"]] == [mine["id"]]
    assert feed["items"][0]["member"]["is_you"] is True
    assert feed["has_more"] is False

    befriend(client, other_client)
    feed = timeline(client)
    assert [item["workout"]["id"] for item in feed["items"]] == [
        mine["id"],
        theirs_new["id"],
        theirs_old["id"],
    ]
    friend_item = feed["items"][1]
    assert friend_item["member"] == {
        "id": other_client.user["id"],
        "display_name": other_client.user["display_name"],
        "profile_photo_url": None,
        "is_you": False,
    }
    # Only what the friend shares: their notes stay private, their photo comes with the workout.
    assert friend_item["workout"]["notes"] is None
    [shared_photo] = friend_item["workout"]["photos"]
    assert shared_photo["id"] == photo["id"]
    assert client.get(shared_photo["full_url"]).status_code == 200
    assert friend_item["reactions"] == {"counts": [], "yours": None, "comment_count": 0}
    assert friend_item["record_count"] == 0

    reacted = client.put(
        f"/api/sharing/workouts/{theirs_new['id']}/reaction", json={"reaction": "fire"}
    )
    assert reacted.status_code == 200, reacted.text
    assert timeline(client)["items"][1]["reactions"]["yours"] == "fire"
    # The friend sees the same feed from their side, with the reaction on their own workout.
    theirs = timeline(other_client)
    assert [item["member"]["is_you"] for item in theirs["items"]] == [False, True, True]
    assert theirs["items"][1]["reactions"]["counts"] == [{"reaction": "fire", "count": 1}]


def test_timeline_pages_counts_records_and_hides_unshared_workouts(client, other_client):
    share(client)
    share(other_client)
    befriend(client, other_client)
    bench = named(other_client, "Barbell Bench Press")["id"]
    for days_ago, weight in ((3, 100), (2, 105), (1, 110)):
        payload = workout_payload(bench, f"Bench {weight}")
        payload["workout_date"] = (date.today() - timedelta(days=days_ago)).isoformat()
        payload["movements"][0]["sets"][0]["weight_kg"] = weight
        assert other_client.post("/api/workouts", json=payload).status_code == 201

    first = timeline(client, limit=2)
    assert [item["workout"]["name"] for item in first["items"]] == ["Bench 110", "Bench 105"]
    assert first["has_more"] is True
    # Each heavier session set a weight record.
    assert [item["record_count"] for item in first["items"]] == [1, 1]
    rest = timeline(client, limit=2, offset=2)
    assert [item["workout"]["name"] for item in rest["items"]] == ["Bench 100"]
    assert rest["has_more"] is False
    assert client.get("/api/sharing/timeline", params={"limit": 51}).status_code == 422

    # Sample workouts never reach the feed, and neither does a friend who stops sharing or is
    # blocked.
    mark_sample(TrainingWorkout.name == "Bench 110")
    assert [item["workout"]["name"] for item in timeline(client)["items"]] == [
        "Bench 105",
        "Bench 100",
    ]
    share(other_client, "private")
    assert timeline(client)["items"] == []
    share(other_client)
    assert len(timeline(client)["items"]) == 2
    assert client.post(f"/api/sharing/blocks/{other_client.user['id']}").status_code == 204
    assert timeline(client)["items"] == []


def test_archives_restore_workout_photos_under_new_names(client, tmp_path):
    workout = log_workout(client)
    kept = add_photo(client, workout["id"]).json()
    spoiled = add_photo(client, workout["id"]).json()
    archive = download(client)
    old_files = photo_files()
    assert len(old_files) == 4

    preview = send(client, archive, "preview").json()
    assert preview["archive"]["workout_photos"] == 2
    assert preview["current"]["workout_photos"] == 2
    response = send(client, archive)
    assert response.status_code == 200, response.text
    assert response.json()["photos_skipped"] == 0
    assert response.json()["restored"]["workout_photos"] == 2
    restored = client.get(f"/api/workouts/{workout['id']}").json()["photos"]
    assert [item["id"] for item in restored] == [kept["id"], spoiled["id"]]
    new_files = photo_files()
    assert len(new_files) == 4 and not new_files & old_files
    assert client.get(restored[0]["full_url"]).status_code == 200

    with SessionLocal() as db:
        spoiled_name = db.get(WorkoutPhoto, spoiled["id"]).full_filename

    def spoil(folder: Path) -> None:
        (folder / "machine-photos" / spoiled_name).write_bytes(b"not an image")

    # An unreadable photo is left out and reported; the workout and its other photo survive.
    response = send(client, rebuild(download(client), tmp_path, spoil))
    assert response.status_code == 200, response.text
    assert response.json()["photos_skipped"] == 1
    restored = client.get(f"/api/workouts/{workout['id']}").json()["photos"]
    assert [item["id"] for item in restored] == [kept["id"]]
    assert len(photo_files()) == 2


def test_admin_counts_workout_photos_with_machine_photos(client):
    workout = log_workout(client)
    assert add_photo(client, workout["id"]).status_code == 201
    [account] = client.get("/api/admin/users").json()
    assert account["photos"] == 1
    assert account["photo_bytes"] > 0
    assert client.get("/api/admin/status").json()["photos"] == 1


def test_workout_photos_migration_adds_and_removes_only_its_table():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0058_workout_photos.py"
    spec = importlib.util.spec_from_file_location("workout_photos_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys = ON"))
        connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE training_workouts (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES ('owner')"))
        connection.execute(text("INSERT INTO training_workouts VALUES ('workout')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        connection.execute(
            text(
                "INSERT INTO workout_photos (id, user_id, workout_id, original_filename, "
                "full_filename, thumbnail_filename, media_type, file_size, width, height) "
                "VALUES ('photo', 'owner', 'workout', 'gym.jpg', 'a-full.webp', "
                "'a-thumbnail.webp', 'image/webp', 10, 4, 3)"
            )
        )
        indexes = {item["name"] for item in inspect(connection).get_indexes("workout_photos")}
        assert {"ix_workout_photos_user_id", "ix_workout_photos_workout_id"} <= indexes
        # Deleting the workout takes its photo rows with it.
        connection.execute(text("DELETE FROM training_workouts"))
        assert connection.execute(text("SELECT COUNT(*) FROM workout_photos")).scalar() == 0
        migration.downgrade()
        assert "workout_photos" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT id FROM users")).scalar() == "owner"
