from __future__ import annotations

from io import BytesIO

from conftest import TEST_PASSWORD
from fastapi.testclient import TestClient
from PIL import Image

from app.account_backups import backup_folder, create_account_snapshot
from app.config import get_settings
from app.database import SessionLocal
from app.models import User


def jpeg(width: int, height: int, colour: str = "#3d7bf0", *, exif_rotation: int | None = None):
    buffer = BytesIO()
    image = Image.new("RGB", (width, height), colour)
    exif = image.getexif()
    if exif_rotation is not None:
        exif[274] = exif_rotation
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


def upload_photo(client: TestClient, content: bytes, name: str = "me.jpg"):
    return client.put("/api/profile/photo", files={"file": (name, content, "image/jpeg")})


def stored_photos() -> list[str]:
    return sorted(path.name for path in get_settings().profile_photos_dir.iterdir())


def test_profile_photo_is_cropped_square_served_privately_and_replaced(client, other_client):
    assert client.get("/api/auth/me").json()["profile_photo_url"] is None
    assert client.get("/api/profile/photo").status_code == 404

    uploaded = upload_photo(client, jpeg(1200, 2400, exif_rotation=6))
    assert uploaded.status_code == 200, uploaded.text
    url = uploaded.json()["profile_photo_url"]
    assert url.startswith("/api/profile/photo?v=")
    assert client.get("/api/auth/me").json()["profile_photo_url"] == url

    image = client.get(url)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/webp"
    assert image.headers["cache-control"] == "private, max-age=31536000, immutable"
    with Image.open(BytesIO(image.content)) as served:
        assert served.format == "WEBP"
        assert served.size == (512, 512)

    # Each account only ever sees its own photo.
    assert other_client.get("/api/auth/me").json()["profile_photo_url"] is None
    assert other_client.get(url).status_code == 404

    first_file = stored_photos()
    replaced = upload_photo(client, jpeg(300, 200, "#e86f35"))
    assert replaced.status_code == 200
    assert replaced.json()["profile_photo_url"] != url
    assert stored_photos() != first_file and len(stored_photos()) == 1
    with Image.open(BytesIO(client.get("/api/profile/photo").content)) as small:
        # Small photos are cropped to a square but never enlarged.
        assert small.size == (200, 200)

    removed = client.delete("/api/profile/photo")
    assert removed.status_code == 200
    assert removed.json()["profile_photo_url"] is None
    assert stored_photos() == []
    assert client.get("/api/profile/photo").status_code == 404


def test_invalid_or_oversized_profile_photo_leaves_the_current_one(client):
    url = upload_photo(client, jpeg(400, 400)).json()["profile_photo_url"]

    invalid = upload_photo(client, b"not an image", "notes.jpg")
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_photo"

    too_large = upload_photo(client, b"x" * (5 * 1024 * 1024 + 1))
    assert too_large.status_code == 413
    assert too_large.json()["error"]["code"] == "photo_too_large"

    assert client.get("/api/auth/me").json()["profile_photo_url"] == url
    assert len(stored_photos()) == 1


def test_profile_photo_requires_sign_in(anonymous_client):
    assert anonymous_client.get("/api/profile/photo").status_code == 401
    assert upload_photo(anonymous_client, jpeg(10, 10)).status_code == 401


def test_deleting_the_account_deletes_its_profile_photo(client, other_client):
    upload_photo(client, jpeg(400, 400))
    upload_photo(other_client, jpeg(400, 400))
    assert len(stored_photos()) == 2

    deleted = client.request("DELETE", "/api/profile", json={"password": TEST_PASSWORD})
    assert deleted.status_code == 204
    assert len(stored_photos()) == 1
    assert other_client.get("/api/profile/photo").status_code == 200


def test_account_snapshot_includes_the_profile_photo(client):
    upload_photo(client, jpeg(400, 400))
    [filename] = stored_photos()
    with SessionLocal() as db:
        user = db.get(User, client.user["id"])
        backup = create_account_snapshot(db, get_settings(), user)
    folder = backup_folder(get_settings(), client.user["id"], backup.id)
    assert (folder / "profile-photos" / filename).is_file()
