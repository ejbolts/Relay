import asyncio
import io
from tempfile import SpooledTemporaryFile
from types import SimpleNamespace

import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import UploadFile as StarletteUploadFile

from app import cardio_ocr


def screenshot_bytes():
    with io.BytesIO() as buffer, Image.new("RGB", (32, 32), "white") as image:
        image.save(buffer, format="PNG")
        return buffer.getvalue()


@pytest.mark.parametrize("disk_backed", [False, True])
@pytest.mark.parametrize("outcome", ["success", "no_text", "engine_error", "invalid_image"])
def test_scan_discards_images_without_persisting_uploads(client, monkeypatch, disk_backed, outcome):
    uploads = []
    decoded_images = []
    close_upload = StarletteUploadFile.close

    async def record_close(upload):
        uploads.append((upload, upload.file._rolled))
        await close_upload(upload)

    def recognize(image):
        decoded_images.append(image)
        assert image.getpixel((0, 0)) == (255, 255, 255)
        if outcome == "engine_error":
            raise RuntimeError("OCR unavailable")
        if outcome == "no_text":
            return None
        return SimpleNamespace(
            txts=["Duration 30 min"],
            scores=[0.99],
            boxes=[[[0, 0], [30, 0], [30, 10], [0, 10]]],
        )

    monkeypatch.setattr(StarletteUploadFile, "close", record_close)
    monkeypatch.setattr(cardio_ocr, "_ocr_engine", lambda: recognize)
    settings = client.app.state.settings
    storage_dirs = [
        settings.uploads_dir,
        settings.normalized_dir,
        settings.output_dir,
        settings.machine_photos_dir,
        settings.profile_photos_dir,
    ]
    files_before = {path for folder in storage_dirs for path in folder.rglob("*")}
    sessions_before = client.get("/api/cardio").json()["sessions"]
    contents = b"not an image" if outcome == "invalid_image" else screenshot_bytes()
    if disk_backed:
        # Multipart uploads above Starlette's spool threshold use a temporary disk file.
        contents += b"\0" * (2 * 1024 * 1024)
    response = client.post(
        "/api/cardio/scan", files={"file": ("cardio.png", contents, "image/png")}
    )

    expected_status = {"success": 200, "no_text": 422, "engine_error": 500, "invalid_image": 422}
    assert response.status_code == expected_status[outcome], response.text
    if outcome == "success":
        assert response.json()["duration_minutes"] == 30
        assert response.json()["fields_found"] == ["workout time"]
    assert uploads
    assert all(upload.file.closed and rolled == disk_backed for upload, rolled in uploads)
    assert len(decoded_images) == (0 if outcome == "invalid_image" else 1)
    for image in decoded_images:
        with pytest.raises(ValueError, match="closed image"):
            image.getpixel((0, 0))
    assert {path for folder in storage_dirs for path in folder.rglob("*")} == files_before
    assert client.get("/api/cardio").json()["sessions"] == sessions_before


@pytest.mark.parametrize("outcome", ["success", "empty", "too_large", "read_error"])
def test_scan_upload_is_closed_even_when_reading_fails(monkeypatch, outcome):
    with SpooledTemporaryFile(max_size=1) as temporary:
        temporary.write(b"photo" if outcome != "empty" else b"")
        temporary.rollover()
        temporary.seek(0)
        upload = UploadFile(file=temporary, filename="cardio.png")
        if outcome == "too_large":
            monkeypatch.setattr(cardio_ocr, "MAX_SCREENSHOT_BYTES", 4)
        if outcome == "read_error":

            async def fail_read(size):
                raise OSError("Upload interrupted")

            monkeypatch.setattr(upload, "read", fail_read)

        if outcome == "success":
            assert asyncio.run(cardio_ocr.read_cardio_screenshot(upload)) == b"photo"
        elif outcome == "read_error":
            with pytest.raises(OSError, match="Upload interrupted"):
                asyncio.run(cardio_ocr.read_cardio_screenshot(upload))
        else:
            with pytest.raises(cardio_ocr.CardioScreenshotError) as error:
                asyncio.run(cardio_ocr.read_cardio_screenshot(upload))
            assert error.value.code == (
                "invalid_screenshot" if outcome == "empty" else "screenshot_too_large"
            )
        assert temporary.closed
