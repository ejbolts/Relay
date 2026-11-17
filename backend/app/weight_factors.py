"""Read-only multipliers from each saved machine's weights to its exercise's reference machine.

The mapping itself is edited through ``weight_mapping``; this module only reads it, so summaries
in ``tracker`` can convert weights without importing the mapping routes.
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import MachinePhoto, UserSetting

KEY_PREFIX = "weight_mapping:"


def normalising_factors(db: Session, user_id: str) -> dict[str, dict[str, float]]:
    """For each exercise with normalising switched on, every machine photo's multiplier.

    Photos missing from an exercise's result, and sets without a machine, count as the reference
    machine (a multiplier of 1), matching how the progress chart's "All machines" view converts
    weights. Merged photo ids resolve to the machine they were merged into.
    """
    rows = db.execute(
        select(UserSetting.key, UserSetting.value).where(
            UserSetting.user_id == user_id, UserSetting.key.startswith(KEY_PREFIX)
        )
    ).all()
    if not rows:
        return {}
    canonical = {
        photo_id: merged_into_id or photo_id
        for photo_id, merged_into_id in db.execute(
            select(MachinePhoto.id, MachinePhoto.merged_into_id).where(
                MachinePhoto.user_id == user_id
            )
        )
    }
    factors: dict[str, dict[str, float]] = {}
    for key, value in rows:
        try:
            stored = json.loads(value)
        except ValueError:
            continue
        if not isinstance(stored, dict) or not stored.get("enabled"):
            continue
        reference_id = canonical.get(stored.get("reference_machine_id") or "")
        if reference_id is None:
            continue
        by_machine: dict[str, float] = {}
        pairs = stored.get("machines")
        for photo_id, pair in (pairs if isinstance(pairs, dict) else {}).items():
            machine_id = canonical.get(photo_id)
            # A merged machine keeps its own pair; an alias only fills a gap.
            if machine_id is None or machine_id == reference_id:
                continue
            if machine_id in by_machine and photo_id != machine_id:
                continue
            try:
                machine_kg, reference_kg = float(pair[0]), float(pair[1])
            except (TypeError, IndexError, ValueError):
                continue
            if machine_kg > 0 and reference_kg > 0:
                by_machine[machine_id] = reference_kg / machine_kg
        factors[key.removeprefix(KEY_PREFIX)] = {
            photo_id: by_machine[machine_id]
            for photo_id, machine_id in canonical.items()
            if machine_id in by_machine
        }
    return factors
