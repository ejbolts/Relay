"""Account-local exercise merges, including references in saved splits and old drafts."""

import json

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .models import (
    CardioSession,
    Exercise,
    MachinePhoto,
    PersonalRecord,
    UserSetting,
    WorkoutMovement,
)
from .training_metrics import rebuild_personal_records, set_setting

ALIAS_PREFIX = "exercise_merge:"


def exercise_aliases(db: Session, user_id: str) -> dict[str, str]:
    return {
        row.key[len(ALIAS_PREFIX) :]: row.value
        for row in db.scalars(
            select(UserSetting).where(
                UserSetting.user_id == user_id, UserSetting.key.startswith(ALIAS_PREFIX)
            )
        )
    }


def resolve_exercise_id(db: Session, user_id: str, exercise_id: str) -> str:
    return exercise_aliases(db, user_id).get(exercise_id, exercise_id)


def merge_exercise(db: Session, user_id: str, source_id: str, target_id: str) -> Exercise:
    # Serialize with imports and other merges before reading either exercise.
    db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    source, target = db.get(Exercise, source_id), db.get(Exercise, target_id)
    if any(item is None or item.user_id != user_id for item in (source, target)):
        raise HTTPException(404, "Exercise was not found.")
    if source.id == target.id:
        raise HTTPException(422, "Choose two different exercises.")
    if not source.is_custom:
        raise HTTPException(422, "Only a custom exercise can be merged into another exercise.")
    if source.kind != target.kind:
        raise HTTPException(422, "Choose two strength exercises or two cardio exercises.")

    target.is_favorite = target.is_favorite or source.is_favorite
    # Keep movement rows (even when both exercises appear in a workout), sets,
    # supersets, notes, photos and historical machine-setting snapshots intact.
    for model in (WorkoutMovement, MachinePhoto):
        db.execute(
            update(model).where(model.exercise_id == source.id).values(exercise_id=target.id)
        )
    db.execute(
        update(CardioSession)
        .where(CardioSession.user_id == user_id, CardioSession.source_exercise_id == source.id)
        .values(source_exercise_id=target.id, activity_type=target.name)
    )
    rows = list(db.scalars(select(UserSetting).where(UserSetting.user_id == user_id)))
    by_key = {row.key: row for row in rows}
    for row in rows:
        if row.key.startswith("routine:"):
            content = json.loads(row.value)
            for day in content["days"]:
                for movement in day["movements"]:
                    if movement["exercise_id"] == source.id:
                        movement["exercise_id"] = target.id
            row.value = json.dumps(content)
        elif row.key.startswith(f"machine_settings:{source.id}"):
            # Photo-specific settings move with their photos. The destination's
            # exercise-wide defaults win; use source defaults only if absent.
            key = row.key.replace(
                f"machine_settings:{source.id}", f"machine_settings:{target.id}", 1
            )
            if key not in by_key:
                set_setting(db, user_id, key, row.value)
            db.delete(row)
        elif row.key == f"weight_mapping:{source.id}":
            # Different reference machines cannot safely share conversion ratios.
            # Retain the destination mapping, or move the complete source mapping.
            key = f"weight_mapping:{target.id}"
            if key not in by_key:
                set_setting(db, user_id, key, row.value)
            db.delete(row)
        elif row.key.startswith(ALIAS_PREFIX) and row.value == source.id:
            row.value = target.id
    set_setting(db, user_id, ALIAS_PREFIX + source.id, target.id)
    db.execute(delete(PersonalRecord).where(PersonalRecord.exercise_id == source.id))
    db.flush()
    # Bulk deletion avoids ORM delete-orphan cascades on transferred machine photos.
    db.execute(delete(Exercise).where(Exercise.id == source.id))
    db.flush()
    db.expire_all()
    rebuild_personal_records(db, user_id)
    return db.get(Exercise, target_id)
