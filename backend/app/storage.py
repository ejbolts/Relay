from __future__ import annotations

import json
import re
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import UploadFile

from .config import Settings

if TYPE_CHECKING:
    from .models import Clip


ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v"}
CHUNK_SIZE = 1024 * 1024


class UploadValidationError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class StoredUpload:
    original_filename: str
    stored_filename: str
    path: Path
    file_size: int
    duration_ms: int


def original_filename(filename: str | None) -> str:
    """Return a display-only filename; it is never used to create a server path."""
    raw = filename or "video.mp4"
    raw = raw.replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"[\x00-\x1f]", "_", raw).strip()[:500]
    return cleaned or "video.mp4"


def validate_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise UploadValidationError("unsupported_file_type", f"Only {allowed} videos are accepted.")
    return extension


def generated_storage_name(extension: str) -> str:
    return f"{uuid.uuid4().hex}{extension}"


def inspect_media(path: Path, settings: Settings) -> int:
    """Use ffprobe without a shell to validate a video and read its duration."""
    try:
        result = subprocess.run(
            [
                settings.ffprobe_path,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            check=False,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise UploadValidationError(
            "media_inspection_failed", f"Could not inspect video: {error}"
        ) from error
    if result.returncode != 0:
        message = result.stderr.strip() or "ffprobe rejected this file."
        raise UploadValidationError("invalid_video", message[:1_000])
    try:
        duration = float(json.loads(result.stdout)["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise UploadValidationError(
            "invalid_video", "The video has no readable duration."
        ) from error
    if duration <= 0:
        raise UploadValidationError(
            "invalid_video", "The video duration must be greater than zero."
        )
    return round(duration * 1000)


async def stream_upload_to_disk(
    *,
    upload: UploadFile,
    session_id: str,
    existing_session_bytes: int,
    settings: Settings,
) -> StoredUpload:
    """Stream one multipart body to a partial file and atomically finish it after validation."""
    display_name = original_filename(upload.filename)
    extension = validate_extension(display_name)
    stored_name = generated_storage_name(extension)
    session_dir = settings.uploads_dir / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    final_path = session_dir / stored_name
    partial_path = final_path.with_suffix(f"{extension}.partial")
    total = 0
    try:
        with partial_path.open("xb") as target:
            while chunk := await upload.read(CHUNK_SIZE):
                total += len(chunk)
                if total > settings.max_file_size_bytes:
                    raise UploadValidationError(
                        "file_too_large", "This video exceeds the individual file limit."
                    )
                if existing_session_bytes + total > settings.max_session_size_bytes:
                    raise UploadValidationError(
                        "session_too_large", "This upload exceeds the session size limit."
                    )
                target.write(chunk)
        duration_ms = inspect_media(partial_path, settings)
        partial_path.replace(final_path)
        return StoredUpload(display_name, stored_name, final_path, total, duration_ms)
    except UploadValidationError:
        partial_path.unlink(missing_ok=True)
        raise
    except OSError as error:
        partial_path.unlink(missing_ok=True)
        raise UploadValidationError(
            "upload_write_failed", f"Could not save the video: {error}"
        ) from error
    finally:
        await upload.close()


def clean_abandoned_partials(settings: Settings) -> int:
    count = 0
    for partial in settings.uploads_dir.rglob("*.partial"):
        partial.unlink(missing_ok=True)
        count += 1
    return count


def original_clip_path(clip: Clip) -> Path:
    if not clip.original_path:
        raise FileNotFoundError("Clip does not have an original file path.")
    return Path(clip.original_path)


def remove_session_files(session_id: str, settings: Settings) -> None:
    # session IDs are server-generated UUIDs; every root is owned by this application.
    for directory in (settings.uploads_dir / session_id, settings.normalized_dir / session_id):
        shutil.rmtree(directory, ignore_errors=True)
    (settings.output_dir / f"{session_id}.mp4").unlink(missing_ok=True)
