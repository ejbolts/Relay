from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .csv_text import TEXT_ENCODING, TEXT_ENCODING_HEADER, decode_text, encode_text
from .models import BodyMeasurement
from .tracker_csv import DELIMITERS, CsvImportError, format_number

CSV_HEADERS = ("Date", "Weight (kg)", "Body Fat (%)", "Notes")
REQUIRED_HEADERS = CSV_HEADERS[:2]


@dataclass(frozen=True)
class ParsedBodyMeasurement:
    measurement_date: date
    weight_kg: float
    body_fat_pct: float | None
    notes: str | None


@dataclass(frozen=True)
class BodyMeasurementImportSummary:
    measurements_created: int
    measurements_updated: int
    rows_imported: int


def parse_number(value: str | None, field: str, row_number: int) -> float:
    clean = (value or "").strip()
    if not clean:
        raise CsvImportError(f"Row {row_number}: {field} is required.")
    try:
        parsed = float(clean)
    except ValueError as error:
        raise CsvImportError(f"Row {row_number}: {field} must be a number.") from error
    if not math.isfinite(parsed):
        raise CsvImportError(f"Row {row_number}: {field} must be a finite number.")
    return parsed


def parse_optional_number(value: str | None, field: str, row_number: int) -> float | None:
    if not (value or "").strip():
        return None
    return parse_number(value, field, row_number)


def parse_body_measurement_rows(raw: bytes) -> list[ParsedBodyMeasurement]:
    try:
        return _parse_body_measurement_rows(raw)
    except csv.Error as error:
        raise CsvImportError("The CSV has malformed quoting or an oversized field.") from error


def _parse_body_measurement_rows(raw: bytes) -> list[ParsedBodyMeasurement]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise CsvImportError("The file must be UTF-8 encoded.") from error
    if not text.strip():
        raise CsvImportError("The CSV file is empty.")

    first_line = text.splitlines()[0]
    delimiter = max(DELIMITERS, key=first_line.count)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter, strict=True)
    headers = [(header or "").strip() for header in (reader.fieldnames or [])]
    if len(headers) != len(set(headers)):
        raise CsvImportError("The CSV contains duplicate column names.")
    reader.fieldnames = headers
    supplied = {(header or "").strip() for header in (reader.fieldnames or [])}
    missing = [header for header in REQUIRED_HEADERS if header not in supplied]
    if missing:
        raise CsvImportError(f"Missing required columns: {', '.join(missing)}.")

    rows: list[ParsedBodyMeasurement] = []
    seen_dates: set[date] = set()
    for row_number, row in enumerate(reader, start=2):
        if None in row:
            raise CsvImportError(f"Row {row_number}: there are more values than columns.")
        if not any((value or "").strip() for value in row.values()):
            continue

        raw_date = (row.get("Date") or "").strip()
        try:
            measurement_date = date.fromisoformat(raw_date)
        except ValueError as error:
            raise CsvImportError(f"Row {row_number}: Date must use YYYY-MM-DD format.") from error
        if measurement_date.isoformat() != raw_date:
            raise CsvImportError(f"Row {row_number}: Date must use YYYY-MM-DD format.")
        if measurement_date in seen_dates:
            raise CsvImportError(
                f"Row {row_number}: Date {measurement_date.isoformat()} appears more than once."
            )
        seen_dates.add(measurement_date)

        weight_kg = parse_number(row.get("Weight (kg)"), "Weight (kg)", row_number)
        if not 0 < weight_kg <= 500:
            raise CsvImportError(f"Row {row_number}: Weight (kg) must be between 0 and 500.")
        body_fat_pct = parse_optional_number(row.get("Body Fat (%)"), "Body Fat (%)", row_number)
        if body_fat_pct is not None and not 1 <= body_fat_pct <= 70:
            raise CsvImportError(f"Row {row_number}: Body Fat (%) must be between 1 and 70.")
        notes = decode_text(row, "Notes").strip() or None
        if notes is not None and len(notes) > 2_000:
            raise CsvImportError(f"Row {row_number}: Notes must be 2,000 characters or fewer.")

        rows.append(
            ParsedBodyMeasurement(
                measurement_date=measurement_date,
                weight_kg=weight_kg,
                body_fat_pct=body_fat_pct,
                notes=notes,
            )
        )

    if not rows:
        raise CsvImportError("The CSV contains no body-weight rows.")
    return rows


def import_body_measurements(db: Session, user_id: str, raw: bytes) -> BodyMeasurementImportSummary:
    rows = parse_body_measurement_rows(raw)
    dates = [row.measurement_date for row in rows]
    existing = {
        measurement.measurement_date: measurement
        for measurement in db.scalars(
            select(BodyMeasurement).where(
                BodyMeasurement.user_id == user_id, BodyMeasurement.measurement_date.in_(dates)
            )
        )
    }
    created = 0
    updated = 0
    for row in rows:
        measurement = existing.get(row.measurement_date)
        if measurement is None:
            measurement = BodyMeasurement(
                user_id=user_id,
                measurement_date=row.measurement_date,
                weight_kg=row.weight_kg,
                body_fat_pct=row.body_fat_pct,
                notes=row.notes,
                is_sample=False,
            )
            db.add(measurement)
            created += 1
        else:
            measurement.weight_kg = row.weight_kg
            measurement.body_fat_pct = row.body_fat_pct
            measurement.notes = row.notes
            measurement.is_sample = False
            updated += 1
    db.flush()
    return BodyMeasurementImportSummary(
        measurements_created=created,
        measurements_updated=updated,
        rows_imported=len(rows),
    )


def export_body_measurements(measurements: list[BodyMeasurement]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    encoded = any(encode_text(item.notes or "") != (item.notes or "") for item in measurements)
    writer.writerow((*CSV_HEADERS, *((TEXT_ENCODING_HEADER,) if encoded else ())))
    for measurement in measurements:
        writer.writerow(
            (
                measurement.measurement_date.isoformat(),
                format_number(measurement.weight_kg),
                format_number(measurement.body_fat_pct),
                encode_text(measurement.notes or ""),
                *((TEXT_ENCODING,) if encoded else ()),
            )
        )
    return output.getvalue()
