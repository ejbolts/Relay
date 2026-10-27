from __future__ import annotations

import json
import uuid
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .account_limits import (
    CARDIO_NOT_SAVED,
    EXERCISE_NOT_CREATED,
    IMPORT_NOT_SAVED,
    PHOTO_NOT_UPLOADED,
    WORKOUT_NOT_SAVED,
    AccountLimits,
    check_account_total,
    check_workout_size,
    limit_save_rate,
    load_account_limits,
    refuse,
)
from .auth import CurrentUser, get_current_user
from .body_measurement_csv import export_body_measurements, import_body_measurements
from .cardio_energy import cardio_energy_periods
from .cardio_ocr import CardioScreenshotError, scan_cardio_screenshot
from .config import Settings, get_settings
from .database import get_db
from .errors import api_error
from .exercise_aliases import canonical_exercise_name
from .models import (
    BodyMeasurement,
    BodyWeightGoal,
    CardioSession,
    Exercise,
    ExerciseKind,
    ExerciseMuscleContribution,
    MachinePhoto,
    MuscleRole,
    PersonalRecord,
    SupersetGroup,
    TrainingWorkout,
    User,
    WorkoutCategory,
    WorkoutMovement,
    WorkoutSet,
    WorkoutType,
    movement_machine_photos,
)
from .photo_storage import (
    PhotoValidationError,
    delete_machine_photo_files,
    store_machine_photo,
)
from .processing import backfill_completed_video_links
from .tracker_csv import CsvImportError, ImportPlan, export_workouts, import_workouts, plan_import
from .tracker_schemas import (
    BodyMeasurementCreate,
    BodyMeasurementCsvImportRead,
    BodyMeasurementRead,
    BodyWeightGoalCreate,
    BodyWeightGoalRead,
    CalendarExerciseRead,
    CalendarWorkoutRead,
    CardioCaloriesUpdate,
    CardioMetricsUpdate,
    CardioOverviewRead,
    CardioScreenshotRead,
    CardioSessionCreate,
    CardioSessionRead,
    CsvImportPreviewRead,
    CsvImportRead,
    CsvImportSessionRead,
    DashboardRead,
    ExerciseCreate,
    ExerciseFavoriteUpdate,
    ExerciseHistoryBaselineRead,
    ExerciseLatestSessionRead,
    ExerciseLibrarySummaryRead,
    ExerciseProgressRead,
    ExerciseRead,
    ExerciseTrendPointRead,
    HeatmapDay,
    MachinePhotoCaptionUpdate,
    MachinePhotoRead,
    MachinePhotoUsageRead,
    MuscleFrequencyRead,
    MuscleSetCreditCreate,
    MuscleVolumeRead,
    PersonalRecordRead,
    ProgressPoint,
    TrainingPreferencesRead,
    TrainingPreferencesUpdate,
    TrainingTimeRead,
    TrainingWorkoutCreate,
    TrainingWorkoutRead,
    WeeklyDayBreakdown,
    WeeklyExerciseBreakdown,
    WeeklyMuscleContributionRead,
    WeeklyMuscleSetsRead,
    WeeklySetsRead,
    WeightRepsRead,
    WorkoutCacheRevisionRead,
    WorkoutHistorySummaryRead,
    WorkoutRecommendationRead,
    WorkoutSetRead,
    WorkoutSnapshotRead,
    WorkoutTypeColors,
    WorkoutTypeCreate,
    WorkoutTypeRead,
    WorkoutTypeUpdate,
    Zone2WeekRead,
)
from .training_metrics import (
    estimated_one_rep_max,
    get_setting,
    is_pr_eligible,
    is_working_set,
    muscle_credits,
    muscle_volume,
    preferred_weight_unit,
    rebuild_personal_records,
    seed_muscle_mappings,
    set_setting,
    start_of_week,
)
from .training_time import training_time_totals
from .workout_types import (
    ARCHIVED_KEY,
    DEFAULT_NAMES,
    MAX_CUSTOM_TYPES,
    archived_builtins,
    assign_workout_type,
    ensure_unique_name,
    type_colors,
    workout_type_catalog,
)

router = APIRouter(
    prefix="/api",
    tags=["workout tracking"],
    dependencies=[Depends(get_current_user), Depends(limit_save_rate)],
)
DbSession = Annotated[Session, Depends(get_db)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]
WORKOUT_CACHE_REVISION_KEY = "workout_cache_revision"
WORKOUT_TYPE_COLORS_KEY = "workout_type_colors"
DEFAULT_WORKOUT_TYPE_COLORS = WorkoutTypeColors(
    upper="#8b5cf6",
    lower="#f59e0b",
    push="#ef476f",
    pull="#3b82f6",
    full_body="#14b8a6",
    cardio="#22c55e",
    other="#94a3b8",
)


def workout_cache_revision(db: Session, user_id: str) -> str:
    return get_setting(db, user_id, WORKOUT_CACHE_REVISION_KEY, "0")


def bump_workout_cache_revision(db: Session, user_id: str) -> None:
    set_setting(db, user_id, WORKOUT_CACHE_REVISION_KEY, str(uuid.uuid4()))


def get_owned(db: Session, model, item_id: str, user_id: str):
    """Load a user-owned row by id; another user's row is indistinguishable from a missing one."""
    item = db.get(model, item_id)
    return item if item is not None and item.user_id == user_id else None


DEFAULT_EXERCISES = (
    ("Barbell Bench Press", WorkoutCategory.PUSH, "Chest", "Barbell"),
    ("Incline Dumbbell Press", WorkoutCategory.PUSH, "Chest", "Dumbbell"),
    ("Overhead Press", WorkoutCategory.PUSH, "Shoulders", "Barbell"),
    ("Dumbbell Shoulder Press", WorkoutCategory.PUSH, "Shoulders", "Dumbbell"),
    ("Lateral Raise", WorkoutCategory.PUSH, "Shoulders", "Dumbbell"),
    ("Cable Fly", WorkoutCategory.PUSH, "Chest", "Cable"),
    ("Pec Deck", WorkoutCategory.PUSH, "Chest", "Machine"),
    ("Triceps Pushdown", WorkoutCategory.PUSH, "Triceps", "Cable"),
    (
        "Single-Arm Cable Triceps Pushdown",
        WorkoutCategory.PUSH,
        "Triceps",
        "Cable",
    ),
    ("Triceps Machine Extension", WorkoutCategory.PUSH, "Triceps", "Machine"),
    ("Dips", WorkoutCategory.PUSH, "Chest / Triceps", "Bodyweight"),
    ("Deadlift", WorkoutCategory.PULL, "Posterior chain", "Barbell"),
    ("Barbell Row", WorkoutCategory.PULL, "Mid / Upper Back", "Barbell"),
    ("Pull-up", WorkoutCategory.PULL, "Lats", "Bodyweight"),
    ("Lat Pulldown", WorkoutCategory.PULL, "Lats", "Cable"),
    ("Single-Arm Lat Pulldown (Machine)", WorkoutCategory.PULL, "Lats", "Machine"),
    ("Seated Cable Row", WorkoutCategory.PULL, "Mid / Upper Back", "Cable"),
    ("Seated Machine Row", WorkoutCategory.PULL, "Mid / Upper Back", "Machine"),
    ("Face Pull", WorkoutCategory.PULL, "Rear Delts", "Cable"),
    ("Cable Shoulder Extensions", WorkoutCategory.PULL, "Rear Delts", "Cable"),
    ("Barbell Curl", WorkoutCategory.PULL, "Biceps", "Barbell"),
    ("Machine Bicep Preacher Curl", WorkoutCategory.PULL, "Biceps", "Machine"),
    ("Single-Arm Preacher Curl", WorkoutCategory.PULL, "Biceps", "Dumbbell"),
    ("Hammer Curl", WorkoutCategory.PULL, "Biceps", "Dumbbell"),
    ("Back Squat", WorkoutCategory.LOWER, "Quads", "Barbell"),
    ("Front Squat", WorkoutCategory.LOWER, "Quads", "Barbell"),
    ("Romanian Deadlift", WorkoutCategory.LOWER, "Hamstrings", "Barbell"),
    ("Leg Press", WorkoutCategory.LOWER, "Quads", "Machine"),
    ("Single Leg Press", WorkoutCategory.LOWER, "Quads", "Machine"),
    ("Bulgarian Split Squat", WorkoutCategory.LOWER, "Quads", "Dumbbell"),
    ("Leg Extension", WorkoutCategory.LOWER, "Quads", "Machine"),
    ("Seated Leg Curl", WorkoutCategory.LOWER, "Hamstrings", "Machine"),
    ("Lying Leg Curl", WorkoutCategory.LOWER, "Hamstrings", "Machine"),
    ("Hip Thrust", WorkoutCategory.LOWER, "Glutes", "Barbell"),
    ("Standing Calf Raise", WorkoutCategory.LOWER, "Calves", "Machine"),
    ("Back Extension Machine", WorkoutCategory.LOWER, "Lower Back", "Machine"),
    ("Seated Ab Crunch Machine", WorkoutCategory.FULL_BODY, "Core", "Machine"),
    ("Plank", WorkoutCategory.FULL_BODY, "Core", "Bodyweight"),
    ("Hanging Leg Raise", WorkoutCategory.FULL_BODY, "Core", "Bodyweight"),
)

DEFAULT_CARDIO = (
    ("Running", "Cardio", "Outdoor / Treadmill"),
    ("Incline Treadmill Walking", "Cardio", "Treadmill"),
    ("Cycling", "Cardio", "Bike"),
    ("Cycling (Indoor)", "Cardio", "Stationary Bike"),
    ("Rowing", "Cardio", "Rowing machine"),
    ("Stair Climber", "Cardio", "Machine"),
    ("Walking", "Cardio", "Outdoor / Treadmill"),
)

TRAINING_ROTATION = (
    WorkoutCategory.PUSH,
    WorkoutCategory.PULL,
    WorkoutCategory.LOWER,
    WorkoutCategory.CARDIO,
)
SESSION_MUSCLE_GROUPS = {
    WorkoutCategory.PUSH: ("Pectorals", "Front delts", "Side delts", "Triceps"),
    WorkoutCategory.PULL: ("Lats", "Mid / Upper Back", "Rear deltoids", "Biceps", "Forearms"),
    WorkoutCategory.LOWER: ("Quadriceps", "Hamstrings", "Glutes", "Calves"),
    WorkoutCategory.CARDIO: ("Cardio",),
}
SESSION_NAMES = {
    WorkoutCategory.PUSH: "Push",
    WorkoutCategory.PULL: "Pull",
    WorkoutCategory.LOWER: "Legs",
    WorkoutCategory.CARDIO: "Cardio",
}


def exercise_muscle_credits(exercise: Exercise) -> list[tuple[str, float]]:
    if exercise.category == WorkoutCategory.CARDIO or exercise.kind == ExerciseKind.CARDIO:
        return []
    return muscle_credits(exercise)


def exercise_coverage_groups(exercise: Exercise) -> set[str]:
    if exercise.category == WorkoutCategory.CARDIO or exercise.kind == ExerciseKind.CARDIO:
        return {"Cardio"}
    return {group for group, _ in exercise_muscle_credits(exercise)}


def weekly_sets(
    workouts: list[TrainingWorkout], today: date, week_start_day: str = "monday"
) -> WeeklySetsRead:
    week_start = start_of_week(today, week_start_day)
    week_end = week_start + timedelta(days=6)
    active_start = today - timedelta(days=27)
    active_groups: set[str] = set()
    raw_by_group: dict[str, float] = defaultdict(float)
    effective_by_group: dict[str, float] = defaultdict(float)
    rpes_by_group: dict[str, list[float]] = defaultdict(list)
    contributions_by_group: dict[str, list[WeeklyMuscleContributionRead]] = defaultdict(list)
    raw_sets = 0
    rated_sets = 0
    unrated_sets = 0
    low_rpe_sets = 0

    for workout in workouts:
        if not active_start <= workout.workout_date <= today:
            continue
        in_current_week = week_start <= workout.workout_date <= today
        for movement in workout.movements:
            credits = exercise_muscle_credits(movement.exercise)
            if not credits:
                continue
            work_sets = [item for item in movement.sets if is_working_set(item)]
            if work_sets:
                active_groups.update(group for group, _ in credits)
            if not in_current_week:
                continue
            if work_sets:
                for group, contribution in credits:
                    if contribution <= 0:
                        continue
                    contributions_by_group[group].append(
                        WeeklyMuscleContributionRead(
                            workout_id=workout.id,
                            workout_name=workout.name,
                            workout_date=workout.workout_date,
                            movement_id=movement.id,
                            exercise_id=movement.exercise.id,
                            exercise_name=movement.exercise.name,
                            working_sets=len(work_sets),
                            credit_per_set=contribution,
                            set_credits=len(work_sets) * contribution,
                        )
                    )
            for item in work_sets:
                raw_sets += 1
                is_effective = item.rpe is None or item.rpe >= 7
                if item.rpe is None:
                    unrated_sets += 1
                else:
                    rated_sets += 1
                    if item.rpe < 7:
                        low_rpe_sets += 1
                for group, contribution in credits:
                    raw_by_group[group] += contribution
                    if is_effective:
                        effective_by_group[group] += contribution
                    if item.rpe is not None:
                        rpes_by_group[group].append(item.rpe)

    muscle_groups: list[WeeklyMuscleSetsRead] = []
    for group in sorted(active_groups):
        effective = round(effective_by_group[group], 1)
        group_rpes = rpes_by_group[group]
        muscle_groups.append(
            WeeklyMuscleSetsRead(
                muscle_group=group,
                raw_sets=round(raw_by_group[group], 1),
                effective_sets=effective,
                average_rpe=(round(sum(group_rpes) / len(group_rpes), 1) if group_rpes else None),
                contributions=contributions_by_group[group],
            )
        )

    return WeeklySetsRead(
        week_start=week_start,
        week_end=week_end,
        raw_sets=raw_sets,
        effective_sets=round(sum(item.effective_sets for item in muscle_groups), 1),
        unrated_sets=unrated_sets,
        low_rpe_sets=low_rpe_sets,
        rpe_logging_percent=round(rated_sets / raw_sets * 100, 1) if raw_sets else 0.0,
        muscle_groups=muscle_groups,
    )


def workout_recommendation(
    workouts: list[TrainingWorkout],
    today: date,
    earlier_rotation: WorkoutCategory | None = None,
) -> WorkoutRecommendationRead:
    """``earlier_rotation`` is the latest rotation category older than ``workouts``, if any."""
    recent_start = today - timedelta(days=6)
    group_dates: dict[str, set[date]] = defaultdict(set)
    for workout in workouts:
        if not recent_start <= workout.workout_date <= today:
            continue
        for movement in workout.movements:
            if not any(is_working_set(item) for item in movement.sets):
                continue
            for group in exercise_coverage_groups(movement.exercise):
                group_dates[group].add(workout.workout_date)

    last_rotation = next(
        (workout.category for workout in workouts if workout.category in TRAINING_ROTATION),
        earlier_rotation,
    )
    rotation_next = (
        WorkoutCategory.PUSH
        if last_rotation is None
        else TRAINING_ROTATION[
            (TRAINING_ROTATION.index(last_rotation) + 1) % len(TRAINING_ROTATION)
        ]
    )

    def candidate_score(category: WorkoutCategory) -> float:
        groups = SESSION_MUSCLE_GROUPS[category]
        target = 1 if category == WorkoutCategory.CARDIO else 2
        deficits = [max(0, target - len(group_dates[group])) for group in groups]
        days_since = [
            min((today - max(group_dates[group])).days, 7) if group_dates[group] else 7
            for group in groups
        ]
        coverage_need = sum(deficits) / len(groups)
        recovery_readiness = sum(days_since) / len(days_since) / 7
        rotation_bonus = 0.8 if category == rotation_next else 0
        return coverage_need * 2 + recovery_readiness + rotation_bonus

    recommended = max(TRAINING_ROTATION, key=candidate_score)
    target = 1 if recommended == WorkoutCategory.CARDIO else 2
    frequencies = [
        MuscleFrequencyRead(
            muscle_group=group,
            sessions_last_7_days=len(group_dates[group]),
            target_sessions=target,
        )
        for group in SESSION_MUSCLE_GROUPS[recommended]
    ]
    overdue = [item.muscle_group for item in frequencies if item.sessions_last_7_days < target]
    overdue_text = ", ".join(overdue[:3])
    if recommended == rotation_next:
        reason = "Next in your Push → Pull → Legs → Cardio rotation."
        if overdue_text:
            reason += f" {overdue_text} are also below their 7-day frequency target."
    else:
        reason = (
            f"{SESSION_NAMES[recommended]} moves ahead of {SESSION_NAMES[rotation_next]} because "
            f"{overdue_text or 'its muscle groups'} have the largest 7-day frequency gap."
        )
    return WorkoutRecommendationRead(
        category=recommended,
        session_name=f"{SESSION_NAMES[recommended]} workout",
        rotation_next=rotation_next,
        reason=reason,
        muscle_frequency=frequencies,
    )


def seed_default_exercises(db: Session, user_id: str) -> None:
    existing = {
        item.name.casefold(): item
        for item in db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    }
    renamed_default = False
    legacy_leg_curl = existing.get("leg curl")
    seated_leg_curl = existing.get("seated leg curl")
    if legacy_leg_curl and not legacy_leg_curl.is_custom and not seated_leg_curl:
        legacy_leg_curl.name = "Seated Leg Curl"
        existing.pop("leg curl")
        existing["seated leg curl"] = legacy_leg_curl
        renamed_default = True
    legacy_single_arm_lat_pulldown = existing.get("single-arm lat pulldown")
    machine_single_arm_lat_pulldown = existing.get("single-arm lat pulldown (machine)")
    if (
        legacy_single_arm_lat_pulldown
        and not legacy_single_arm_lat_pulldown.is_custom
        and not machine_single_arm_lat_pulldown
    ):
        legacy_single_arm_lat_pulldown.name = "Single-Arm Lat Pulldown (Machine)"
        existing.pop("single-arm lat pulldown")
        existing["single-arm lat pulldown (machine)"] = legacy_single_arm_lat_pulldown
        renamed_default = True
    defaults = (
        *(
            (name, category, ExerciseKind.STRENGTH, muscle_group, equipment)
            for name, category, muscle_group, equipment in DEFAULT_EXERCISES
        ),
        *(
            (name, WorkoutCategory.CARDIO, ExerciseKind.CARDIO, muscle_group, equipment)
            for name, muscle_group, equipment in DEFAULT_CARDIO
        ),
    )
    for name, category, kind, muscle_group, equipment in defaults:
        exercise = existing.get(name.casefold())
        if exercise and not exercise.is_custom:
            exercise.category = category
            exercise.kind = kind
            exercise.muscle_group = muscle_group
            exercise.equipment = equipment
        elif not exercise:
            db.add(
                Exercise(
                    user_id=user_id,
                    name=name,
                    category=category,
                    kind=kind,
                    muscle_group=muscle_group,
                    equipment=equipment,
                )
            )
    if renamed_default:
        bump_workout_cache_revision(db, user_id)
    db.commit()
    seed_muscle_mappings(db, user_id)


def workout_options():
    return (
        selectinload(TrainingWorkout.workout_type),
        selectinload(TrainingWorkout.movements)
        .selectinload(WorkoutMovement.exercise)
        .selectinload(Exercise.muscle_contributions),
        selectinload(TrainingWorkout.movements).selectinload(WorkoutMovement.sets),
        selectinload(TrainingWorkout.movements).selectinload(WorkoutMovement.machine_photos),
        selectinload(TrainingWorkout.movements).selectinload(WorkoutMovement.superset_group),
    )


def load_workout(db: Session, user_id: str, workout_id: str) -> TrainingWorkout:
    workout = db.scalar(
        select(TrainingWorkout)
        .where(TrainingWorkout.id == workout_id, TrainingWorkout.user_id == user_id)
        .options(*workout_options())
    )
    if not workout:
        raise HTTPException(status_code=404, detail="Workout was not found.")
    return workout


def replace_workout_contents(
    db: Session, user_id: str, workout: TrainingWorkout, payload: TrainingWorkoutCreate
) -> None:
    assign_workout_type(db, user_id, workout, payload)
    workout.name = payload.name
    workout.workout_date = payload.workout_date
    workout.category = payload.category
    workout.notes = payload.notes
    workout.duration_minutes = payload.duration_minutes
    workout.start_time = payload.start_time
    workout.end_time = payload.end_time
    workout.movements.clear()
    workout.superset_groups.clear()
    db.flush()
    group_counts: dict[str, int] = defaultdict(int)
    for movement_payload in payload.movements:
        if movement_payload.superset_key:
            group_counts[movement_payload.superset_key] += 1
    if any(count < 2 for count in group_counts.values()):
        raise HTTPException(
            status_code=422, detail="A superset must contain at least two exercises."
        )
    groups = {
        key: SupersetGroup(order_index=index, name=f"Superset {index + 1}")
        for index, key in enumerate(group_counts)
    }
    workout.superset_groups.extend(groups.values())
    db.flush()
    for movement_index, movement_payload in enumerate(payload.movements):
        exercise = get_owned(db, Exercise, movement_payload.exercise_id, user_id)
        if not exercise:
            raise HTTPException(
                status_code=422,
                detail=f"Exercise {movement_payload.exercise_id} was not found.",
            )
        movement = WorkoutMovement(
            exercise=exercise,
            order_index=movement_index,
            notes=movement_payload.notes,
            superset_group=groups.get(movement_payload.superset_key or ""),
        )
        if movement_payload.machine_photo_ids:
            photos = list(
                db.scalars(
                    select(MachinePhoto).where(
                        MachinePhoto.id.in_(movement_payload.machine_photo_ids),
                        MachinePhoto.user_id == user_id,
                    )
                )
            )
            photos_by_id = {photo.id: photo for photo in photos}
            missing = [
                photo_id
                for photo_id in movement_payload.machine_photo_ids
                if photo_id not in photos_by_id
            ]
            if missing:
                raise HTTPException(status_code=422, detail="A pinned machine photo was not found.")
            if any(photo.exercise_id != exercise.id for photo in photos):
                raise HTTPException(
                    status_code=422,
                    detail="Machine photos must belong to the movement's exercise.",
                )
            movement.machine_photos = [
                photos_by_id[photo_id] for photo_id in movement_payload.machine_photo_ids
            ]
        for set_index, set_payload in enumerate(movement_payload.sets):
            movement.sets.append(WorkoutSet(order_index=set_index, **set_payload.model_dump()))
        workout.movements.append(movement)


def sync_workout_cardio_sessions(db: Session, workout: TrainingWorkout) -> None:
    """Mirror completed cardio movements into the cardio-session ledger."""
    existing = {
        session.source_movement_index: session
        for session in db.scalars(
            select(CardioSession).where(CardioSession.source_workout_id == workout.id)
        )
    }
    imported_indexes: set[int] = set()
    manual_metrics_by_exercise = {
        session.source_exercise_id: {
            "calories_kcal": session.calories_kcal,
            "average_heart_rate_bpm": session.average_heart_rate_bpm,
            "average_power_watts": session.average_power_watts,
            "average_mets": session.average_mets,
        }
        for session in existing.values()
    }
    for movement in workout.movements:
        if movement.exercise.kind != ExerciseKind.CARDIO:
            continue
        duration_seconds = sum(
            item.duration_seconds or 0
            for item in movement.sets
            if item.completed and (item.duration_seconds or 0) > 0
        )
        duration_minutes = duration_seconds // 60
        if duration_minutes < 1:
            continue
        imported_indexes.add(movement.order_index)
        session = existing.get(movement.order_index)
        created = session is None
        if session is None:
            session = CardioSession(
                user_id=workout.user_id,
                source_workout_id=workout.id,
                source_movement_index=movement.order_index,
            )
            db.add(session)
        session.session_date = workout.workout_date
        session.activity_type = movement.exercise.name
        session.duration_minutes = duration_minutes
        session.source_exercise_id = movement.exercise_id
        completed_sets = [item for item in movement.sets if item.completed]
        manual_metrics = manual_metrics_by_exercise.get(movement.exercise_id, {})
        calorie_sets = [item for item in completed_sets if item.calories_kcal is not None]
        heart_rate_sets = [
            item for item in completed_sets if item.average_heart_rate_bpm is not None
        ]
        heart_rate_duration = sum(item.duration_seconds or 0 for item in heart_rate_sets)
        session.calories_kcal = (
            sum(item.calories_kcal for item in calorie_sets)
            if calorie_sets
            else manual_metrics.get("calories_kcal")
        )
        session.average_heart_rate_bpm = (
            round(
                sum(
                    item.average_heart_rate_bpm * (item.duration_seconds or 0)
                    for item in heart_rate_sets
                )
                / heart_rate_duration
            )
            if heart_rate_duration > 0
            else (
                round(
                    sum(item.average_heart_rate_bpm for item in heart_rate_sets)
                    / len(heart_rate_sets)
                )
                if heart_rate_sets
                else manual_metrics.get("average_heart_rate_bpm")
            )
        )
        session.average_power_watts = manual_metrics.get("average_power_watts")
        session.average_mets = manual_metrics.get("average_mets")
        distances = [item.distance_km for item in completed_sets if item.distance_km is not None]
        speed_sets = [item for item in completed_sets if item.speed_kph is not None]
        incline_sets = [item for item in completed_sets if item.incline_percent is not None]
        session.distance_km = round(sum(distances), 2) if distances else None
        session.average_speed_kph = (
            round(
                sum(item.speed_kph * (item.duration_seconds or 0) for item in speed_sets)
                / sum(item.duration_seconds or 0 for item in speed_sets),
                1,
            )
            if sum(item.duration_seconds or 0 for item in speed_sets) > 0
            else (
                round(sum(item.speed_kph for item in speed_sets) / len(speed_sets), 1)
                if speed_sets
                else None
            )
        )
        session.incline_percent = (
            round(
                sum(item.incline_percent * (item.duration_seconds or 0) for item in incline_sets)
                / sum(item.duration_seconds or 0 for item in incline_sets),
                1,
            )
            if sum(item.duration_seconds or 0 for item in incline_sets) > 0
            else (
                round(sum(item.incline_percent for item in incline_sets) / len(incline_sets), 1)
                if incline_sets
                else None
            )
        )
        session.intensity = "Imported from workout"
        if created:
            session.zone = "Zone 2"
            session.qualifies_zone2 = True
        session.notes = movement.notes
    for movement_index, session in existing.items():
        if movement_index not in imported_indexes:
            db.delete(session)


def sync_all_workout_cardio_sessions(db: Session, user_id: str | None = None) -> None:
    query = select(TrainingWorkout).options(*workout_options())
    if user_id is not None:
        query = query.where(TrainingWorkout.user_id == user_id)
    workouts = list(db.scalars(query))
    for workout in workouts:
        sync_workout_cardio_sessions(db, workout)


@router.get("/exercises", response_model=list[ExerciseRead])
def list_exercises(
    db: DbSession,
    user: CurrentUser,
    search: str | None = Query(default=None, max_length=100),
) -> list[Exercise]:
    query = select(Exercise).where(Exercise.user_id == user.id).order_by(Exercise.name)
    if search:
        query = query.where(Exercise.name.ilike(f"%{search.strip()}%"))
    return list(db.scalars(query))


@router.get("/body-measurements", response_model=list[BodyMeasurementRead])
def list_body_measurements(db: DbSession, user: CurrentUser) -> list[BodyMeasurement]:
    return list(
        db.scalars(
            select(BodyMeasurement)
            .where(BodyMeasurement.user_id == user.id)
            .order_by(BodyMeasurement.measurement_date.desc())
        )
    )


@router.post("/body-measurements", response_model=BodyMeasurementRead)
def save_body_measurement(
    payload: BodyMeasurementCreate, db: DbSession, user: CurrentUser
) -> BodyMeasurement:
    measurement = db.scalar(
        select(BodyMeasurement).where(
            BodyMeasurement.user_id == user.id,
            BodyMeasurement.measurement_date == payload.measurement_date,
        )
    )
    if measurement:
        measurement.weight_kg = payload.weight_kg
        measurement.body_fat_pct = payload.body_fat_pct
        measurement.notes = payload.notes
        measurement.is_sample = False
    else:
        measurement = BodyMeasurement(user_id=user.id, **payload.model_dump())
        db.add(measurement)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(measurement)
    return measurement


@router.get("/body-measurements/export.csv")
def export_body_measurement_csv(
    db: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Response:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="Start date must not be after end date.")
    statement = (
        select(BodyMeasurement)
        .where(BodyMeasurement.user_id == user.id)
        .order_by(BodyMeasurement.measurement_date)
    )
    if start_date:
        statement = statement.where(BodyMeasurement.measurement_date >= start_date)
    if end_date:
        statement = statement.where(BodyMeasurement.measurement_date <= end_date)
    measurements = list(db.scalars(statement))
    content = export_body_measurements(measurements)
    filename = f"body-weight-{date.today().isoformat()}.csv"
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/body-measurements/import",
    response_model=BodyMeasurementCsvImportRead,
    status_code=201,
)
async def import_body_measurement_csv(
    db: DbSession, user: CurrentUser, file: Annotated[UploadFile, File(...)]
) -> BodyMeasurementCsvImportRead:
    if file.content_type not in {
        None,
        "text/csv",
        "text/tab-separated-values",
        "text/plain",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }:
        raise HTTPException(status_code=415, detail="Choose a CSV or tab-separated text file.")
    raw = await file.read(5 * 1024 * 1024 + 1)
    await file.close()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Body-weight CSV imports are limited to 5 MB.")
    try:
        summary = import_body_measurements(db, user.id, raw)
    except CsvImportError as error:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    if summary.measurements_created or summary.measurements_updated:
        bump_workout_cache_revision(db, user.id)
    db.commit()
    return BodyMeasurementCsvImportRead(**summary.__dict__)


@router.delete("/body-measurements/{measurement_id}", status_code=204)
def delete_body_measurement(measurement_id: str, db: DbSession, user: CurrentUser) -> None:
    measurement = get_owned(db, BodyMeasurement, measurement_id, user.id)
    if not measurement:
        raise HTTPException(status_code=404, detail="Body measurement was not found.")
    db.delete(measurement)
    bump_workout_cache_revision(db, user.id)
    db.commit()


@router.post("/exercises", response_model=ExerciseRead, status_code=201)
def create_exercise(
    payload: ExerciseCreate, db: DbSession, user: CurrentUser, settings: SettingsDependency
) -> Exercise:
    check_account_total(
        db,
        user,
        Exercise,
        load_account_limits(db, settings).custom_exercises_per_account,
        "custom_exercises_per_account",
        EXERCISE_NOT_CREATED,
        Exercise.is_custom.is_(True),
    )
    exercise_data = payload.model_dump(exclude={"muscle_set_credit", "muscle_set_credits"})
    exercise_data["name"] = canonical_exercise_name(payload.name)
    exercise = Exercise(user_id=user.id, **exercise_data, is_custom=True)
    if payload.kind != ExerciseKind.CARDIO and payload.category != WorkoutCategory.CARDIO:
        credits = payload.muscle_set_credits or [
            MuscleSetCreditCreate(muscle_name=payload.muscle_group, sets=payload.muscle_set_credit)
        ]
        exercise.muscle_contributions = [
            ExerciseMuscleContribution(
                muscle_name=credit.muscle_name,
                role=MuscleRole.PRIMARY if credit.sets == 1 else MuscleRole.SECONDARY,
                contribution_factor=credit.sets,
            )
            for credit in credits
        ]
    try:
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return exercise
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="An exercise with that name already exists."
        ) from error


@router.patch("/exercises/{exercise_id}/favorite", response_model=ExerciseRead)
def update_exercise_favorite(
    exercise_id: str, payload: ExerciseFavoriteUpdate, db: DbSession, user: CurrentUser
) -> Exercise:
    exercise = get_owned(db, Exercise, exercise_id, user.id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise was not found.")
    exercise.is_favorite = payload.is_favorite
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(exercise)
    return exercise


def machine_photo_usage(
    db: Session, user_id: str, photos: list[MachinePhoto]
) -> list[MachinePhotoUsageRead]:
    """Attach each photo's saved-workout count and most recent workout date."""
    usage: dict[str, tuple[int, date | None]] = {}
    if photos:
        rows = db.execute(
            select(
                movement_machine_photos.c.machine_photo_id,
                func.count(func.distinct(TrainingWorkout.id)),
                func.max(TrainingWorkout.workout_date),
            )
            .select_from(movement_machine_photos)
            .join(WorkoutMovement, WorkoutMovement.id == movement_machine_photos.c.movement_id)
            .join(TrainingWorkout, TrainingWorkout.id == WorkoutMovement.workout_id)
            .where(
                movement_machine_photos.c.machine_photo_id.in_([photo.id for photo in photos]),
                TrainingWorkout.user_id == user_id,
            )
            .group_by(movement_machine_photos.c.machine_photo_id)
        )
        usage = {photo_id: (count, last_used) for photo_id, count, last_used in rows}
    machines = []
    for photo in photos:
        workout_count, last_used_date = usage.get(photo.id, (0, None))
        machines.append(
            MachinePhotoUsageRead(
                **MachinePhotoRead.model_validate(photo).model_dump(),
                exercise_name=photo.exercise.name,
                workout_count=workout_count,
                last_used_date=last_used_date,
            )
        )
    return machines


@router.get("/machine-photos", response_model=list[MachinePhotoUsageRead])
def list_all_machine_photos(db: DbSession, user: CurrentUser) -> list[MachinePhotoUsageRead]:
    """Every saved machine, most recently used first, so History can filter by one."""
    photos = list(
        db.scalars(
            select(MachinePhoto)
            .where(MachinePhoto.user_id == user.id)
            .options(selectinload(MachinePhoto.exercise))
            .order_by(MachinePhoto.created_at.desc())
        )
    )
    machines = machine_photo_usage(db, user.id, photos)
    # Stable sorts: unused machines stay newest-first after the used ones.
    machines.sort(key=lambda item: item.last_used_date or date.min, reverse=True)
    return machines


@router.get("/machine-photos/{photo_id}/workouts", response_model=list[TrainingWorkoutRead])
def list_machine_photo_workouts(
    photo_id: str, db: DbSession, user: CurrentUser
) -> list[TrainingWorkout]:
    """Saved workouts where this machine was pinned, newest first."""
    if not get_owned(db, MachinePhoto, photo_id, user.id):
        raise HTTPException(status_code=404, detail="Machine photo was not found.")
    pinned_workout_ids = (
        select(WorkoutMovement.workout_id)
        .join(
            movement_machine_photos,
            movement_machine_photos.c.movement_id == WorkoutMovement.id,
        )
        .where(movement_machine_photos.c.machine_photo_id == photo_id)
    )
    return list(
        db.scalars(
            select(TrainingWorkout)
            .where(TrainingWorkout.user_id == user.id, TrainingWorkout.id.in_(pinned_workout_ids))
            .options(*workout_options())
            .order_by(TrainingWorkout.workout_date.desc(), TrainingWorkout.created_at.desc())
        )
    )


@router.get("/exercises/{exercise_id}/machine-photos", response_model=list[MachinePhotoUsageRead])
def list_machine_photos(
    exercise_id: str, db: DbSession, user: CurrentUser
) -> list[MachinePhotoUsageRead]:
    if not get_owned(db, Exercise, exercise_id, user.id):
        raise HTTPException(status_code=404, detail="Exercise was not found.")
    photos = list(
        db.scalars(
            select(MachinePhoto)
            .where(MachinePhoto.exercise_id == exercise_id, MachinePhoto.user_id == user.id)
            .options(selectinload(MachinePhoto.exercise))
            .order_by(MachinePhoto.created_at.desc())
        )
    )
    return machine_photo_usage(db, user.id, photos)


@router.get(
    "/exercises/{exercise_id}/machine-photos/last-used",
    response_model=list[MachinePhotoRead],
)
def last_used_machine_photos(
    exercise_id: str, db: DbSession, user: CurrentUser
) -> list[MachinePhoto]:
    if not get_owned(db, Exercise, exercise_id, user.id):
        raise HTTPException(status_code=404, detail="Exercise was not found.")
    movement_id = db.scalar(
        select(WorkoutMovement.id)
        .join(TrainingWorkout, WorkoutMovement.workout_id == TrainingWorkout.id)
        .join(
            movement_machine_photos,
            movement_machine_photos.c.movement_id == WorkoutMovement.id,
        )
        .where(WorkoutMovement.exercise_id == exercise_id, TrainingWorkout.user_id == user.id)
        .order_by(TrainingWorkout.workout_date.desc(), TrainingWorkout.created_at.desc())
        .limit(1)
    )
    if not movement_id:
        return []
    return list(
        db.scalars(
            select(MachinePhoto)
            .join(
                movement_machine_photos,
                movement_machine_photos.c.machine_photo_id == MachinePhoto.id,
            )
            .where(
                movement_machine_photos.c.movement_id == movement_id,
                MachinePhoto.user_id == user.id,
            )
            .order_by(MachinePhoto.created_at)
        )
    )


@router.post(
    "/exercises/{exercise_id}/machine-photos",
    response_model=MachinePhotoRead,
    status_code=201,
)
async def upload_machine_photo(
    exercise_id: str,
    db: DbSession,
    user: CurrentUser,
    settings: SettingsDependency,
    file: Annotated[UploadFile, File(...)],
    caption: Annotated[str, Form(min_length=1, max_length=160)],
) -> MachinePhoto:
    if not get_owned(db, Exercise, exercise_id, user.id):
        raise HTTPException(status_code=404, detail="Exercise was not found.")
    cleaned_caption = caption.strip()
    if not cleaned_caption:
        raise HTTPException(status_code=422, detail="Enter a machine name.")
    limits = load_account_limits(db, settings)
    check_account_total(
        db, user, MachinePhoto, limits.photos_per_account, "photos_per_account", PHOTO_NOT_UPLOADED
    )
    try:
        stored = await store_machine_photo(
            upload=file,
            settings=settings,
            max_bytes=limits.photo_upload_megabytes * 1024 * 1024,
        )
    except PhotoValidationError as error:
        raise api_error(error.status_code, error.code, error.message) from error

    photo = MachinePhoto(
        user_id=user.id,
        exercise_id=exercise_id,
        caption=cleaned_caption,
        original_filename=stored.original_filename,
        full_filename=stored.full_filename,
        thumbnail_filename=stored.thumbnail_filename,
        media_type="image/webp",
        file_size=stored.file_size,
        width=stored.width,
        height=stored.height,
    )
    try:
        db.add(photo)
        db.commit()
        db.refresh(photo)
        return photo
    except Exception:
        db.rollback()
        delete_machine_photo_files(settings, stored.full_filename, stored.thumbnail_filename)
        raise


@router.patch("/machine-photos/{photo_id}", response_model=MachinePhotoRead)
def update_machine_photo_caption(
    photo_id: str, payload: MachinePhotoCaptionUpdate, db: DbSession, user: CurrentUser
) -> MachinePhoto:
    photo = get_owned(db, MachinePhoto, photo_id, user.id)
    if not photo:
        raise HTTPException(status_code=404, detail="Machine photo was not found.")
    photo.caption = payload.caption
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(photo)
    return photo


@router.get("/machine-photos/{photo_id}/image")
def get_machine_photo_image(
    photo_id: str,
    db: DbSession,
    user: CurrentUser,
    settings: SettingsDependency,
    variant: str = Query(default="full", pattern="^(thumbnail|full)$"),
) -> FileResponse:
    photo = get_owned(db, MachinePhoto, photo_id, user.id)
    if not photo:
        raise HTTPException(status_code=404, detail="Machine photo was not found.")
    filename = photo.thumbnail_filename if variant == "thumbnail" else photo.full_filename
    root = settings.machine_photos_dir.resolve()
    path = (root / filename).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Machine photo file was not found.")
    return FileResponse(
        path,
        media_type=photo.media_type,
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.delete("/machine-photos/{photo_id}", status_code=204)
def delete_machine_photo(
    photo_id: str, db: DbSession, user: CurrentUser, settings: SettingsDependency
) -> None:
    photo = get_owned(db, MachinePhoto, photo_id, user.id)
    if not photo:
        raise HTTPException(status_code=404, detail="Machine photo was not found.")
    reference = db.scalar(
        select(movement_machine_photos.c.movement_id)
        .where(movement_machine_photos.c.machine_photo_id == photo_id)
        .limit(1)
    )
    if reference:
        raise HTTPException(
            status_code=409,
            detail="Remove this photo from its workouts before deleting it.",
        )
    full_filename = photo.full_filename
    thumbnail_filename = photo.thumbnail_filename
    db.delete(photo)
    db.commit()
    delete_machine_photo_files(settings, full_filename, thumbnail_filename)


def training_preferences(db: Session, user_id: str) -> TrainingPreferencesRead:
    unit = preferred_weight_unit(db, user_id)
    week_start_value = get_setting(db, user_id, "week_start", "monday")
    if week_start_value not in {"monday", "sunday", "saturday"}:
        week_start_value = "monday"
    try:
        zone2_goal = max(1, int(get_setting(db, user_id, "zone2_goal_minutes", "150")))
    except ValueError:
        zone2_goal = 150
    try:
        muscle_set_goal = int(get_setting(db, user_id, "weekly_muscle_set_goal", "10"))
        if not 1 <= muscle_set_goal <= 1000:
            muscle_set_goal = 10
    except ValueError:
        muscle_set_goal = 10
    return TrainingPreferencesRead(
        preferred_weight_unit=unit,
        week_start=week_start_value,
        zone2_goal_minutes=zone2_goal,
        weekly_muscle_set_goal=muscle_set_goal,
    )


def zone2_week(
    sessions: list[CardioSession],
    week: date,
    goal: int,
) -> Zone2WeekRead:
    end = week + timedelta(days=6)
    session_minutes = sum(
        item.duration_minutes
        for item in sessions
        if item.qualifies_zone2 and week <= item.session_date <= min(end, date.today())
    )
    completed = session_minutes
    return Zone2WeekRead(
        week_start=week,
        week_end=end,
        goal_minutes=goal,
        completed_minutes=completed,
        remaining_minutes=max(0, goal - completed),
        percentage=round(min(completed / goal * 100, 100), 1),
        complete=completed >= goal,
    )


@router.get("/training-preferences", response_model=TrainingPreferencesRead)
def get_training_preferences(db: DbSession, user: CurrentUser) -> TrainingPreferencesRead:
    return training_preferences(db, user.id)


@router.get("/workout-type-colors", response_model=WorkoutTypeColors)
def get_workout_type_colors(db: DbSession, user: CurrentUser) -> WorkoutTypeColors:
    stored = get_setting(db, user.id, WORKOUT_TYPE_COLORS_KEY, "")
    if stored:
        try:
            return WorkoutTypeColors.model_validate_json(stored)
        except ValueError:
            pass
    return DEFAULT_WORKOUT_TYPE_COLORS


@router.put("/workout-type-colors", response_model=WorkoutTypeColors)
def update_workout_type_colors(
    payload: WorkoutTypeColors, db: DbSession, user: CurrentUser
) -> WorkoutTypeColors:
    set_setting(db, user.id, WORKOUT_TYPE_COLORS_KEY, payload.model_dump_json())
    bump_workout_cache_revision(db, user.id)
    db.commit()
    return payload


@router.get("/workout-types", response_model=list[WorkoutTypeRead])
def list_workout_types(db: DbSession, user: CurrentUser) -> list[WorkoutTypeRead]:
    return workout_type_catalog(db, user.id)


@router.post("/workout-types", response_model=WorkoutTypeRead, status_code=201)
def create_workout_type(
    payload: WorkoutTypeCreate, db: DbSession, user: CurrentUser
) -> WorkoutType:
    ensure_unique_name(db, user.id, payload.name)
    count = db.scalar(select(func.count(WorkoutType.id)).where(WorkoutType.user_id == user.id)) or 0
    if count >= MAX_CUSTOM_TYPES:
        raise HTTPException(422, f"You can save up to {MAX_CUSTOM_TYPES} custom workout types.")
    item = WorkoutType(user_id=user.id, name=payload.name, color=payload.color)
    db.add(item)
    bump_workout_cache_revision(db, user.id)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "A workout type with this name already exists.") from error
    return item


def edit_workout_type(
    type_id: str, payload: WorkoutTypeUpdate, db: Session, user_id: str
) -> WorkoutTypeRead:
    if type_id in DEFAULT_NAMES:
        if payload.name is not None and payload.name != DEFAULT_NAMES[type_id]:
            raise HTTPException(422, "Built-in workout type names cannot be changed.")
        if payload.color is not None:
            colors = type_colors(db, user_id)
            updated = WorkoutTypeColors.model_validate(
                {**colors.model_dump(), type_id: payload.color}
            )
            set_setting(db, user_id, WORKOUT_TYPE_COLORS_KEY, updated.model_dump_json())
        if payload.archived is not None:
            archived = archived_builtins(db, user_id)
            if payload.archived:
                archived.add(type_id)
            else:
                archived.discard(type_id)
            set_setting(db, user_id, ARCHIVED_KEY, json.dumps(sorted(archived)))
    else:
        item = get_owned(db, WorkoutType, type_id, user_id)
        if item is None:
            raise HTTPException(404, "Workout type was not found.")
        if payload.name is not None:
            ensure_unique_name(db, user_id, payload.name, excluding=type_id)
            item.name = payload.name
        if payload.color is not None:
            item.color = payload.color
        if payload.archived is not None:
            item.archived = payload.archived
    bump_workout_cache_revision(db, user_id)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "A workout type with this name already exists.") from error
    return next(item for item in workout_type_catalog(db, user_id) if item.id == type_id)


@router.patch("/workout-types/{type_id}", response_model=WorkoutTypeRead)
def update_workout_type(
    type_id: str, payload: WorkoutTypeUpdate, db: DbSession, user: CurrentUser
) -> WorkoutTypeRead:
    return edit_workout_type(type_id, payload, db, user.id)


@router.delete("/workout-types/{type_id}", status_code=204)
def remove_workout_type(type_id: str, db: DbSession, user: CurrentUser) -> None:
    edit_workout_type(type_id, WorkoutTypeUpdate(archived=True), db, user.id)


@router.put("/training-preferences", response_model=TrainingPreferencesRead)
def update_training_preferences(
    payload: TrainingPreferencesUpdate, db: DbSession, user: CurrentUser
) -> TrainingPreferencesRead:
    set_setting(db, user.id, "preferred_weight_unit", payload.preferred_weight_unit)
    set_setting(db, user.id, "week_start", payload.week_start)
    set_setting(db, user.id, "zone2_goal_minutes", str(payload.zone2_goal_minutes))
    if payload.weekly_muscle_set_goal is not None:
        set_setting(db, user.id, "weekly_muscle_set_goal", str(payload.weekly_muscle_set_goal))
    db.flush()
    rebuild_personal_records(db, user.id)
    db.commit()
    return training_preferences(db, user.id)


@router.get("/cardio", response_model=CardioOverviewRead)
def cardio_overview(db: DbSession, user: CurrentUser) -> CardioOverviewRead:
    preferences = training_preferences(db, user.id)
    sessions = list(
        db.scalars(
            select(CardioSession)
            .where(CardioSession.user_id == user.id)
            .options(
                selectinload(CardioSession.source_workout)
                .selectinload(TrainingWorkout.movements)
                .selectinload(WorkoutMovement.exercise)
            )
            .order_by(CardioSession.session_date.desc())
        )
    )
    current_start = start_of_week(date.today(), preferences.week_start)
    return CardioOverviewRead(
        preferences=preferences,
        current_week=zone2_week(sessions, current_start, preferences.zone2_goal_minutes),
        previous_weeks=[
            zone2_week(
                sessions,
                current_start - timedelta(days=7 * offset),
                preferences.zone2_goal_minutes,
            )
            for offset in range(1, 9)
        ],
        sessions=sessions,
        energy_periods=cardio_energy_periods(sessions, date.today(), preferences.week_start),
    )


@router.post("/cardio/scan", response_model=CardioScreenshotRead)
async def scan_cardio_workout_screenshot(
    file: Annotated[UploadFile, File(...)],
) -> CardioScreenshotRead:
    try:
        parsed = await scan_cardio_screenshot(file)
    except CardioScreenshotError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
    return CardioScreenshotRead(**parsed)


@router.post("/cardio", response_model=CardioSessionRead, status_code=201)
def create_cardio_session(
    payload: CardioSessionCreate, db: DbSession, user: CurrentUser, settings: SettingsDependency
) -> CardioSession:
    limits = load_account_limits(db, settings)
    check_account_total(
        db,
        user,
        CardioSession,
        limits.cardio_sessions_per_account,
        "cardio_sessions_per_account",
        CARDIO_NOT_SAVED,
    )
    if payload.exercise_id:
        check_account_total(
            db,
            user,
            TrainingWorkout,
            limits.workouts_per_account,
            "workouts_per_account",
            CARDIO_NOT_SAVED,
        )
        exercise = get_owned(db, Exercise, payload.exercise_id, user.id)
        if not exercise or exercise.kind != ExerciseKind.CARDIO:
            raise HTTPException(status_code=422, detail="Choose a cardio exercise.")

        workout = TrainingWorkout(
            user_id=user.id,
            name=f"{exercise.name} cardio",
            workout_date=payload.session_date,
            category=WorkoutCategory.CARDIO,
            notes=None,
            duration_minutes=payload.duration_minutes,
            start_time=None,
            end_time=None,
        )
        movement = WorkoutMovement(exercise=exercise, order_index=0, notes=payload.notes)
        movement.sets.append(
            WorkoutSet(
                order_index=0,
                duration_seconds=payload.duration_minutes * 60,
                distance_km=payload.distance_km,
                calories_kcal=payload.calories_kcal,
                average_heart_rate_bpm=payload.average_heart_rate_bpm,
                speed_kph=payload.average_speed_kph,
                incline_percent=payload.incline_percent,
                completed=True,
            )
        )
        workout.movements.append(movement)
        db.add(workout)
        db.flush()
        session = CardioSession(
            user_id=user.id,
            session_date=payload.session_date,
            activity_type=exercise.name,
            duration_minutes=payload.duration_minutes,
            calories_kcal=payload.calories_kcal,
            average_heart_rate_bpm=payload.average_heart_rate_bpm,
            distance_km=payload.distance_km,
            average_speed_kph=payload.average_speed_kph,
            incline_percent=payload.incline_percent,
            average_power_watts=payload.average_power_watts,
            average_mets=payload.average_mets,
            source_exercise_id=exercise.id,
            intensity=None,
            zone=payload.zone,
            qualifies_zone2=payload.zone == "Zone 2",
            notes=payload.notes,
            source_workout_id=workout.id,
            source_movement_index=0,
        )
        db.add(session)
        rebuild_personal_records(db, user.id)
        bump_workout_cache_revision(db, user.id)
        db.commit()
        db.refresh(session)
        return session

    session = CardioSession(user_id=user.id, **payload.model_dump(exclude={"exercise_id"}))
    db.add(session)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(session)
    return session


@router.put("/cardio/{session_id}", response_model=CardioSessionRead)
def update_cardio_session(
    session_id: str, payload: CardioSessionCreate, db: DbSession, user: CurrentUser
) -> CardioSession:
    session = get_owned(db, CardioSession, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Cardio session was not found.")
    if session.source_workout_id:
        raise HTTPException(status_code=409, detail="Edit imported cardio in its workout.")
    optional_metrics = {
        "calories_kcal",
        "average_heart_rate_bpm",
        "distance_km",
        "average_speed_kph",
        "incline_percent",
        "average_power_watts",
        "average_mets",
    }
    for key, value in payload.model_dump(exclude={"exercise_id"}).items():
        if key in optional_metrics and key not in payload.model_fields_set:
            continue
        setattr(session, key, value)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/cardio/{session_id}/calories", response_model=CardioSessionRead)
def update_cardio_calories(
    session_id: str, payload: CardioCaloriesUpdate, db: DbSession, user: CurrentUser
) -> CardioSession:
    session = get_owned(db, CardioSession, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Cardio session was not found.")
    session.calories_kcal = payload.calories_kcal
    if sync_cardio_session_metrics_to_workout_sets(db, session, {"calories_kcal"}):
        rebuild_personal_records(db, user.id)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(session)
    return session


def sync_cardio_session_metrics_to_workout_sets(
    db: Session, session: CardioSession, fields: set[str]
) -> bool:
    workout_set_fields = {
        "calories_kcal",
        "average_heart_rate_bpm",
        "distance_km",
        "average_speed_kph",
        "incline_percent",
    }
    if not workout_set_fields.intersection(fields):
        return False
    if not session.source_workout_id:
        return False
    workout = load_workout(db, session.user_id, session.source_workout_id)
    movement = next(
        (item for item in workout.movements if item.order_index == session.source_movement_index),
        None,
    )
    if not movement:
        return False
    completed_sets = [item for item in movement.sets if item.completed]
    if not completed_sets:
        return False
    if "calories_kcal" in fields:
        total_duration = sum(item.duration_seconds or 0 for item in completed_sets)
        distributed_calories = 0
        for index, workout_set in enumerate(completed_sets):
            if session.calories_kcal is None:
                workout_set.calories_kcal = None
            elif index == len(completed_sets) - 1:
                workout_set.calories_kcal = session.calories_kcal - distributed_calories
            else:
                share = (
                    (workout_set.duration_seconds or 0) / total_duration
                    if total_duration
                    else 1 / len(completed_sets)
                )
                workout_set.calories_kcal = round(session.calories_kcal * share)
                distributed_calories += workout_set.calories_kcal
    if "average_heart_rate_bpm" in fields:
        for workout_set in completed_sets:
            workout_set.average_heart_rate_bpm = session.average_heart_rate_bpm
    if "distance_km" in fields:
        total_duration = sum(item.duration_seconds or 0 for item in completed_sets)
        distributed_distance = 0.0
        for index, workout_set in enumerate(completed_sets):
            if session.distance_km is None:
                workout_set.distance_km = None
            elif index == len(completed_sets) - 1:
                workout_set.distance_km = round(session.distance_km - distributed_distance, 3)
            else:
                share = (
                    (workout_set.duration_seconds or 0) / total_duration
                    if total_duration
                    else 1 / len(completed_sets)
                )
                workout_set.distance_km = round(session.distance_km * share, 3)
                distributed_distance += workout_set.distance_km
    if "average_speed_kph" in fields:
        for workout_set in completed_sets:
            workout_set.speed_kph = session.average_speed_kph
    if "incline_percent" in fields:
        for workout_set in completed_sets:
            workout_set.incline_percent = session.incline_percent
    return True


@router.patch("/cardio/{session_id}/metrics", response_model=CardioSessionRead)
def update_cardio_metrics(
    session_id: str, payload: CardioMetricsUpdate, db: DbSession, user: CurrentUser
) -> CardioSession:
    session = get_owned(db, CardioSession, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Cardio session was not found.")
    for key in payload.model_fields_set:
        setattr(session, key, getattr(payload, key))
    if sync_cardio_session_metrics_to_workout_sets(db, session, payload.model_fields_set):
        rebuild_personal_records(db, user.id)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/cardio/{session_id}", status_code=204)
def delete_cardio_session(session_id: str, db: DbSession, user: CurrentUser) -> None:
    session = get_owned(db, CardioSession, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Cardio session was not found.")
    if session.source_workout_id:
        raise HTTPException(status_code=409, detail="Delete imported cardio from its workout.")
    db.delete(session)
    bump_workout_cache_revision(db, user.id)
    db.commit()


@router.get("/body-weight-goals", response_model=list[BodyWeightGoalRead])
def list_body_weight_goals(db: DbSession, user: CurrentUser) -> list[BodyWeightGoal]:
    return list(
        db.scalars(
            select(BodyWeightGoal)
            .where(BodyWeightGoal.user_id == user.id)
            .order_by(BodyWeightGoal.created_at.desc())
        )
    )


@router.post("/body-weight-goals", response_model=BodyWeightGoalRead, status_code=201)
def create_body_weight_goal(
    payload: BodyWeightGoalCreate, db: DbSession, user: CurrentUser
) -> BodyWeightGoal:
    if payload.active:
        for existing_goal in db.scalars(
            select(BodyWeightGoal).where(
                BodyWeightGoal.user_id == user.id, BodyWeightGoal.active.is_(True)
            )
        ):
            existing_goal.active = False
    goal = BodyWeightGoal(user_id=user.id, **payload.model_dump())
    db.add(goal)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/body-weight-goals/{goal_id}", response_model=BodyWeightGoalRead)
def update_body_weight_goal(
    goal_id: str, payload: BodyWeightGoalCreate, db: DbSession, user: CurrentUser
) -> BodyWeightGoal:
    goal = get_owned(db, BodyWeightGoal, goal_id, user.id)
    if not goal:
        raise HTTPException(status_code=404, detail="Body-weight goal was not found.")
    if payload.active:
        for other in db.scalars(
            select(BodyWeightGoal).where(
                BodyWeightGoal.user_id == user.id, BodyWeightGoal.active.is_(True)
            )
        ):
            if other.id != goal_id:
                other.active = False
    values = payload.model_dump()
    for key, value in values.items():
        setattr(goal, key, value)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/body-weight-goals/{goal_id}", status_code=204)
def delete_body_weight_goal(goal_id: str, db: DbSession, user: CurrentUser) -> None:
    goal = get_owned(db, BodyWeightGoal, goal_id, user.id)
    if not goal:
        raise HTTPException(status_code=404, detail="Body-weight goal was not found.")
    db.delete(goal)
    bump_workout_cache_revision(db, user.id)
    db.commit()


@router.get("/personal-records", response_model=list[PersonalRecordRead])
def list_personal_records(
    db: DbSession,
    user: CurrentUser,
    exercise_id: str | None = None,
    workout_id: str | None = None,
) -> list[PersonalRecord]:
    query = (
        select(PersonalRecord)
        .where(PersonalRecord.user_id == user.id)
        .options(selectinload(PersonalRecord.exercise), selectinload(PersonalRecord.workout_set))
    )
    if exercise_id:
        query = query.where(PersonalRecord.exercise_id == exercise_id)
    if workout_id:
        query = query.where(PersonalRecord.workout_id == workout_id)
    return list(
        db.scalars(
            query.order_by(PersonalRecord.achieved_date.desc(), PersonalRecord.created_at.desc())
        )
    )


@router.get("/muscle-volume", response_model=list[MuscleVolumeRead])
def weekly_muscle_volume(
    db: DbSession,
    user: CurrentUser,
    start: date | None = None,
    end: date | None = None,
) -> list[MuscleVolumeRead]:
    end_date = end or date.today()
    start_date = start or start_of_week(end_date, training_preferences(db, user.id).week_start)
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="Start date must not be after end date.")
    workouts = list(
        db.scalars(
            select(TrainingWorkout)
            .where(TrainingWorkout.user_id == user.id)
            .options(*workout_options())
        )
    )
    totals = muscle_volume(workouts, start_date, end_date)
    return [
        MuscleVolumeRead(muscle_name=name, set_total=value)
        for name, value in sorted(totals.items())
    ]


def workouts_between(
    db: Session, user_id: str, start: date | None = None, end: date | None = None
) -> list[TrainingWorkout]:
    """A user's workouts, newest first, optionally limited to an inclusive date window."""
    if start is not None and end is not None and start > end:
        raise HTTPException(status_code=422, detail="Start date must not be after end date.")
    query = (
        select(TrainingWorkout)
        .where(TrainingWorkout.user_id == user_id)
        .options(*workout_options())
        .order_by(TrainingWorkout.workout_date.desc(), TrainingWorkout.created_at.desc())
    )
    if start is not None:
        query = query.where(TrainingWorkout.workout_date >= start)
    if end is not None:
        query = query.where(TrainingWorkout.workout_date <= end)
    return list(db.scalars(query))


@router.get("/workouts", response_model=list[TrainingWorkoutRead])
def list_workouts(db: DbSession, user: CurrentUser) -> list[TrainingWorkout]:
    return workouts_between(db, user.id)


@router.get("/training-time", response_model=TrainingTimeRead)
def training_time(db: DbSession, user: CurrentUser) -> TrainingTimeRead:
    return training_time_totals(db, user.id)


@router.get("/workouts/revision", response_model=WorkoutCacheRevisionRead)
def get_workout_cache_revision(db: DbSession, user: CurrentUser) -> WorkoutCacheRevisionRead:
    return WorkoutCacheRevisionRead(revision=workout_cache_revision(db, user.id))


@router.get("/workouts/snapshot", response_model=WorkoutSnapshotRead)
def get_workout_snapshot(
    db: DbSession, user: CurrentUser, start: date | None = None, end: date | None = None
) -> WorkoutSnapshotRead:
    """Workouts with the cache revision; ``start``/``end`` load long histories in windows."""
    return WorkoutSnapshotRead(
        revision=workout_cache_revision(db, user.id),
        workouts=workouts_between(db, user.id, start, end),
    )


@router.get("/calendar", response_model=list[HeatmapDay])
def calendar_days(
    db: DbSession, user: CurrentUser, start: date, end: date | None = None
) -> list[HeatmapDay]:
    """Calendar days for a window older than the one the dashboard loaded."""
    workouts = workouts_between(db, user.id, start, end)
    return build_heatmap(
        workouts, body_measurements_by_date(db, user.id), workout_type_catalog(db, user.id)
    )


@router.get("/exercise-history-baselines", response_model=list[ExerciseHistoryBaselineRead])
def exercise_history_baselines(
    db: DbSession, user: CurrentUser, before: date
) -> list[ExerciseHistoryBaselineRead]:
    """Condense each exercise's history before ``before`` for clients holding recent workouts.

    Live PR badges need an exercise's heaviest eligible weight and best reps at every weight,
    and set suggestions need its latest completed sets, however long ago those were logged.
    """
    rows = db.execute(
        select(
            WorkoutMovement.id.label("movement_id"),
            WorkoutMovement.exercise_id,
            WorkoutMovement.notes.label("movement_notes"),
            TrainingWorkout.id.label("workout_id"),
            TrainingWorkout.workout_date,
            TrainingWorkout.name.label("workout_name"),
            Exercise.kind,
            WorkoutSet.weight_kg,
            WorkoutSet.reps,
            WorkoutSet.completed,
            WorkoutSet.warmup,
            WorkoutSet.set_type,
            WorkoutSet.failed,
            WorkoutSet.target_reps,
        )
        .select_from(WorkoutSet)
        .join(WorkoutMovement, WorkoutSet.movement_id == WorkoutMovement.id)
        .join(TrainingWorkout, WorkoutMovement.workout_id == TrainingWorkout.id)
        .join(Exercise, WorkoutMovement.exercise_id == Exercise.id)
        .where(TrainingWorkout.user_id == user.id, TrainingWorkout.workout_date < before)
        .order_by(
            TrainingWorkout.workout_date.desc(),
            TrainingWorkout.created_at.desc(),
            WorkoutMovement.order_index,
        )
    )
    reps_by_weight: dict[str, dict[float, int]] = {}
    latest: dict[str, ExerciseLatestSessionRead] = {}
    latest_movement_ids: dict[str, str] = {}
    for row in rows:
        weights = reps_by_weight.setdefault(row.exercise_id, {})
        if row.completed and row.exercise_id not in latest:
            latest[row.exercise_id] = ExerciseLatestSessionRead(
                workout_id=row.workout_id,
                workout_date=row.workout_date,
                workout_name=row.workout_name,
                movement_notes=row.movement_notes,
                sets=[],
            )
            latest_movement_ids[row.movement_id] = row.exercise_id
        # Mirrors the client's PR-eligibility check for strength sets.
        if (
            row.kind != ExerciseKind.STRENGTH
            or not is_pr_eligible(row)
            or row.weight_kg is None
            or row.weight_kg < 0
            or not row.reps
        ):
            continue
        # Four decimals absorb unit-conversion noise, as in the client's comparison.
        weight = round(row.weight_kg, 4)
        weights[weight] = max(weights.get(weight, 0), row.reps)

    if latest_movement_ids:
        for item in db.scalars(
            select(WorkoutSet)
            .where(
                WorkoutSet.movement_id.in_(latest_movement_ids),
                WorkoutSet.completed.is_(True),
            )
            .order_by(WorkoutSet.order_index)
        ):
            latest[latest_movement_ids[item.movement_id]].sets.append(
                WorkoutSetRead.model_validate(item)
            )

    return [
        ExerciseHistoryBaselineRead(
            exercise_id=exercise_id,
            best_weight_kg=max(weights) if weights else None,
            reps_by_weight=[
                WeightRepsRead(weight_kg=weight, reps=reps)
                for weight, reps in sorted(weights.items())
            ],
            latest=latest.get(exercise_id),
        )
        for exercise_id, weights in reps_by_weight.items()
    ]


@router.post("/workouts", response_model=TrainingWorkoutRead, status_code=201)
def create_workout(
    payload: TrainingWorkoutCreate, db: DbSession, user: CurrentUser, settings: SettingsDependency
) -> TrainingWorkout:
    limits = load_account_limits(db, settings)
    check_workout_size(payload, limits, user)
    check_account_total(
        db,
        user,
        TrainingWorkout,
        limits.workouts_per_account,
        "workouts_per_account",
        WORKOUT_NOT_SAVED,
    )
    workout = TrainingWorkout(
        user_id=user.id,
        name=payload.name,
        workout_date=payload.workout_date,
        category=payload.category,
        notes=payload.notes,
        duration_minutes=payload.duration_minutes,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(workout)
    replace_workout_contents(db, user.id, workout, payload)
    db.flush()
    sync_workout_cardio_sessions(db, workout)
    rebuild_personal_records(db, user.id)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    backfill_completed_video_links(db, workout.workout_date, user_id=user.id)
    return load_workout(db, user.id, workout.id)


@router.get("/workouts/export.csv")
def export_workout_csv(
    db: DbSession,
    user: CurrentUser,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Response:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="Start date must not be after end date.")
    statement = (
        select(TrainingWorkout)
        .where(TrainingWorkout.user_id == user.id)
        .options(*workout_options())
        .order_by(TrainingWorkout.workout_date, TrainingWorkout.created_at)
    )
    if start_date:
        statement = statement.where(TrainingWorkout.workout_date >= start_date)
    if end_date:
        statement = statement.where(TrainingWorkout.workout_date <= end_date)
    workouts = list(db.scalars(statement))
    content = export_workouts(workouts)
    filename = f"gym-workouts-{date.today().isoformat()}.csv"
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def read_workout_csv(file: UploadFile) -> bytes:
    if file.content_type not in {
        None,
        "text/csv",
        "text/tab-separated-values",
        "text/plain",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }:
        raise HTTPException(status_code=415, detail="Choose a CSV or tab-separated text file.")
    raw = await file.read(20 * 1024 * 1024 + 1)
    await file.close()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV imports are limited to 20 MB.")
    return raw


def check_import_plan(db: Session, user: User, limits: AccountLimits, plan: ImportPlan) -> None:
    additions = [session for session in plan.sessions if not session.duplicate]
    if additions and not user.is_admin:
        count = db.scalar(
            select(func.count(TrainingWorkout.id)).where(TrainingWorkout.user_id == user.id)
        )
        if count + len(additions) > limits.workouts_per_account:
            raise refuse(user, "workouts_per_account", IMPORT_NOT_SAVED)
    if plan.new_exercises and not user.is_admin:
        count = db.scalar(
            select(func.count(Exercise.id)).where(
                Exercise.user_id == user.id, Exercise.is_custom.is_(True)
            )
        )
        if count + len(plan.new_exercises) > limits.custom_exercises_per_account:
            raise refuse(user, "custom_exercises_per_account", IMPORT_NOT_SAVED)
    for session in additions:
        exercises = {canonical_exercise_name(row.exercise_name).casefold() for row in session.rows}
        if len(exercises) > limits.exercises_per_workout:
            raise refuse(user, "exercises_per_workout", IMPORT_NOT_SAVED)
        if len(session.rows) > limits.sets_per_workout:
            raise refuse(user, "sets_per_workout", IMPORT_NOT_SAVED)


@router.post("/workouts/import/preview", response_model=CsvImportPreviewRead)
async def preview_workout_csv(
    db: DbSession,
    user: CurrentUser,
    settings: SettingsDependency,
    file: Annotated[UploadFile, File(...)],
    source: Annotated[Literal["gym", "strengthlevel", "hevy", "strong"], Form()] = "gym",
    weight_unit: Annotated[Literal["kg", "lb"], Form()] = "kg",
    distance_unit: Annotated[Literal["km", "mi"], Form()] = "km",
) -> CsvImportPreviewRead:
    raw = await read_workout_csv(file)
    try:
        plan = plan_import(
            db, user.id, raw, source=source, weight_unit=weight_unit, distance_unit=distance_unit
        )
    except CsvImportError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    check_import_plan(db, user, load_account_limits(db, settings), plan)
    return CsvImportPreviewRead(
        sessions=[
            CsvImportSessionRead(
                workout_date=session.workout_date,
                name=session.name,
                exercises=list(
                    dict.fromkeys(
                        canonical_exercise_name(row.exercise_name) for row in session.rows
                    )
                ),
                sets=len(session.rows),
                duplicate=session.duplicate,
            )
            for session in plan.sessions
        ],
        workouts_to_create=sum(not session.duplicate for session in plan.sessions),
        workouts_to_skip=sum(session.duplicate for session in plan.sessions),
        sets_to_import=sum(len(session.rows) for session in plan.sessions if not session.duplicate),
        new_exercises=plan.new_exercises,
        warnings=plan.warnings,
        body_measurements_to_create=plan.body_measurements_to_create,
        body_measurements_to_skip=plan.body_measurements_to_skip,
    )


@router.post("/workouts/import", response_model=CsvImportRead, status_code=201)
async def import_workout_csv(
    db: DbSession,
    user: CurrentUser,
    settings: SettingsDependency,
    file: Annotated[UploadFile, File(...)],
    source: Annotated[Literal["gym", "strengthlevel", "hevy", "strong"], Form()] = "gym",
    weight_unit: Annotated[Literal["kg", "lb"], Form()] = "kg",
    distance_unit: Annotated[Literal["km", "mi"], Form()] = "km",
) -> CsvImportRead:
    raw = await read_workout_csv(file)
    try:
        # Serialize comparison and writes, including two imports that finish together.
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        plan = plan_import(
            db, user.id, raw, source=source, weight_unit=weight_unit, distance_unit=distance_unit
        )
        check_import_plan(db, user, load_account_limits(db, settings), plan)
        summary = import_workouts(
            db, user.id, raw, plan=plan, on_workout=sync_workout_cardio_sessions
        )
        if summary.workouts_created:
            rebuild_personal_records(db, user.id)
            bump_workout_cache_revision(db, user.id)
        db.commit()
    except CsvImportError as error:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception:
        db.rollback()
        raise
    return CsvImportRead(**summary.__dict__)


@router.get("/workouts/{workout_id}", response_model=TrainingWorkoutRead)
def get_workout(workout_id: str, db: DbSession, user: CurrentUser) -> TrainingWorkout:
    return load_workout(db, user.id, workout_id)


@router.put("/workouts/{workout_id}", response_model=TrainingWorkoutRead)
def update_workout(
    workout_id: str,
    payload: TrainingWorkoutCreate,
    db: DbSession,
    user: CurrentUser,
    settings: SettingsDependency,
) -> TrainingWorkout:
    workout = load_workout(db, user.id, workout_id)
    check_workout_size(payload, load_account_limits(db, settings), user, existing=workout)
    replace_workout_contents(db, user.id, workout, payload)
    db.flush()
    sync_workout_cardio_sessions(db, workout)
    rebuild_personal_records(db, user.id)
    bump_workout_cache_revision(db, user.id)
    db.commit()
    backfill_completed_video_links(db, workout.workout_date, user_id=user.id)
    return load_workout(db, user.id, workout.id)


@router.delete("/workouts/{workout_id}", status_code=204)
def delete_workout(workout_id: str, db: DbSession, user: CurrentUser) -> None:
    workout = load_workout(db, user.id, workout_id)
    db.execute(delete(CardioSession).where(CardioSession.source_workout_id == workout.id))
    db.delete(workout)
    db.flush()
    rebuild_personal_records(db, user.id)
    bump_workout_cache_revision(db, user.id)
    db.commit()


@router.delete("/sample-data", status_code=204)
def delete_sample_data(db: DbSession, user: CurrentUser) -> None:
    samples = list(
        db.scalars(
            select(TrainingWorkout).where(
                TrainingWorkout.user_id == user.id, TrainingWorkout.is_sample.is_(True)
            )
        )
    )
    for workout in samples:
        db.delete(workout)
    for measurement in db.scalars(
        select(BodyMeasurement).where(
            BodyMeasurement.user_id == user.id, BodyMeasurement.is_sample.is_(True)
        )
    ):
        db.delete(measurement)
    db.flush()
    rebuild_personal_records(db, user.id)
    bump_workout_cache_revision(db, user.id)
    db.commit()


def completed_working_sets(workout: TrainingWorkout) -> list[WorkoutSet]:
    return [
        item for movement in workout.movements for item in movement.sets if is_working_set(item)
    ]


def display_categories(items: list[TrainingWorkout]) -> list[WorkoutCategory]:
    """Collapse a day to one strength colour plus cardio when both occurred."""
    has_cardio = False
    strength_categories: list[WorkoutCategory] = []
    for workout in items:
        movement_categories = {movement.exercise.category for movement in workout.movements}
        has_cardio = has_cardio or WorkoutCategory.CARDIO in movement_categories
        non_cardio = movement_categories - {WorkoutCategory.CARDIO}
        if non_cardio:
            category = workout.category
            if category == WorkoutCategory.CARDIO:
                category = (
                    next(iter(non_cardio)) if len(non_cardio) == 1 else WorkoutCategory.FULL_BODY
                )
            strength_categories.append(category)
        elif workout.category == WorkoutCategory.CARDIO:
            has_cardio = True
        else:
            strength_categories.append(workout.category)
    unique_strength = list(dict.fromkeys(strength_categories))
    if len(unique_strength) > 1:
        unique_strength = [WorkoutCategory.FULL_BODY]
    return [*unique_strength, *([WorkoutCategory.CARDIO] if has_cardio else [])]


def body_measurements_by_date(db: Session, user_id: str) -> list[BodyMeasurement]:
    return list(
        db.scalars(
            select(BodyMeasurement)
            .where(BodyMeasurement.user_id == user_id)
            .order_by(BodyMeasurement.measurement_date)
        )
    )


def build_heatmap(
    workouts: list[TrainingWorkout],
    measurements: list[BodyMeasurement],
    catalog: list[WorkoutTypeRead] | None = None,
) -> list[HeatmapDay]:
    """Calendar days for ``workouts``; ``measurements`` must be sorted by date."""
    measurement_dates = [item.measurement_date for item in measurements]
    builtin_types = {
        item.id: item
        for item in (
            catalog
            or [
                WorkoutTypeRead(
                    id=key,
                    name=name,
                    color=getattr(DEFAULT_WORKOUT_TYPE_COLORS, key),
                    is_custom=False,
                    archived=False,
                )
                for key, name in DEFAULT_NAMES.items()
            ]
        )
        if not item.is_custom
    }

    def display_types(items: list[TrainingWorkout]) -> list[WorkoutTypeRead]:
        distinct: dict[str, WorkoutTypeRead] = {}
        for item in items:
            if item.workout_type is not None:
                custom = WorkoutTypeRead.model_validate(item.workout_type)
                distinct[custom.id] = custom
                if any(
                    movement.exercise.kind == ExerciseKind.CARDIO for movement in item.movements
                ):
                    distinct["cardio"] = builtin_types["cardio"]
            else:
                for category in display_categories([item]):
                    distinct[category.value] = builtin_types[category.value]
        return list(distinct.values())

    def bodyweight_on(workout_date: date) -> float | None:
        # Bisect rather than scan: years of daily check-ins made a scan per exercise quadratic.
        index = bisect_right(measurement_dates, workout_date)
        return measurements[index - 1].weight_kg if index else None

    day_groups: dict[date, list[TrainingWorkout]] = defaultdict(list)
    for workout in workouts:
        day_groups[workout.workout_date].append(workout)
    return [
        HeatmapDay(
            workout_date=workout_date,
            categories=display_categories(items),
            workout_types=display_types(items),
            workout_count=len(items),
            set_count=sum(len(completed_working_sets(item)) for item in items),
            workouts=[
                CalendarWorkoutRead(
                    id=item.id,
                    name=item.name,
                    category=item.category,
                    workout_type_id=item.workout_type_id,
                    workout_type=(
                        WorkoutTypeRead.model_validate(item.workout_type)
                        if item.workout_type is not None
                        else None
                    ),
                    duration_minutes=item.duration_minutes,
                    exercises=[
                        CalendarExerciseRead(
                            exercise_name=movement.exercise.name,
                            set_count=len(
                                [set_item for set_item in movement.sets if is_working_set(set_item)]
                            ),
                            bodyweight_kg=bodyweight_on(item.workout_date)
                            or next(
                                (
                                    set_item.bodyweight_kg
                                    for set_item in movement.sets
                                    if is_working_set(set_item)
                                    and set_item.bodyweight_kg is not None
                                ),
                                None,
                            ),
                        )
                        for movement in item.movements
                        if any(is_working_set(set_item) for set_item in movement.sets)
                    ],
                )
                for item in items
            ],
        )
        for workout_date, items in sorted(day_groups.items())
    ]


def workout_history_summary(db: Session, user_id: str) -> WorkoutHistorySummaryRead:
    total, first, last = db.execute(
        select(
            func.count(TrainingWorkout.id),
            func.min(TrainingWorkout.workout_date),
            func.max(TrainingWorkout.workout_date),
        ).where(TrainingWorkout.user_id == user_id)
    ).one()
    sample_id = db.scalar(
        select(TrainingWorkout.id)
        .where(TrainingWorkout.user_id == user_id, TrainingWorkout.is_sample.is_(True))
        .limit(1)
    )
    return WorkoutHistorySummaryRead(
        total_workouts=total,
        first_workout_date=first,
        last_workout_date=last,
        has_sample_workouts=sample_id is not None,
    )


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(
    db: DbSession, user: CurrentUser, calendar_start: date | None = None
) -> DashboardRead:
    """Today's summary. ``calendar_start`` limits the calendar to recent days so long histories
    open quickly; ``/calendar`` serves older days. Without it, every day is included."""
    today = date.today()
    preferences = training_preferences(db, user.id)
    week_start = start_of_week(today, preferences.week_start)
    # Weekly figures look back at most four weeks, so a calendar window never truncates them.
    window_start = (
        min(calendar_start, week_start, today - timedelta(days=27)) if calendar_start else None
    )
    workouts = workouts_between(db, user.id, window_start)
    this_week = [workout for workout in workouts if week_start <= workout.workout_date <= today]
    measurements = body_measurements_by_date(db, user.id)

    volume_this_week = sum(
        (item.weight_kg or 0) * (item.reps or 0)
        for workout in this_week
        for item in completed_working_sets(workout)
    )
    heatmap = build_heatmap(
        [
            workout
            for workout in workouts
            if calendar_start is None or workout.workout_date >= calendar_start
        ],
        measurements,
        workout_type_catalog(db, user.id),
    )

    weekly_groups: dict[date, list[TrainingWorkout]] = defaultdict(list)
    for workout in this_week:
        weekly_groups[workout.workout_date].append(workout)
    weekly_days: list[WeeklyDayBreakdown] = []
    for workout_date, items in sorted(weekly_groups.items(), reverse=True):
        exercise_groups: dict[str, dict[str, object]] = {}
        for workout in items:
            for movement in workout.movements:
                sets = [item for item in movement.sets if is_working_set(item)]
                if not sets:
                    continue
                aggregate = exercise_groups.setdefault(
                    movement.exercise_id,
                    {
                        "exercise": movement.exercise,
                        "set_count": 0,
                        "volume_kg": 0.0,
                    },
                )
                aggregate["set_count"] = int(aggregate["set_count"]) + len(sets)
                aggregate["volume_kg"] = float(aggregate["volume_kg"]) + sum(
                    (item.weight_kg or 0) * (item.reps or 0) for item in sets
                )
        exercises = []
        for aggregate in exercise_groups.values():
            exercise = aggregate["exercise"]
            exercises.append(
                WeeklyExerciseBreakdown(
                    exercise_id=exercise.id,
                    exercise_name=exercise.name,
                    muscle_group=exercise.muscle_group,
                    category=exercise.category,
                    set_count=int(aggregate["set_count"]),
                    volume_kg=round(float(aggregate["volume_kg"]), 1),
                )
            )
        exercises.sort(
            key=lambda item: (item.muscle_group.casefold(), item.exercise_name.casefold())
        )
        day_sets = sum(len(completed_working_sets(item)) for item in items)
        weekly_days.append(
            WeeklyDayBreakdown(
                workout_date=workout_date,
                workout_count=len(items),
                total_sets=day_sets,
                volume_kg=round(
                    sum(
                        (item.weight_kg or 0) * (item.reps or 0)
                        for workout in items
                        for item in completed_working_sets(workout)
                    ),
                    1,
                ),
                workout_names=[item.name for item in items],
                categories=display_categories(items),
                exercises=exercises,
            )
        )

    # A streak can run back past the loaded window, so it reads every training date.
    workout_dates = list(
        db.scalars(
            select(TrainingWorkout.workout_date)
            .where(TrainingWorkout.user_id == user.id)
            .distinct()
            .order_by(TrainingWorkout.workout_date.desc())
        )
    )
    streak = 0
    if workout_dates and workout_dates[0] >= today - timedelta(days=1):
        cursor = workout_dates[0]
        for workout_date in workout_dates:
            if workout_date == cursor:
                streak += 1
                cursor -= timedelta(days=1)
            elif workout_date < cursor:
                break

    earlier_rotation = None
    if window_start is not None and not any(
        workout.category in TRAINING_ROTATION for workout in workouts
    ):
        earlier_rotation = db.scalar(
            select(TrainingWorkout.category)
            .where(
                TrainingWorkout.user_id == user.id,
                TrainingWorkout.workout_date < window_start,
                TrainingWorkout.category.in_(TRAINING_ROTATION),
            )
            .order_by(TrainingWorkout.workout_date.desc(), TrainingWorkout.created_at.desc())
            .limit(1)
        )
    cardio_sessions = list(
        db.scalars(select(CardioSession).where(CardioSession.user_id == user.id))
    )
    cardio_week_start = start_of_week(today, preferences.week_start)
    cardio_minutes_this_week = sum(
        session.duration_minutes
        for session in cardio_sessions
        if cardio_week_start <= session.session_date <= today
    )
    muscle_totals = muscle_volume(workouts, week_start, today)
    return DashboardRead(
        workouts_this_week=len(this_week),
        sets_this_week=sum(len(completed_working_sets(workout)) for workout in this_week),
        volume_this_week_kg=round(volume_this_week, 1),
        current_streak=streak,
        total_cardio_sessions=len(cardio_sessions),
        cardio_minutes_this_week=cardio_minutes_this_week,
        cardio_energy_periods=cardio_energy_periods(cardio_sessions, today, preferences.week_start),
        heatmap=heatmap,
        weekly_days=weekly_days,
        recommendation=workout_recommendation(workouts, today, earlier_rotation),
        weekly_sets=weekly_sets(workouts, today, preferences.week_start),
        muscle_volume=[
            MuscleVolumeRead(muscle_name=name, set_total=value)
            for name, value in sorted(muscle_totals.items())
        ],
        zone2=zone2_week(
            cardio_sessions,
            cardio_week_start,
            preferences.zone2_goal_minutes,
        ),
        recent_workouts=workouts[:5],
        history=workout_history_summary(db, user.id),
    )


@router.get("/progress", response_model=list[ExerciseLibrarySummaryRead])
def exercise_library_progress(db: DbSession, user: CurrentUser) -> list[ExerciseLibrarySummaryRead]:
    """Account-owned strength summaries, with a bounded eight-week sparkline payload."""
    today = date.today()
    rows = db.execute(
        select(
            WorkoutSet,
            WorkoutMovement.exercise_id,
            TrainingWorkout.workout_date,
            TrainingWorkout.id,
        )
        .join(WorkoutMovement, WorkoutSet.movement_id == WorkoutMovement.id)
        .join(TrainingWorkout, WorkoutMovement.workout_id == TrainingWorkout.id)
        .join(Exercise, WorkoutMovement.exercise_id == Exercise.id)
        .where(
            Exercise.user_id == user.id,
            TrainingWorkout.user_id == user.id,
            Exercise.kind == ExerciseKind.STRENGTH,
            TrainingWorkout.workout_date <= today,
        )
    )
    sessions: dict[str, dict[tuple[date, str], float]] = defaultdict(dict)
    for item, exercise_id, workout_date, workout_id in rows:
        if not is_working_set(item):
            continue
        key = (workout_date, workout_id)
        estimate = (
            estimated_one_rep_max(item.weight_kg or 0, item.reps or 0)
            if is_pr_eligible(item)
            else 0.0
        )
        sessions[exercise_id][key] = max(sessions[exercise_id].get(key, 0), estimate)
    summaries = []
    for exercise_id, values in sessions.items():
        points = sorted(values.items())
        last_date, _ = points[-1][0]
        latest = round(points[-1][1], 1) or None
        # Best per calendar day keeps repeated sessions from crowding the sparkline.
        daily: dict[date, float] = {}
        for (workout_date, _), value in points:
            if workout_date >= today - timedelta(days=56) and value > 0:
                daily[workout_date] = max(daily.get(workout_date, 0), round(value, 1))
        trend = [
            ExerciseTrendPointRead(date=day, estimated_1rm=value)
            for day, value in sorted(daily.items())
        ]
        change = (
            round(trend[-1].estimated_1rm - trend[0].estimated_1rm, 1) if len(trend) > 1 else None
        )
        summaries.append(
            ExerciseLibrarySummaryRead(
                exercise_id=exercise_id,
                session_count=len(points),
                last_date=last_date,
                latest_estimated_1rm=latest,
                change_kg=change,
                change_percent=round(change / trend[0].estimated_1rm * 100, 1)
                if change is not None
                else None,
                trend=trend,
            )
        )
    return summaries


@router.get("/progress/{exercise_id}", response_model=ExerciseProgressRead)
def exercise_progress(exercise_id: str, db: DbSession, user: CurrentUser) -> ExerciseProgressRead:
    exercise = get_owned(db, Exercise, exercise_id, user.id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise was not found.")
    movements = list(
        db.scalars(
            select(WorkoutMovement)
            .where(WorkoutMovement.exercise_id == exercise_id)
            .options(selectinload(WorkoutMovement.workout), selectinload(WorkoutMovement.sets))
            .order_by(WorkoutMovement.workout_id)
        )
    )
    grouped: dict[tuple[date, str], list[WorkoutSet]] = defaultdict(list)
    for movement in movements:
        grouped[(movement.workout.workout_date, movement.workout_id)].extend(
            item for item in movement.sets if is_working_set(item)
        )
    points: list[ProgressPoint] = []
    for (workout_date, workout_id), sets in sorted(grouped.items()):
        if not sets:
            continue
        best_set = max(sets, key=lambda item: ((item.weight_kg or 0), (item.reps or 0)))
        best_e1rm = max(
            (
                estimated_one_rep_max(item.weight_kg or 0, item.reps or 0)
                for item in sets
                if is_pr_eligible(item)
            ),
            default=0.0,
        )
        points.append(
            ProgressPoint(
                workout_date=workout_date,
                workout_id=workout_id,
                best_weight_kg=best_set.weight_kg or 0,
                best_reps=best_set.reps or 0,
                estimated_1rm=round(best_e1rm, 1),
                volume_kg=round(sum((item.weight_kg or 0) * (item.reps or 0) for item in sets), 1),
                best_rpe=best_set.rpe,
            )
        )
    return ExerciseProgressRead(
        exercise=exercise,
        points=points,
        personal_best_weight_kg=max((point.best_weight_kg for point in points), default=0),
        personal_best_estimated_1rm=max((point.estimated_1rm for point in points), default=0),
    )
