"""Cardio personal records, kept per exercise like strength records.

* Distance PR: the longest distance in one set.
* Duration PR: the longest set.
* Pace PR: the fastest time over one of the exercise's set distances, from a set's average
  pace. A 7.2 km run in 36:00 covers 5 km in 25:00, so only sets at least that long count.

The set distances suit the sport, matched by the exercise's name. First attempts establish each
baseline, as for strength records. The client mirrors these rules in cardioRecords.ts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import floor

from .models import PersonalRecordType, SetType, WorkoutSet

RUNNING_DISTANCES = (1.0, 5.0, 10.0, 21.0975, 42.195)
ROWING_DISTANCES = (0.5, 2.0, 5.0, 10.0)
CYCLING_DISTANCES = (10.0, 20.0, 40.0, 100.0)
SWIMMING_DISTANCES = (0.1, 0.4, 0.8, 1.5)
OTHER_DISTANCES = (1.0, 5.0, 10.0)

# Checked in order, so an indoor walking exercise is not read as rowing or cycling.
SPORT_DISTANCES: tuple[tuple[tuple[str, ...], tuple[float, ...]], ...] = (
    (("swim",), SWIMMING_DISTANCES),
    (("row",), ROWING_DISTANCES),
    (("cycl", "bike", "biking", "spin"), CYCLING_DISTANCES),
    (("run", "jog", "walk", "hike", "treadmill"), RUNNING_DISTANCES),
)

CARDIO_RECORD_TYPES = (
    PersonalRecordType.DISTANCE,
    PersonalRecordType.DURATION,
    PersonalRecordType.PACE,
)


def pace_distances(exercise_name: str) -> tuple[float, ...]:
    """The set distances, in km and shortest first, an exercise's pace records use."""
    name = exercise_name.casefold()
    for words, distances in SPORT_DISTANCES:
        if any(word in name for word in words):
            return distances
    return OTHER_DISTANCES


def is_cardio_record_eligible(item: WorkoutSet) -> bool:
    """A completed set that is not a warm-up, as for strength records."""
    return bool(item.completed) and not item.warmup and item.set_type != SetType.WARMUP


def _round(value: float, places: int) -> float:
    # Rounds halves up, as the client's Math.round does.
    scale = 10**places
    return floor(value * scale + 0.5) / scale


def record_distance(distance_km: float) -> float:
    """Distances compare to the metre."""
    return _round(distance_km, 3)


def time_over(duration_seconds: float, distance_km: float, target_km: float) -> float:
    """A set's time over a shorter set distance at its average pace, to a tenth of a second."""
    return _round(duration_seconds * target_km / distance_km, 1)


@dataclass
class CardioBests:
    """One exercise's bests so far; -1 until a first attempt sets the baseline."""

    distance_km: float = -1.0
    duration_seconds: float = -1.0
    # Fastest seconds over each set distance (km) reached so far.
    times: dict[float, float] = field(default_factory=dict)

    def add(
        self,
        duration_seconds: float | None,
        distance_km: float | None,
        distances: tuple[float, ...],
    ) -> list[tuple[PersonalRecordType, float | None]]:
        """Counts a set into the bests, returning the records it beat and each pace distance."""
        beaten: list[tuple[PersonalRecordType, float | None]] = []
        duration = float(duration_seconds) if duration_seconds and duration_seconds > 0 else None
        distance = record_distance(distance_km) if distance_km and distance_km > 0 else None
        if distance is not None:
            if self.distance_km >= 0 and distance > self.distance_km:
                beaten.append((PersonalRecordType.DISTANCE, None))
            self.distance_km = max(self.distance_km, distance)
        if duration is not None:
            if self.duration_seconds >= 0 and duration > self.duration_seconds:
                beaten.append((PersonalRecordType.DURATION, None))
            self.duration_seconds = max(self.duration_seconds, duration)
        if distance is not None and duration is not None:
            for target in distances:
                if distance < target:
                    break
                time = time_over(duration, distance_km or 0, target)
                best = self.times.get(target)
                if best is not None and time < best:
                    beaten.append((PersonalRecordType.PACE, target))
                self.times[target] = time if best is None else min(best, time)
        return beaten
