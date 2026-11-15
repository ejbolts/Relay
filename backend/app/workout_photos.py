"""Photos of a whole workout: how many one can hold, and the files behind them.

Their files sit beside machine photos, in the same folder and with the same two WebP variants,
so account archives and backups carry both kinds the same way.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import WorkoutPhoto
from .photo_storage import delete_machine_photo_files

MAX_PHOTOS_PER_WORKOUT = 4

PhotoFiles = list[tuple[str, str]]


def workout_photo_files(db: Session, *conditions) -> PhotoFiles:
    """The stored file names of the matching photos. Read them before deleting the rows."""
    return [
        (row.full_filename, row.thumbnail_filename)
        for row in db.execute(
            select(WorkoutPhoto.full_filename, WorkoutPhoto.thumbnail_filename).where(*conditions)
        )
    ]


def delete_workout_photo_files(settings: Settings, files: PhotoFiles) -> None:
    """Remove photo files once the change that deleted their rows has committed."""
    for full_filename, thumbnail_filename in files:
        delete_machine_photo_files(settings, full_filename, thumbnail_filename)
