"""Which workouts and weigh-ins an account brought in by CSV import rather than logged in Relay.

Import batches keep the ids they created (for undo), so these are the account's imported
entries. Ids of entries deleted since stay in the batch; callers match them against rows
that still exist.
"""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ImportBatch


def imported_ids(db: Session, user_id: str) -> tuple[set[str], set[str]]:
    """The workouts and weigh-ins the account brought in by CSV import."""
    workouts: set[str] = set()
    measurements: set[str] = set()
    for workout_ids, items in db.execute(
        select(ImportBatch.workout_ids, ImportBatch.measurements).where(
            ImportBatch.user_id == user_id
        )
    ):
        workouts.update(workout_ids or ())
        measurements.update(
            item["id"] for item in items or () if isinstance(item, dict) and item.get("id")
        )
    return workouts, measurements


def imported_workout_ids(db: Session, user_ids: list[str]) -> dict[str, set[str]]:
    """Per account, the workouts it brought in by CSV import."""
    workouts: defaultdict[str, set[str]] = defaultdict(set)
    if not user_ids:
        return workouts
    for user_id, workout_ids in db.execute(
        select(ImportBatch.user_id, ImportBatch.workout_ids).where(
            ImportBatch.user_id.in_(user_ids)
        )
    ):
        workouts[user_id].update(workout_ids or ())
    return workouts
