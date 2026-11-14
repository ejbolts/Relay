"""Which app release a browser is running, and how the API treats older ones.

Every request from the app carries its ``frontend/release.json`` version in
``X-Relay-Version``. Installed apps can keep an old bundle open for days, so the
API stays backward compatible (see AGENTS.md) and uses this header to:

* record the version on each signed-in session, so the admin screen shows which
  releases are still in use before anything old clients rely on is removed;
* reject saves from releases older than ``MIN_WRITE_CLIENT_VERSION`` with
  ``426 client_outdated``. The app keeps the work on the device and updates;
* keep fields an older release does not know about when it replaces a record
  (``FIELDS_ADDED_IN``), instead of resetting them to their defaults.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Annotated

from fastapi import Header
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

CLIENT_VERSION_HEADER = "X-Relay-Version"

# Raise only for a release that removes or changes something older apps still send or read.
# It must not exceed the deployed frontend/release.json version. Leave None otherwise: the
# app updates itself when nothing is in progress, and additive changes need no minimum.
MIN_WRITE_CLIENT_VERSION: str | None = None

# Payload fields added to full-replace saves after the version header existed, by the
# release that introduced them. A save from an older app keeps the stored value instead of
# clearing it. Register every new field of a replaced record here (and wire the endpoint
# through ``preserve_fields`` if it is not already); each key is the payload field name,
# which must match the stored model attribute.
FIELDS_ADDED_IN: dict[str, dict[str, str]] = {
    "workout": {},
    "movement": {},
    "set": {"machine_photo_id": "1.3.0"},
    "body_weight_goal": {
        "maintenance_min_kg": "1.2.1",
        "maintenance_max_kg": "1.2.1",
    },
    "home_section_settings": {"workouts": "1.3.0", "cardio_sessions": "1.3.0"},
    "routine_movement": {"rep_range": "1.3.0"},
}

# Sign-in and sign-out keep working so an old app can always reach the update.
WRITE_GATE_EXEMPT_PREFIXES = ("/api/auth/",)
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_VERSION = re.compile(r"^(\d{1,4})\.(\d{1,5})\.(\d{1,6})$")
Version = tuple[int, int, int]


def parse_version(value: str | None) -> Version | None:
    match = _VERSION.match(value.strip()) if value else None
    return (int(match[1]), int(match[2]), int(match[3])) if match else None


def normalized_version(value: str | None) -> str | None:
    """The header value when it is a plain release version, so it is safe to store."""
    parsed = parse_version(value)
    return ".".join(map(str, parsed)) if parsed else None


def is_older(client: str | None, release: str) -> bool:
    """Missing or malformed versions predate the header, so they count as older."""
    required = parse_version(release)
    if required is None:
        raise ValueError(f"Invalid release version: {release!r}")
    parsed = parse_version(client)
    return parsed is None or parsed < required


ClientVersion = Annotated[str | None, Header(alias=CLIENT_VERSION_HEADER)]


def outdated_response() -> JSONResponse:
    return JSONResponse(
        status_code=426,
        content={
            "error": {
                "code": "client_outdated",
                "message": "Relay needs to update before it can save this. "
                "Refresh the app, then try again.",
            }
        },
    )


class ClientVersionGateMiddleware:
    """Turn away saves from app releases older than ``MIN_WRITE_CLIENT_VERSION``.

    Reads always pass so an old app can still show data and offer the update.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        minimum = MIN_WRITE_CLIENT_VERSION
        if (
            minimum is not None
            and scope["type"] == "http"
            and scope["method"] in UNSAFE_METHODS
            and scope["path"].startswith("/api/")
            and not scope["path"].startswith(WRITE_GATE_EXEMPT_PREFIXES)
            and is_older(Headers(scope=scope).get(CLIENT_VERSION_HEADER), minimum)
        ):
            await outdated_response()(scope, receive, send)
            return
        await self.app(scope, receive, send)


def fields_unknown_to(client: str | None, level: str) -> list[str]:
    return [
        field for field, since in FIELDS_ADDED_IN.get(level, {}).items() if is_older(client, since)
    ]


def preserve_fields(
    payload: Mapping[str, object], existing: object, fields: list[str]
) -> dict[str, object]:
    """Copy of ``payload`` with ``fields`` taken from the stored record."""
    kept = dict(payload)
    for field in fields:
        kept[field] = getattr(existing, field)
    return kept


def preserve_rep_ranges(movements, stored, client: str | None) -> None:
    """Keep planned exercises' rep ranges when the saving app predates them.

    ``movements`` are the payload's planned exercises and ``stored`` the saved ones for the same
    day or workout type, matched by position and exercise. An explicit ``rep_range``, including
    null, is always taken: it proves the app knows the field, whatever version it reports.
    """
    if "rep_range" not in fields_unknown_to(client, "routine_movement"):
        return
    for position, movement in enumerate(movements):
        if "rep_range" in movement.model_fields_set or position >= len(stored):
            continue
        if stored[position].exercise_id == movement.exercise_id:
            movement.rep_range = stored[position].rep_range


def preserve_unknown_workout_fields(payload, workout, client: str | None):
    """Keep workout, exercise and set fields the saving app predates.

    Exercises are matched by position and exercise; sets by position within a matched
    exercise. A new row, or one moved to another exercise, keeps the payload values.
    """
    from .tracker_schemas import TrainingWorkoutCreate

    unknown = {level: fields_unknown_to(client, level) for level in ("workout", "movement", "set")}
    if not any(unknown.values()):
        return payload
    # Defaults must stay omitted so downstream compatibility rules can distinguish
    # an absent field from an explicit null, including on newly added sets.
    data = preserve_fields(payload.model_dump(exclude_unset=True), workout, unknown["workout"])
    stored_movements = list(workout.movements)
    movements = []
    for index, movement in enumerate(data["movements"]):
        stored = stored_movements[index] if index < len(stored_movements) else None
        if stored is None or stored.exercise_id != movement["exercise_id"]:
            movements.append(movement)
            continue
        kept = preserve_fields(movement, stored, unknown["movement"])
        stored_sets = list(stored.sets)
        kept["sets"] = [
            preserve_fields(item, stored_sets[position], unknown["set"])
            if position < len(stored_sets)
            else item
            for position, item in enumerate(movement["sets"])
        ]
        # Feature previews can run before the coordinator assigns their release
        # version. An explicit machine field proves this client supports it;
        # deployed older clients omit it and keep the stored assignment.
        for position, item in enumerate(kept["sets"]):
            if "machine_photo_id" in payload.movements[index].sets[position].model_fields_set:
                item["machine_photo_id"] = movement["sets"][position]["machine_photo_id"]
        # An older app cannot see per-set machines. Keep their pins too, so a
        # full-replace edit cannot silently erase or invalidate the assignments.
        if "machine_photo_id" in unknown["set"]:
            kept["machine_photo_ids"] = list(
                dict.fromkeys(
                    [
                        *kept.get("machine_photo_ids", []),
                        *(
                            item["machine_photo_id"]
                            for item in kept["sets"]
                            if item.get("machine_photo_id")
                        ),
                    ]
                )
            )
        movements.append(kept)
    data["movements"] = movements
    return TrainingWorkoutCreate.model_validate(data)
