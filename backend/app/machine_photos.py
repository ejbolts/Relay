"""Canonical saved machines and lossless merging of their photo records."""

from fastapi import HTTPException
from sqlalchemy import delete, insert, select, update
from sqlalchemy.orm import Session

from .models import MachinePhoto, TrainingWorkout, WorkoutMovement, movement_machine_photos


def canonical_photo(db: Session, photo: MachinePhoto) -> MachinePhoto:
    if photo.merged_into_id is None:
        return photo
    saved = db.get(MachinePhoto, photo.merged_into_id)
    if saved is None or saved.user_id != photo.user_id or saved.exercise_id != photo.exercise_id:
        raise HTTPException(404, "Machine photo was not found.")
    return saved


def merge_machine_photos(
    db: Session,
    user_id: str,
    exercise_id: str,
    photo_ids: list[str],
    keep_photo_id: str,
    caption: str,
) -> MachinePhoto:
    if keep_photo_id not in photo_ids:
        raise HTTPException(422, "Choose a selected machine for the cover and settings.")
    photos = list(
        db.scalars(
            select(MachinePhoto).where(
                MachinePhoto.id.in_(photo_ids),
                MachinePhoto.user_id == user_id,
                MachinePhoto.exercise_id == exercise_id,
            )
        )
    )
    if len(photos) != len(photo_ids):
        raise HTTPException(404, "A selected machine photo was not found.")

    # Acquire SQLite's write lock before inspecting the group membership again.
    # A competing merge must not turn this cover into an alias or create a chain.
    locked = db.execute(
        update(MachinePhoto)
        .where(MachinePhoto.id == keep_photo_id, MachinePhoto.merged_into_id.is_(None))
        .values(caption=caption),
        execution_options={"synchronize_session": False},
    )
    if locked.rowcount != 1:
        raise HTTPException(409, "These machines have changed. Reload the photos and try again.")
    for photo in photos:
        db.refresh(photo)
    if any(photo.merged_into_id is not None for photo in photos):
        raise HTTPException(409, "These machines have changed. Reload the photos and try again.")

    group_ids = list(
        db.scalars(
            select(MachinePhoto.id).where(
                MachinePhoto.user_id == user_id,
                MachinePhoto.exercise_id == exercise_id,
                (MachinePhoto.id.in_(photo_ids) | MachinePhoto.merged_into_id.in_(photo_ids)),
            )
        )
    )
    sources = [photo_id for photo_id in group_ids if photo_id != keep_photo_id]
    movement_ids = set(
        db.scalars(
            select(movement_machine_photos.c.movement_id)
            .join(WorkoutMovement, WorkoutMovement.id == movement_machine_photos.c.movement_id)
            .join(TrainingWorkout, TrainingWorkout.id == WorkoutMovement.workout_id)
            .where(
                movement_machine_photos.c.machine_photo_id.in_(sources),
                TrainingWorkout.user_id == user_id,
            )
        )
    )
    already_pinned = set(
        db.scalars(
            select(movement_machine_photos.c.movement_id).where(
                movement_machine_photos.c.movement_id.in_(movement_ids),
                movement_machine_photos.c.machine_photo_id == keep_photo_id,
            )
        )
    )
    for movement_id in movement_ids - already_pinned:
        db.execute(
            insert(movement_machine_photos).values(
                movement_id=movement_id, machine_photo_id=keep_photo_id
            )
        )
    db.execute(
        delete(movement_machine_photos).where(
            movement_machine_photos.c.movement_id.in_(movement_ids),
            movement_machine_photos.c.machine_photo_id.in_(sources),
        )
    )
    db.execute(
        update(MachinePhoto)
        .where(MachinePhoto.id.in_(sources))
        .values(merged_into_id=keep_photo_id),
        execution_options={"synchronize_session": False},
    )
    db.expire_all()
    return db.get(MachinePhoto, keep_photo_id)
