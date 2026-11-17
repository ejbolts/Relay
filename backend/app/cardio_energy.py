from calendar import monthrange
from datetime import date, timedelta

from .models import CardioSession
from .tracker_schemas import CardioEnergyPeriodRead
from .training_metrics import start_of_week


def months_before(today: date, months: int) -> date:
    year, month_index = divmod(today.year * 12 + today.month - 1 - months, 12)
    month = month_index + 1
    return date(year, month, min(today.day, monthrange(year, month)[1]))


def cardio_energy_periods(
    sessions: list[CardioSession], today: date, week_start: str
) -> list[CardioEnergyPeriodRead]:
    """Sum recorded cardio energy only, including all zones and excluding future dates."""
    starts = {
        "week": start_of_week(today, week_start),
        "month": today.replace(day=1),
        "3m": months_before(today, 3),
        "6m": months_before(today, 6),
        "year": today.replace(month=1, day=1),
        "all": min((session.session_date for session in sessions), default=today),
    }
    summaries = []
    for period, start in starts.items():
        start = min(start, today)
        selected = [session for session in sessions if start <= session.session_date <= today]
        logged = [session for session in selected if session.calories_kcal is not None]
        previous_start, previous_end = previous_period_range(period, start)
        previous = (
            [
                session
                for session in sessions
                if previous_start <= session.session_date <= previous_end
            ]
            if previous_start is not None and previous_end is not None
            else []
        )
        previous_logged = [session for session in previous if session.calories_kcal is not None]
        metrics = cardio_performance_metrics(selected)
        previous_metrics = cardio_performance_metrics(previous)
        summaries.append(
            CardioEnergyPeriodRead(
                period=period,
                start_date=start,
                end_date=today,
                calories_kcal=sum(session.calories_kcal for session in logged),
                logged_sessions=len(logged),
                total_sessions=len(selected),
                previous_start_date=previous_start,
                previous_end_date=previous_end,
                previous_calories_kcal=(
                    sum(session.calories_kcal for session in previous_logged)
                    if previous_start is not None
                    else None
                ),
                average_heart_rate_bpm=metrics["average_heart_rate_bpm"],
                previous_average_heart_rate_bpm=(
                    previous_metrics["average_heart_rate_bpm"]
                    if previous_start is not None
                    else None
                ),
                distance_km=metrics["distance_km"],
                previous_distance_km=(
                    previous_metrics["distance_km"] if previous_start is not None else None
                ),
                average_speed_kph=metrics["average_speed_kph"],
                previous_average_speed_kph=(
                    previous_metrics["average_speed_kph"] if previous_start is not None else None
                ),
                average_incline_percent=metrics["average_incline_percent"],
                previous_average_incline_percent=(
                    previous_metrics["average_incline_percent"]
                    if previous_start is not None
                    else None
                ),
                average_mets=metrics["average_mets"],
                previous_average_mets=(
                    previous_metrics["average_mets"] if previous_start is not None else None
                ),
                met_minutes=metrics["met_minutes"],
                previous_met_minutes=(
                    previous_metrics["met_minutes"] if previous_start is not None else None
                ),
                elevation_gain_m=metrics["elevation_gain_m"],
                previous_elevation_gain_m=(
                    previous_metrics["elevation_gain_m"] if previous_start is not None else None
                ),
                heart_rate_sessions=metrics["heart_rate_sessions"],
                distance_sessions=metrics["distance_sessions"],
                speed_sessions=metrics["speed_sessions"],
                incline_sessions=metrics["incline_sessions"],
                mets_sessions=metrics["mets_sessions"],
                elevation_sessions=metrics["elevation_sessions"],
            )
        )
    return summaries


def previous_period_range(period: str, start: date) -> tuple[date | None, date | None]:
    if period == "all":
        return None, None
    end = start - timedelta(days=1)
    if period == "week":
        return start - timedelta(days=7), end
    if period == "month":
        return end.replace(day=1), end
    if period == "year":
        return start.replace(year=start.year - 1), end
    return months_before(start, 3 if period == "3m" else 6), end


def weighted_average(sessions: list[CardioSession], field: str) -> float | None:
    recorded = [session for session in sessions if getattr(session, field) is not None]
    if not recorded:
        return None
    duration = sum(session.duration_minutes for session in recorded)
    return round(
        sum(getattr(session, field) * session.duration_minutes for session in recorded) / duration,
        1,
    )


def cardio_performance_metrics(sessions: list[CardioSession]) -> dict[str, float | int | None]:
    return {
        "average_heart_rate_bpm": weighted_average(sessions, "average_heart_rate_bpm"),
        "distance_km": round(sum(session.distance_km or 0 for session in sessions), 2),
        "average_speed_kph": weighted_average(sessions, "average_speed_kph"),
        "average_incline_percent": weighted_average(sessions, "incline_percent"),
        # MET and elevation gain count the logged value, or the estimate when blank.
        "average_mets": weighted_average(sessions, "effective_mets"),
        "met_minutes": round(
            sum(
                session.effective_mets * session.duration_minutes
                for session in sessions
                if session.effective_mets is not None
            ),
            1,
        ),
        "elevation_gain_m": round(
            sum(session.effective_elevation_gain_m or 0 for session in sessions), 1
        ),
        "heart_rate_sessions": sum(
            session.average_heart_rate_bpm is not None for session in sessions
        ),
        "distance_sessions": sum(session.distance_km is not None for session in sessions),
        "speed_sessions": sum(session.average_speed_kph is not None for session in sessions),
        "incline_sessions": sum(session.incline_percent is not None for session in sessions),
        "mets_sessions": sum(session.effective_mets is not None for session in sessions),
        "elevation_sessions": sum(
            session.effective_elevation_gain_m is not None for session in sessions
        ),
    }
