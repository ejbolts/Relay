from __future__ import annotations

import io
import re
import threading
from dataclasses import dataclass
from datetime import date, timedelta

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from starlette.concurrency import run_in_threadpool

MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024
MAX_SCREENSHOT_PIXELS = 50_000_000
MAX_OCR_SIZE = (3000, 3000)
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "HEIC"}

register_heif_opener()


class CardioScreenshotError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class OcrLine:
    text: str
    confidence: float
    left: float
    top: float
    right: float
    bottom: float

    @property
    def center_x(self) -> float:
        return (self.left + self.right) / 2

    @property
    def height(self) -> float:
        return self.bottom - self.top


_engine = None
_engine_lock = threading.Lock()


def _ocr_engine():
    global _engine
    if _engine is None:
        from rapidocr import RapidOCR

        _engine = RapidOCR()
    return _engine


async def read_cardio_screenshot(upload: UploadFile) -> bytes:
    """Read a scan-only upload and discard its temporary file, including on failure."""
    chunks: list[bytes] = []
    total = 0
    try:
        while chunk := await upload.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_SCREENSHOT_BYTES:
                raise CardioScreenshotError(
                    "screenshot_too_large",
                    "Workout screenshots are limited to 15 MB.",
                    status_code=413,
                )
            chunks.append(chunk)
    finally:
        await upload.close()
    if not chunks:
        raise CardioScreenshotError("invalid_screenshot", "The selected screenshot is empty.")
    return b"".join(chunks)


def _prepare_image(contents: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(contents)) as source:
            if source.format not in ALLOWED_IMAGE_FORMATS:
                raise CardioScreenshotError(
                    "unsupported_screenshot_type",
                    "Choose a JPEG, PNG, WebP, HEIF, or HEIC screenshot.",
                    status_code=415,
                )
            if source.width * source.height > MAX_SCREENSHOT_PIXELS:
                raise CardioScreenshotError(
                    "screenshot_dimensions_too_large",
                    "The selected screenshot has more than 50 megapixels.",
                    status_code=413,
                )
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail(MAX_OCR_SIZE, Image.Resampling.LANCZOS)
            return image
    except CardioScreenshotError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as error:
        raise CardioScreenshotError(
            "invalid_screenshot",
            "The selected file is not a readable workout screenshot.",
        ) from error


def _recognize(contents: bytes) -> list[OcrLine]:
    image = _prepare_image(contents)
    try:
        with _engine_lock:
            result = _ocr_engine()(image)
    finally:
        # Only extracted text leaves OCR; release the decoded photo even if OCR fails.
        image.close()
    texts = result.txts if result is not None and result.txts is not None else []
    scores = result.scores if result is not None and result.scores is not None else []
    boxes = result.boxes if result is not None and result.boxes is not None else []
    lines: list[OcrLine] = []
    for text, confidence, box in zip(texts, scores, boxes, strict=False):
        cleaned = str(text).strip()
        if not cleaned:
            continue
        xs = [float(point[0]) for point in box]
        ys = [float(point[1]) for point in box]
        lines.append(
            OcrLine(
                text=cleaned,
                confidence=float(confidence),
                left=min(xs),
                top=min(ys),
                right=max(xs),
                bottom=max(ys),
            )
        )
    return lines


def _normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _matching_line(lines: list[OcrLine], labels: tuple[str, ...]) -> OcrLine | None:
    for line in lines:
        normalized = _normalized(line.text)
        if any(label in normalized for label in labels):
            return line
    return None


def _value_below(
    lines: list[OcrLine],
    labels: tuple[str, ...],
    value_pattern: re.Pattern[str],
) -> str | None:
    anchor = _matching_line(lines, labels)
    if anchor is None:
        return None
    inline = value_pattern.search(anchor.text)
    if inline:
        return inline.group(0)
    candidates: list[tuple[float, OcrLine]] = []
    for line in lines:
        if line.top < anchor.bottom - 4 or line.top - anchor.bottom > max(180, anchor.height * 5):
            continue
        if not value_pattern.search(line.text):
            continue
        horizontal_gap = abs(line.center_x - anchor.center_x)
        column_width = max(anchor.right - anchor.left, line.right - line.left, 80)
        if horizontal_gap > column_width * 0.85:
            continue
        candidates.append((line.top - anchor.bottom + horizontal_gap * 0.2, line))
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1].text


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    match = re.search(r"\d+(?:[.,]\d+)?", value.replace(" ", ""))
    return float(match.group(0).replace(",", ".")) if match else None


def _workout_date(lines: list[OcrLine], today: date) -> date | None:
    month_names = {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "may": 5,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "sept": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
    for line in lines:
        value = _normalized(line.text)
        match = re.search(
            r"(?:mon|tue|wed|thu|fri|sat|sun)?\s*(\d{1,2})\s+"
            r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)"
            r"(?:\s+(\d{4}))?",
            value,
        )
        if not match:
            match = re.search(
                r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+"
                r"(\d{1,2})(?:\s+(\d{4}))?",
                value,
            )
            if match:
                month_text, day_text, year_text = match.groups()
            else:
                continue
        else:
            day_text, month_text, year_text = match.groups()
        year = int(year_text) if year_text else today.year
        try:
            parsed = date(year, month_names[month_text], int(day_text))
        except ValueError:
            continue
        if year_text is None and parsed > today + timedelta(days=14):
            parsed = parsed.replace(year=year - 1)
        return parsed
    return None


def _duration_minutes(lines: list[OcrLine]) -> int | None:
    raw = _value_below(
        lines,
        ("workout time", "workout duration", "activity duration"),
        re.compile(r"\b\d{1,3}:\d{2}(?::\d{2})?\b"),
    )
    if raw:
        match = re.search(r"(\d{1,3}):(\d{2})(?::(\d{2}))?", raw)
        if match:
            first_text, second_text, third_text = match.groups()
            first = int(first_text)
            second = int(second_text)
            third = int(third_text) if third_text is not None else None
            total_seconds = (
                first * 3600 + second * 60 + third if third is not None else first * 60 + second
            )
            return max(1, (total_seconds + 30) // 60)
    combined = " ".join(line.text for line in lines)
    hours = re.search(r"(\d{1,2})\s*(?:h|hr|hours?)\b", combined, re.I)
    minutes = re.search(r"(\d{1,3})\s*(?:m|min|minutes?)\b", combined, re.I)
    if hours or minutes:
        hour_minutes = int(hours.group(1)) * 60 if hours else 0
        minute_minutes = int(minutes.group(1)) if minutes else 0
        return hour_minutes + minute_minutes
    return None


def _activity_type(lines: list[OcrLine]) -> str | None:
    text = "\n".join(_normalized(line.text) for line in lines)
    activity_patterns = (
        (r"indoor walk|treadmill walk|incline (?:treadmill )?walk", "Incline Treadmill Walking"),
        (r"indoor cycl|stationary bike|indoor bike", "Cycling (Indoor)"),
        (r"stair (?:climber|stepper)|stairmaster", "Stair Climber"),
        (r"rowing|indoor row", "Rowing"),
        (r"outdoor run|running|treadmill run", "Running"),
        (r"outdoor cycl|cycling", "Cycling"),
        (r"outdoor walk|walking", "Walking"),
    )
    for pattern, activity in activity_patterns:
        if re.search(pattern, text):
            return activity
    return None


def _pace_to_speed(lines: list[OcrLine]) -> float | None:
    raw = _value_below(
        lines,
        ("avg pace", "average pace"),
        re.compile(r"\d{1,2}\s*[':]\s*\d{2}"),
    )
    if raw is None:
        return None
    match = re.search(r"(\d{1,2})\s*[':]\s*(\d{2})", raw)
    if not match:
        return None
    pace_minutes = int(match.group(1)) + int(match.group(2)) / 60
    if pace_minutes <= 0:
        return None
    speed = 60 / pace_minutes
    if re.search(r"/(?:mi|mile)", raw, re.I):
        speed *= 1.609344
    return round(speed, 1)


def parse_cardio_ocr(lines: list[OcrLine], today: date | None = None) -> dict[str, object]:
    active_calories_raw = _value_below(
        lines,
        ("active calories", "active calorie", "active energy"),
        re.compile(r"\b\d[\d,]*\s*(?:cal|kcal)\b", re.I),
    )
    calories = _number(active_calories_raw)
    distance_raw = _value_below(
        lines,
        ("distance",),
        re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:km|mi|miles?)\b", re.I),
    )
    distance = _number(distance_raw)
    if distance is not None and distance_raw and re.search(r"\b(?:mi|mile)", distance_raw, re.I):
        distance *= 1.609344
    heart_rate = _number(
        _value_below(
            lines,
            ("avg heart rate", "average heart rate", "avg hr"),
            re.compile(r"\b\d{2,3}\s*(?:bpm)?\b", re.I),
        )
    )
    parsed = {
        "session_date": _workout_date(lines, today or date.today()),
        "activity_type": _activity_type(lines),
        "duration_minutes": _duration_minutes(lines),
        "calories_kcal": int(round(calories)) if calories is not None else None,
        "average_heart_rate_bpm": int(round(heart_rate)) if heart_rate is not None else None,
        "distance_km": round(distance, 3) if distance is not None else None,
        "average_speed_kph": _pace_to_speed(lines),
    }
    field_labels = {
        "session_date": "date",
        "activity_type": "activity",
        "duration_minutes": "workout time",
        "calories_kcal": "active calories",
        "average_heart_rate_bpm": "average heart rate",
        "distance_km": "distance",
        "average_speed_kph": "average speed",
    }
    parsed["fields_found"] = [
        label for key, label in field_labels.items() if parsed[key] is not None
    ]
    parsed["warning"] = (
        None
        if parsed["calories_kcal"] is not None
        else "Active Calories were not found. Total Calories were ignored."
    )
    return parsed


async def scan_cardio_screenshot(upload: UploadFile) -> dict[str, object]:
    contents = await read_cardio_screenshot(upload)
    try:
        lines = await run_in_threadpool(_recognize, contents)
    except CardioScreenshotError:
        raise
    except Exception as error:
        raise CardioScreenshotError(
            "screenshot_scan_failed",
            "The workout screenshot could not be scanned. Try a clearer, uncropped screenshot.",
            status_code=500,
        ) from error
    if not lines:
        raise CardioScreenshotError(
            "screenshot_text_not_found",
            "No workout details were found in that screenshot.",
        )
    parsed = parse_cardio_ocr(lines)
    if not parsed["fields_found"]:
        raise CardioScreenshotError(
            "workout_details_not_found",
            "Text was found, but it did not contain recognizable workout details.",
        )
    return parsed
