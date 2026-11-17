from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from .config import Settings
from .image_workers import run_image_task

CHUNK_SIZE = 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF"}
FULL_MAX_SIZE = (1800, 1800)
THUMBNAIL_MAX_SIZE = (360, 360)
PROFILE_PHOTO_SIZE = (512, 512)
MAX_SOURCE_PIXELS = 50_000_000

register_heif_opener()


class PhotoValidationError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class StoredMachinePhoto:
    original_filename: str
    full_filename: str
    thumbnail_filename: str
    file_size: int
    width: int
    height: int


def photo_display_filename(filename: str | None) -> str:
    raw = filename or "machine-photo"
    raw = raw.replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"[\x00-\x1f]", "_", raw).strip()[:500]
    return cleaned or "machine-photo"


def machine_photo_paths(
    settings: Settings, full_filename: str, thumbnail_filename: str
) -> tuple[Path, Path]:
    return (
        settings.machine_photos_dir / full_filename,
        settings.machine_photos_dir / thumbnail_filename,
    )


async def _receive_upload(upload: UploadFile, target_path: Path, max_bytes: int) -> int:
    """Stream ``upload`` to ``target_path``, refusing anything over ``max_bytes``."""
    total = 0
    with target_path.open("xb") as target:
        while chunk := await upload.read(CHUNK_SIZE):
            total += len(chunk)
            if total > max_bytes:
                raise PhotoValidationError(
                    "photo_too_large",
                    f"Photos can be up to {max(1, max_bytes // (1024 * 1024))} MB.",
                    status_code=413,
                )
            target.write(chunk)
    if total == 0:
        raise PhotoValidationError("invalid_photo", "The selected photo is empty.")
    return total


def _decode_photo(path: Path) -> Image.Image:
    """Open a received photo, refusing unsupported or oversized images, upright and in RGB(A)."""
    try:
        with Image.open(path, formats=sorted(ALLOWED_IMAGE_FORMATS)) as source:
            if source.format not in ALLOWED_IMAGE_FORMATS:
                raise PhotoValidationError(
                    "unsupported_photo_type",
                    "Choose a JPEG, PNG, WebP, HEIF, or HEIC image.",
                    status_code=415,
                )
            if source.width * source.height > MAX_SOURCE_PIXELS:
                raise PhotoValidationError(
                    "photo_dimensions_too_large",
                    "The selected photo has more than 50 megapixels.",
                    status_code=413,
                )
            source.load()
            oriented = ImageOps.exif_transpose(source)
            if oriented.mode not in {"RGB", "RGBA"}:
                oriented = oriented.convert("RGBA" if "transparency" in oriented.info else "RGB")
            return oriented
    except PhotoValidationError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as error:
        raise PhotoValidationError(
            "invalid_photo",
            "The selected file is not a readable JPEG, PNG, WebP, HEIF, or HEIC image.",
        ) from error


async def store_machine_photo(
    *, upload: UploadFile, settings: Settings, max_bytes: int
) -> StoredMachinePhoto:
    """Decode an uploaded image, correct orientation, and atomically store WebP variants.

    ``max_bytes`` is the admin's upload limit, the one limit people are told about.
    """
    token = uuid.uuid4().hex
    upload_partial = settings.machine_photos_dir / f"{token}.upload.partial"
    full_filename = f"{token}-full.webp"
    thumbnail_filename = f"{token}-thumbnail.webp"
    full_path, thumbnail_path = machine_photo_paths(settings, full_filename, thumbnail_filename)
    full_partial = settings.machine_photos_dir / f"{full_filename}.partial"
    thumbnail_partial = settings.machine_photos_dir / f"{thumbnail_filename}.partial"
    stored = False
    try:
        total = await _receive_upload(upload, upload_partial, max_bytes)
        width, height = await run_image_task(
            _write_machine_variants, upload_partial, full_partial, thumbnail_partial
        )

        full_partial.replace(full_path)
        thumbnail_partial.replace(thumbnail_path)
        stored = True
        return StoredMachinePhoto(
            original_filename=photo_display_filename(upload.filename),
            full_filename=full_filename,
            thumbnail_filename=thumbnail_filename,
            file_size=total,
            width=width,
            height=height,
        )
    except PhotoValidationError:
        raise
    except OSError as error:
        raise PhotoValidationError(
            "photo_write_failed", f"Could not save the machine photo: {error}", status_code=500
        ) from error
    finally:
        await upload.close()
        for path in (upload_partial, full_partial, thumbnail_partial):
            path.unlink(missing_ok=True)
        if not stored:
            full_path.unlink(missing_ok=True)
            thumbnail_path.unlink(missing_ok=True)


def delete_machine_photo_files(
    settings: Settings, full_filename: str, thumbnail_filename: str
) -> None:
    for path in machine_photo_paths(settings, full_filename, thumbnail_filename):
        path.unlink(missing_ok=True)


def profile_photo_path(settings: Settings, filename: str) -> Path | None:
    """The stored profile photo, or None if the name could point outside its folder."""
    if Path(filename).name != filename:
        return None
    return settings.profile_photos_dir / filename


def _write_machine_variants(source: Path, full_path: Path, thumbnail_path: Path) -> tuple[int, int]:
    with _decode_photo(source) as full:
        full.thumbnail(FULL_MAX_SIZE, Image.Resampling.LANCZOS)
        full.save(full_path, format="WEBP", quality=90, method=6)
        with full.copy() as thumbnail:
            thumbnail.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
            thumbnail.save(thumbnail_path, format="WEBP", quality=82, method=6)
        return full.size


def _write_profile_variant(source: Path, target: Path) -> None:
    with _decode_photo(source) as oriented:
        side = min(PROFILE_PHOTO_SIZE[0], oriented.width, oriented.height)
        with ImageOps.fit(oriented, (side, side), Image.Resampling.LANCZOS) as square:
            square.save(target, format="WEBP", quality=88, method=6)


async def store_profile_photo(*, upload: UploadFile, settings: Settings, max_bytes: int) -> str:
    """Store an uploaded image as an upright, centre-cropped square WebP; return its filename."""
    token = uuid.uuid4().hex
    upload_partial = settings.profile_photos_dir / f"{token}.upload.partial"
    filename = f"{token}.webp"
    photo_partial = settings.profile_photos_dir / f"{filename}.partial"
    try:
        await _receive_upload(upload, upload_partial, max_bytes)
        await run_image_task(_write_profile_variant, upload_partial, photo_partial)
        photo_partial.replace(settings.profile_photos_dir / filename)
        return filename
    except PhotoValidationError:
        raise
    except OSError as error:
        raise PhotoValidationError(
            "photo_write_failed", f"Could not save the profile photo: {error}", status_code=500
        ) from error
    finally:
        await upload.close()
        upload_partial.unlink(missing_ok=True)
        photo_partial.unlink(missing_ok=True)


def delete_profile_photo_file(settings: Settings, filename: str | None) -> None:
    path = profile_photo_path(settings, filename) if filename else None
    if path is not None:
        path.unlink(missing_ok=True)
