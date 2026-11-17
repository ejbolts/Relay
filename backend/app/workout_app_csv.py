"""Adapters for unedited Hevy and Strong CSV exports. No database writes."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import replace
from datetime import date, datetime

from .models import SetType
from .tracker_csv import (
    CSV_HEADERS,
    DELIMITERS,
    KG_TO_LB,
    SESSION_HEADERS,
    CsvImportError,
    ParsedRow,
    optional_float,
    optional_int,
    parse_rows,
    plural,
)

MONTHS = {
    name: index
    for index, name in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
    )
}


def export_time(value: str, row: int) -> datetime:
    """Use the export's calendar date, without timezone shifts or locale assumptions."""
    try:
        match = re.fullmatch(r"(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d{1,2}):(\d{2})", value)
        if match:
            day, month, year, hour, minute = match.groups()
            return datetime(int(year), MONTHS[month.title()], int(day), int(hour), int(minute))
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, KeyError) as error:
        raise CsvImportError(f'Row {row}: cannot read export date "{value[:40]}".') from error


def number(value: str, field: str, row: int, maximum: float, *, whole=False) -> float | None:
    result = optional_int(value, field, row) if whole else optional_float(value, field, row)
    if result is not None and not 0 <= result <= maximum:
        raise CsvImportError(f"Row {row}: {field} must be between 0 and {maximum:g}.")
    return result


def note(value: str, row: int) -> str | None:
    if len(value) > 10_000:
        raise CsvImportError(f"Row {row}: Notes must be 10,000 characters or fewer.")
    return value or None


def parse_app_export(
    raw: bytes,
    source: str,
    weight_unit: str,
    distance_unit: str,
) -> tuple[list[ParsedRow], list[str], dict[date, list[float]]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise CsvImportError("Save the export as CSV UTF-8 and try again.") from error
    if not text.strip():
        raise CsvImportError("The CSV file is empty.")
    reader = csv.DictReader(
        io.StringIO(text), delimiter=max(DELIMITERS, key=text.splitlines()[0].count), strict=True
    )
    headers = [header.strip().casefold() for header in (reader.fieldnames or [])]
    if len(headers) != len(set(headers)):
        raise CsvImportError("The CSV contains duplicate column names.")
    reader.fieldnames = headers
    measurements = source == "strong" and "measurement type" in headers
    required = (
        {"date", "measurement type", "value", "unit"}
        if measurements
        else {"title", "start_time", "exercise_title", "set_type", "weight_kg", "reps"}
        if source == "hevy"
        else {"date", "workout name", "exercise name", "set order", "weight", "reps"}
    )
    missing = required - set(headers)
    if missing:
        raise CsvImportError(
            f"This does not look like a {source.title()} export. Missing columns: "
            f"{', '.join(sorted(missing))}. Choose the matching app or the original CSV export."
        )
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=(*CSV_HEADERS, *SESSION_HEADERS))
    writer.writeheader()
    extras: list[dict] = []
    bodyweights: dict[date, list[float]] = {}
    skipped_rest = skipped_measurements = unknown_types = supersets = 0
    known = required | (
        {"source"}
        if measurements
        else {
            "end_time",
            "description",
            "superset_id",
            "exercise_notes",
            "set_index",
            "distance_km",
            "duration_seconds",
            "rpe",
        }
        if source == "hevy"
        else {"duration", "distance", "seconds", "notes", "workout notes", "rpe"}
    )
    warnings = []
    ignored = [name for name in headers if name and name not in known]
    if ignored:
        warnings.append(f"These columns are not imported: {', '.join(ignored[:8])}.")
    for row_number, supplied in enumerate(reader, 2):
        if None in supplied:
            raise CsvImportError(f"Row {row_number}: there are more values than columns.")
        row = {key: (value or "").strip() for key, value in supplied.items()}
        if not any(row.values()):
            continue
        if measurements:
            if row["measurement type"].casefold() not in {"weight", "body weight", "bodyweight"}:
                skipped_measurements += 1
                continue
            when = export_time(row["date"], row_number)
            unit = row["unit"].casefold()
            if unit not in {"kg", "lb", "lbs"}:
                raise CsvImportError(f"Row {row_number}: body-weight Unit must be kg or lb.")
            weight = optional_float(row["value"], "Value", row_number)
            weight = weight / KG_TO_LB if weight is not None and unit != "kg" else weight
            if weight is None or not 0 < weight <= 500:
                raise CsvImportError(f"Row {row_number}: body weight must be between 0 and 500 kg.")
            bodyweights.setdefault(when.date(), []).append(round(weight, 3))
            continue
        hevy = source == "hevy"
        kind = row["set_type" if hevy else "set order"].casefold()
        if not hevy and kind == "rest timer":
            skipped_rest += 1
            continue
        warmup = kind in {"warmup", "w"}
        drop = kind in {"dropset", "drop", "d"}
        failed = kind in {"failure", "f"}
        if (
            kind not in {"normal", "warmup", "dropset", "drop", "failure", "w", "d", "f"}
            and not kind.isdigit()
        ):
            unknown_types += 1
        raw_time = row["start_time" if hevy else "date"]
        when = export_time(raw_time, row_number)
        title = row["title" if hevy else "workout name"]
        session = hashlib.sha256(f"{when.isoformat()}\0{title}".encode()).hexdigest()
        weight = row["weight_kg" if hevy else "weight"]
        writer.writerow(
            {
                "Date Lifted": when.date().isoformat(),
                "Exercise": row["exercise_title" if hevy else "exercise name"],
                "Weight (lb)" if not hevy and weight_unit == "lb" else "Weight (kg)": weight,
                "Reps": row["reps"],
                "Warmup": "1" if warmup else "0",
                "Workout ID": session,
                "Workout name": title,
            }
        )
        rpe = number(row.get("rpe", ""), "RPE", row_number, 10)
        if rpe is not None and 0 < rpe < 1:
            raise CsvImportError(f"Row {row_number}: RPE must be 1 to 10, or blank.")
        duration = number(
            row.get("duration_seconds" if hevy else "seconds", ""),
            "Set seconds",
            row_number,
            172_800,
            whole=True,
        )
        distance = number(
            row.get("distance_km" if hevy else "distance", ""), "Distance", row_number, 10_000
        )
        if distance is not None and not hevy and distance_unit == "mi":
            distance *= 1.609344
            if distance > 10_000:
                raise CsvImportError(f"Row {row_number}: Distance exceeds 10000 km.")
        minutes = None
        if hevy and row.get("end_time"):
            end = export_time(row["end_time"], row_number)
            try:
                minutes = round((end - when).total_seconds() / 60)
            except TypeError as error:
                raise CsvImportError(
                    f"Row {row_number}: start and end timezones disagree."
                ) from error
            if not 0 <= minutes <= 2880:
                raise CsvImportError(f"Row {row_number}: invalid workout duration.")
        elif not hevy and row.get("duration"):
            match = re.fullmatch(r"(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?", row["duration"])
            if not match:
                raise CsvImportError(f"Row {row_number}: cannot read workout Duration.")
            hours, mins, secs = (int(value or 0) for value in match.groups())
            minutes = round(hours * 60 + mins + secs / 60)
            if minutes > 2880:
                raise CsvImportError(f"Row {row_number}: workout Duration exceeds 48 hours.")
        extras.append(
            {
                "rpe": rpe or None,
                "duration_seconds": int(duration) if duration else None,
                "distance_km": round(distance, 6) if distance else None,
                "set_type": SetType.WARMUP if warmup else SetType.DROP if drop else SetType.NORMAL,
                "failed": failed,
                "exercise_notes": note(
                    row.get("exercise_notes" if hevy else "notes", ""), row_number
                ),
                "workout_notes": note(
                    row.get("description" if hevy else "workout notes", ""), row_number
                ),
                "duration_minutes": minutes,
                "detailed": True,
            }
        )
        supersets += bool(row.get("superset_id"))
    if skipped_rest:
        warnings.append(f"Skipped {plural(skipped_rest, 'rest-timer row')}; these are not sets.")
    if supersets:
        warnings.append("Superset grouping is not imported; its sets are kept in exercise order.")
    if unknown_types:
        warnings.append(
            f"Imported {plural(unknown_types, 'unrecognised set type')} as normal sets."
        )
    if measurements:
        if not bodyweights:
            raise CsvImportError("This Strong file contains no body-weight measurements.")
        if skipped_measurements:
            warnings.append(f"Skipped {plural(skipped_measurements, 'non-weight measurement')}.")
        warnings.append(
            "Strong body weights add missing dates only. Existing check-ins are kept. "
            "Multiple readings on a date use their median; source labels are not imported."
        )
        return [], warnings, bodyweights
    if not extras:
        raise CsvImportError("The CSV contains no workout sets after excluding rest timers.")
    rows, native_warnings = parse_rows(output.getvalue().encode())
    if source == "strong":
        warnings.append(
            f"Strong workout weights read as {weight_unit}; distances as {distance_unit}. "
            "Confirm these match the export settings before saving."
        )
    warnings.extend(native_warnings)
    return [replace(row, **extra) for row, extra in zip(rows, extras, strict=True)], warnings, {}
