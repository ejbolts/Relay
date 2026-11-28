from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from fastapi import HTTPException

_VALIDATION_FIELD_LABELS: dict[str, tuple[str, str]] = {
    "average_heart_rate_bpm": ("average heart rate", " bpm"),
    "speed_kph": ("speed", " km/h"),
    "average_speed_kph": ("average speed", " km/h"),
    "incline_percent": ("incline", "%"),
    "duration_seconds": ("duration", " seconds"),
    "duration_minutes": ("duration", " minutes"),
    "distance_km": ("distance", " km"),
    "calories_kcal": ("calories", " kcal"),
    "elevation_gain_m": ("elevation gain", " m"),
    "average_power_watts": ("average power", " W"),
    "average_mets": ("average MET", ""),
    "reps": ("reps", ""),
    "partial_reps": ("partial reps", ""),
    "assisted_reps": ("assisted reps", ""),
    "target_reps": ("target reps", ""),
    "weight_kg": ("weight", " kg"),
    "bodyweight_kg": ("bodyweight", " kg"),
    "rpe": ("RPE", ""),
    "rest_seconds": ("rest", " seconds"),
    "percentile": ("percentile", "%"),
    "notes": ("notes", ""),
    "name": ("name", ""),
}


def _format_number(value: Any) -> str:
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        if value.is_integer():
            return f"{int(value):,}"
        return f"{value:,g}"
    return str(value)


def _set_prefix(loc: Sequence[Any]) -> str:
    for index, part in enumerate(loc[:-1]):
        if part == "sets" and isinstance(loc[index + 1], int):
            return f"Set {loc[index + 1] + 1}: "
    return ""


def format_validation_errors(errors: Sequence[Mapping[str, Any]]) -> str | None:
    """Turn the first Pydantic validation detail into a clear user-facing sentence."""
    if not errors:
        return None
    first = errors[0]
    error_type = str(first.get("type") or "")
    loc = [part for part in first.get("loc") or () if part != "body"]
    ctx = first.get("ctx") if isinstance(first.get("ctx"), Mapping) else {}
    msg = str(first.get("msg") or "").strip()

    if error_type == "value_error" and msg:
        cleaned = msg.removeprefix("Value error, ").strip()
        if cleaned and "\n" not in cleaned:
            return cleaned
        return None

    field = next((part for part in reversed(loc) if isinstance(part, str)), None)
    if not field or field not in _VALIDATION_FIELD_LABELS:
        return None

    label, unit = _VALIDATION_FIELD_LABELS[field]
    prefix = _set_prefix(loc)
    subject = f"{prefix}{label}" if prefix else f"{label[:1].upper()}{label[1:]}"
    raw_input = first.get("input")
    value_part = (
        f" ({_format_number(raw_input)}{unit})"
        if isinstance(raw_input, (int, float)) and not isinstance(raw_input, bool)
        else ""
    )

    if error_type == "less_than_equal" and "le" in ctx:
        return f"{subject}{value_part} must be at most {_format_number(ctx['le'])}{unit}."
    if error_type == "greater_than_equal" and "ge" in ctx:
        return f"{subject}{value_part} must be at least {_format_number(ctx['ge'])}{unit}."
    if error_type == "greater_than" and "gt" in ctx:
        return f"{subject}{value_part} must be greater than {_format_number(ctx['gt'])}{unit}."
    if error_type == "less_than" and "lt" in ctx:
        return f"{subject}{value_part} must be less than {_format_number(ctx['lt'])}{unit}."
    if error_type == "string_too_long" and "max_length" in ctx:
        return f"{subject} must be at most {_format_number(ctx['max_length'])} characters."
    if error_type == "string_too_short" and "min_length" in ctx:
        return f"{subject} must be at least {_format_number(ctx['min_length'])} characters."
    if error_type in {"int_parsing", "int_from_float"}:
        return f"{subject} must be a whole number."
    if error_type in {"float_parsing", "finite_number"}:
        return f"{subject} must be a valid number."
    return None


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail={"error": {"code": code, "message": message}}
    )
