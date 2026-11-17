from __future__ import annotations

from collections.abc import Iterable

from .models import WorkoutCategory


def infer_workout_category(
    categories: Iterable[WorkoutCategory],
) -> WorkoutCategory | None:
    """Match the automatic category used by the workout logger UI."""
    counts = {category: 0 for category in WorkoutCategory}
    for category in categories:
        counts[category] += 1

    if not sum(counts.values()):
        return None
    if counts[WorkoutCategory.FULL_BODY] > 0:
        return WorkoutCategory.FULL_BODY

    upper_body = (
        counts[WorkoutCategory.PUSH] + counts[WorkoutCategory.PULL] + counts[WorkoutCategory.UPPER]
    )
    lower_body = counts[WorkoutCategory.LOWER]
    cardio = counts[WorkoutCategory.CARDIO]
    categorized_total = upper_body + lower_body + cardio
    if categorized_total == 0:
        return WorkoutCategory.OTHER

    families = (
        (WorkoutCategory.UPPER, upper_body),
        (WorkoutCategory.LOWER, lower_body),
        (WorkoutCategory.CARDIO, cardio),
    )
    dominant_category, dominant_count = max(families, key=lambda item: item[1])
    remaining = categorized_total - dominant_count
    if remaining > 0 and dominant_count < 2 * remaining:
        return WorkoutCategory.FULL_BODY
    if dominant_category != WorkoutCategory.UPPER:
        return dominant_category

    push = counts[WorkoutCategory.PUSH]
    pull = counts[WorkoutCategory.PULL]
    neutral_upper = counts[WorkoutCategory.UPPER]
    if push >= 2 * (pull + neutral_upper):
        return WorkoutCategory.PUSH
    if pull >= 2 * (push + neutral_upper):
        return WorkoutCategory.PULL
    return WorkoutCategory.UPPER
