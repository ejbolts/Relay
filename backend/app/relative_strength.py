"""Dated bodyweight lookup and unit-independent lift/bodyweight ratios."""

from bisect import bisect_left, bisect_right
from datetime import date
from math import floor, isfinite

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import BodyMeasurement


class BodyweightHistory:
    def __init__(self, db: Session, user_id: str):
        rows = list(
            db.scalars(
                select(BodyMeasurement)
                .where(BodyMeasurement.user_id == user_id)
                .order_by(BodyMeasurement.measurement_date)
            )
        )
        self.dates = [row.measurement_date for row in rows]
        self.weights = [row.weight_kg for row in rows]

    def on(self, day: date, recorded: float | None = None) -> float | None:
        if recorded is not None:
            return recorded if isfinite(recorded) and recorded > 0 else None
        index = bisect_right(self.dates, day)
        return self.weights[index - 1] if index else None

    def nearest(self, day: date) -> float | None:
        """Return the nearest weigh-in, preferring the earlier one on a tie."""
        index = bisect_left(self.dates, day)
        if index and (
            index == len(self.dates) or day - self.dates[index - 1] <= self.dates[index] - day
        ):
            index -= 1
        return self.weights[index] if index < len(self.weights) else None


def relative_strength(weight: float | None, bodyweight: float | None) -> float | None:
    if weight is None or bodyweight is None or weight <= 0 or bodyweight <= 0:
        return None
    if not isfinite(weight) or not isfinite(bodyweight):
        return None
    return floor(weight / bodyweight * 10_000 + 0.5) / 10_000
