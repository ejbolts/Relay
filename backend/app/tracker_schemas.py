from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from .machine_settings import MachineSetting
from .models import (
    ExerciseKind,
    MuscleRole,
    PersonalRecordType,
    SetType,
    WorkoutCategory,
)
from .training_metrics import muscle_credits


class MuscleContributionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    muscle_name: str
    role: MuscleRole
    contribution_factor: float


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: WorkoutCategory
    kind: ExerciseKind = ExerciseKind.STRENGTH
    muscle_group: str = Field(min_length=1, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)

    @field_validator("name", "muscle_group", "equipment", mode="before")
    @classmethod
    def clean_strings(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value


class MuscleSetCreditRead(BaseModel):
    muscle_name: str
    sets: float


class ExerciseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: WorkoutCategory
    kind: ExerciseKind
    muscle_group: str
    equipment: str | None
    is_custom: bool
    is_favorite: bool
    muscle_contributions: list[MuscleContributionRead] = []

    @computed_field
    @property
    def muscle_set_credits(self) -> list[MuscleSetCreditRead]:
        # The read model carries the same calculation inputs as the ORM exercise.
        return [
            MuscleSetCreditRead(muscle_name=name, sets=sets) for name, sets in muscle_credits(self)
        ]


class ExerciseFavoriteUpdate(BaseModel):
    is_favorite: bool


class MachinePhotoCaptionUpdate(BaseModel):
    caption: str = Field(min_length=1, max_length=160)

    @field_validator("caption", mode="before")
    @classmethod
    def clean_caption(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class MachinePhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exercise_id: str
    caption: str
    thumbnail_url: str
    full_url: str
    width: int
    height: int
    created_at: datetime


class MachinePhotoUsageRead(MachinePhotoRead):
    """A saved machine with when, and how often, saved workouts have pinned it."""

    exercise_name: str
    workout_count: int
    last_used_date: date | None


class WorkoutSetCreate(BaseModel):
    reps: int | None = Field(default=None, ge=0, le=10_000)
    weight_kg: float | None = Field(default=None, ge=0, le=10_000)
    rpe: float | None = Field(default=None, ge=1, le=10)
    rest_seconds: int | None = Field(default=None, ge=0, le=7_200)
    duration_seconds: int | None = Field(default=None, ge=0, le=172_800)
    distance_km: float | None = Field(default=None, ge=0, le=10_000)
    calories_kcal: int | None = Field(default=None, ge=0, le=100_000)
    average_heart_rate_bpm: int | None = Field(default=None, ge=20, le=250)
    incline_percent: float | None = Field(default=None, ge=0, le=100)
    speed_kph: float | None = Field(default=None, ge=0, le=100)
    bodyweight_kg: float | None = Field(default=None, ge=0, le=1_000)
    percentile: float | None = Field(default=None, ge=0, le=100)
    warmup: bool = False
    set_type: SetType = SetType.NORMAL
    failed: bool = False
    target_reps: int | None = Field(default=None, ge=0, le=10_000)
    notes: str | None = Field(default=None, max_length=2_000)
    completed: bool = True

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def synchronize_warmup(self) -> WorkoutSetCreate:
        if self.warmup:
            self.set_type = SetType.WARMUP
        self.warmup = self.set_type == SetType.WARMUP
        return self


class WorkoutMovementCreate(BaseModel):
    exercise_id: str
    notes: str | None = Field(default=None, max_length=2_000)
    machine_photo_ids: list[str] = Field(default_factory=list, max_length=20)
    machine_settings: list[MachineSetting] = Field(default_factory=list, max_length=20)
    superset_key: str | None = Field(default=None, max_length=50)
    sets: list[WorkoutSetCreate] = Field(min_length=1, max_length=100)

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("machine_photo_ids")
    @classmethod
    def unique_machine_photos(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Machine photos cannot be pinned more than once.")
        return value


class WorkoutTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
    is_custom: bool
    archived: bool


class WorkoutTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class WorkoutTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    archived: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class TrainingWorkoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    workout_date: date
    category: WorkoutCategory
    workout_type_id: str | None = Field(default=None, max_length=36)
    notes: str | None = Field(default=None, max_length=10_000)
    duration_minutes: int | None = Field(default=None, ge=0, le=1_440)
    start_time: time | None = None
    end_time: time | None = None
    movements: list[WorkoutMovementCreate] = Field(min_length=1, max_length=100)

    @field_validator("name", "notes", mode="before")
    @classmethod
    def clean_strings(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_completed_set(self) -> TrainingWorkoutCreate:
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Workout start and end times must be provided together.")
        if self.start_time is not None and self.end_time is not None:
            start_seconds = (
                self.start_time.hour * 3_600 + self.start_time.minute * 60 + self.start_time.second
            )
            end_seconds = (
                self.end_time.hour * 3_600 + self.end_time.minute * 60 + self.end_time.second
            )
            elapsed_seconds = end_seconds - start_seconds
            if elapsed_seconds < 0:
                elapsed_seconds += 24 * 3_600
            self.duration_minutes = round(elapsed_seconds / 60)
        if not any(item.completed for movement in self.movements for item in movement.sets):
            raise ValueError("A workout must contain at least one completed set.")
        exercise_ids = [movement.exercise_id for movement in self.movements]
        if len(exercise_ids) != len(set(exercise_ids)):
            raise ValueError("An exercise can only be added once per workout.")
        return self


class WorkoutSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_index: int
    reps: int | None
    weight_kg: float | None
    rpe: float | None
    rest_seconds: int | None
    duration_seconds: int | None
    distance_km: float | None
    calories_kcal: int | None
    average_heart_rate_bpm: int | None
    incline_percent: float | None
    speed_kph: float | None
    bodyweight_kg: float | None
    percentile: float | None
    warmup: bool
    set_type: SetType
    failed: bool
    target_reps: int | None
    notes: str | None
    completed: bool


class WorkoutMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_index: int
    notes: str | None
    exercise: ExerciseRead
    machine_photos: list[MachinePhotoRead] = []
    machine_settings: list[MachineSetting] = Field(default_factory=list)
    superset_group_id: str | None
    superset_name: str | None = None
    sets: list[WorkoutSetRead] = []


class TrainingWorkoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    workout_date: date
    category: WorkoutCategory
    workout_type_id: str | None = None
    workout_type: WorkoutTypeRead | None = None
    notes: str | None
    duration_minutes: int | None
    start_time: time | None
    end_time: time | None
    is_sample: bool
    created_at: datetime
    updated_at: datetime
    movements: list[WorkoutMovementRead] = []


class WorkoutCacheRevisionRead(BaseModel):
    revision: str


class WorkoutSnapshotRead(WorkoutCacheRevisionRead):
    workouts: list[TrainingWorkoutRead]


class WorkoutHistorySummaryRead(BaseModel):
    """Whole-log facts, so screens that load recent history in windows know what lies beyond."""

    total_workouts: int
    first_workout_date: date | None
    last_workout_date: date | None
    has_sample_workouts: bool


class WeightRepsRead(BaseModel):
    weight_kg: float
    reps: int


class ExerciseLatestSessionRead(BaseModel):
    workout_id: str
    workout_date: date
    workout_name: str
    movement_notes: str | None
    sets: list[WorkoutSetRead]


class ExerciseHistoryBaselineRead(BaseModel):
    """An exercise's history before a date, condensed for PR checks and set suggestions."""

    exercise_id: str
    best_weight_kg: float | None
    reps_by_weight: list[WeightRepsRead]
    latest: ExerciseLatestSessionRead | None


class CalendarExerciseRead(BaseModel):
    exercise_name: str
    set_count: int
    bodyweight_kg: float | None


class CalendarWorkoutRead(BaseModel):
    id: str
    name: str
    category: WorkoutCategory
    workout_type_id: str | None = None
    workout_type: WorkoutTypeRead | None = None
    duration_minutes: int | None
    exercises: list[CalendarExerciseRead]


class HeatmapDay(BaseModel):
    workout_date: date
    categories: list[WorkoutCategory]
    workout_types: list[WorkoutTypeRead] = []
    workout_count: int
    set_count: int
    workouts: list[CalendarWorkoutRead]


class WeeklyExerciseBreakdown(BaseModel):
    exercise_id: str
    exercise_name: str
    muscle_group: str
    category: WorkoutCategory
    set_count: int
    volume_kg: float


class WeeklyDayBreakdown(BaseModel):
    workout_date: date
    workout_count: int
    total_sets: int
    volume_kg: float
    workout_names: list[str]
    categories: list[WorkoutCategory]
    exercises: list[WeeklyExerciseBreakdown]


class MuscleFrequencyRead(BaseModel):
    muscle_group: str
    sessions_last_7_days: int
    target_sessions: int


class WorkoutRecommendationRead(BaseModel):
    category: WorkoutCategory
    session_name: str
    rotation_next: WorkoutCategory
    reason: str
    muscle_frequency: list[MuscleFrequencyRead]


class WeeklyMuscleContributionRead(BaseModel):
    workout_id: str
    workout_name: str
    workout_date: date
    movement_id: str
    exercise_id: str
    exercise_name: str
    working_sets: int
    credit_per_set: float
    set_credits: float


class WeeklyMuscleSetsRead(BaseModel):
    muscle_group: str
    raw_sets: float
    effective_sets: float
    average_rpe: float | None
    contributions: list[WeeklyMuscleContributionRead] = Field(default_factory=list)


class WeeklySetsRead(BaseModel):
    week_start: date
    week_end: date
    raw_sets: int
    effective_sets: float
    unrated_sets: int
    low_rpe_sets: int
    rpe_logging_percent: float
    muscle_groups: list[WeeklyMuscleSetsRead]


class BodyMeasurementCreate(BaseModel):
    measurement_date: date
    weight_kg: float = Field(gt=0, le=500)
    body_fat_pct: float | None = Field(default=None, ge=1, le=70)
    notes: str | None = Field(default=None, max_length=2_000)

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value


class BodyMeasurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    measurement_date: date
    weight_kg: float
    body_fat_pct: float | None
    notes: str | None
    is_sample: bool
    created_at: datetime


class BodyMeasurementCsvImportRead(BaseModel):
    measurements_created: int
    measurements_updated: int
    rows_imported: int


class BodyWeightGoalCreate(BaseModel):
    start_date: date
    target_date: date
    start_weight_kg: float = Field(gt=0, le=500)
    target_weight_kg: float = Field(gt=0, le=500)
    active: bool = True

    @model_validator(mode="after")
    def dates_are_ordered(self) -> BodyWeightGoalCreate:
        if self.target_date < self.start_date:
            raise ValueError("Target date must be on or after the start date.")
        return self


class BodyWeightGoalRead(BodyWeightGoalCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class PersonalRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exercise_id: str
    workout_id: str
    set_id: str
    achieved_date: date
    record_type: PersonalRecordType
    value: float
    unit: str
    normalized_weight: float | None
    weight_kg: float | None
    formula: str | None
    exercise_name: str | None = None


class MuscleVolumeRead(BaseModel):
    muscle_name: str
    set_total: float


class CardioSessionFields(BaseModel):
    session_date: date
    activity_type: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(gt=0, le=1_440)
    calories_kcal: int | None = Field(default=None, ge=0, le=100_000)
    average_heart_rate_bpm: int | None = Field(default=None, ge=20, le=250)
    distance_km: float | None = Field(default=None, ge=0, le=10_000)
    average_speed_kph: float | None = Field(default=None, ge=0, le=100)
    incline_percent: float | None = Field(default=None, ge=0, le=100)
    average_power_watts: int | None = Field(default=None, ge=1, le=3_000)
    average_mets: float | None = Field(default=None, gt=0, le=50)
    intensity: str | None = Field(default=None, max_length=100)
    zone: str | None = Field(default=None, max_length=30)
    qualifies_zone2: bool = False
    notes: str | None = Field(default=None, max_length=2_000)

    @field_validator("activity_type", "intensity", "zone", "notes", mode="before")
    @classmethod
    def clean_cardio_strings(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value


class CardioSessionCreate(CardioSessionFields):
    exercise_id: str | None = Field(default=None, min_length=1, max_length=36)


class CardioScreenshotRead(BaseModel):
    session_date: date | None
    activity_type: str | None
    duration_minutes: int | None
    calories_kcal: int | None
    average_heart_rate_bpm: int | None
    distance_km: float | None
    average_speed_kph: float | None
    fields_found: list[str]
    warning: str | None


class CardioCaloriesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calories_kcal: int | None = Field(ge=0, le=100_000)


class CardioMetricsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calories_kcal: int | None = Field(default=None, ge=0, le=100_000)
    average_heart_rate_bpm: int | None = Field(default=None, ge=20, le=250)
    distance_km: float | None = Field(default=None, ge=0, le=10_000)
    average_speed_kph: float | None = Field(default=None, ge=0, le=100)
    incline_percent: float | None = Field(default=None, ge=0, le=100)
    average_power_watts: int | None = Field(default=None, ge=1, le=3_000)
    average_mets: float | None = Field(default=None, gt=0, le=50)


class CardioEnergyPeriodRead(BaseModel):
    period: Literal["week", "month", "3m", "6m", "year", "all"]
    start_date: date
    end_date: date
    calories_kcal: int
    logged_sessions: int
    total_sessions: int
    previous_start_date: date | None
    previous_end_date: date | None
    previous_calories_kcal: int | None
    average_heart_rate_bpm: float | None
    previous_average_heart_rate_bpm: float | None
    distance_km: float
    previous_distance_km: float | None
    average_speed_kph: float | None
    previous_average_speed_kph: float | None
    average_incline_percent: float | None
    previous_average_incline_percent: float | None
    average_mets: float | None
    previous_average_mets: float | None
    met_minutes: float
    previous_met_minutes: float | None
    heart_rate_sessions: int
    distance_sessions: int
    speed_sessions: int
    incline_sessions: int
    mets_sessions: int


class CardioSessionRead(CardioSessionFields):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_workout_id: str | None
    workout_context: Literal["pure_cardio", "workout_plus_cardio"] = "pure_cardio"
    performed_after_strength: bool = False
    source_workout_name: str | None = None
    created_at: datetime
    updated_at: datetime


class TrainingPreferencesUpdate(BaseModel):
    preferred_weight_unit: Literal["kg", "lb"]
    week_start: Literal["monday", "sunday", "saturday"]
    zone2_goal_minutes: int = Field(ge=1, le=10_080)
    weekly_muscle_set_goal: int | None = Field(default=None, ge=1, le=1000)


class TrainingPreferencesRead(TrainingPreferencesUpdate):
    weekly_muscle_set_goal: int = 10


class WorkoutTypeColors(BaseModel):
    upper: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    lower: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    push: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    pull: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    full_body: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    cardio: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    other: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class Zone2WeekRead(BaseModel):
    week_start: date
    week_end: date
    goal_minutes: int
    completed_minutes: int
    remaining_minutes: int
    percentage: float
    complete: bool


class CardioOverviewRead(BaseModel):
    preferences: TrainingPreferencesRead
    current_week: Zone2WeekRead
    previous_weeks: list[Zone2WeekRead]
    sessions: list[CardioSessionRead]
    energy_periods: list[CardioEnergyPeriodRead]


class DashboardRead(BaseModel):
    workouts_this_week: int
    sets_this_week: int
    volume_this_week_kg: float
    current_streak: int
    total_cardio_sessions: int
    cardio_minutes_this_week: int
    cardio_energy_periods: list[CardioEnergyPeriodRead]
    heatmap: list[HeatmapDay]
    weekly_days: list[WeeklyDayBreakdown]
    recommendation: WorkoutRecommendationRead
    weekly_sets: WeeklySetsRead
    muscle_volume: list[MuscleVolumeRead]
    zone2: Zone2WeekRead
    recent_workouts: list[TrainingWorkoutRead]
    history: WorkoutHistorySummaryRead | None = None


class TrainingTimeRead(BaseModel):
    """Lifetime logged minutes. ``total_minutes`` counts cardio done inside a workout once."""

    workout_minutes: int
    workout_count: int
    cardio_minutes: int
    cardio_count: int
    total_minutes: int


class ProgressPoint(BaseModel):
    workout_date: date
    workout_id: str
    best_weight_kg: float
    best_reps: int
    estimated_1rm: float
    volume_kg: float
    best_rpe: float | None


class ExerciseProgressRead(BaseModel):
    exercise: ExerciseRead
    points: list[ProgressPoint]
    personal_best_weight_kg: float
    personal_best_estimated_1rm: float


class ExerciseTrendPointRead(BaseModel):
    date: date
    estimated_1rm: float


class ExerciseLibrarySummaryRead(BaseModel):
    exercise_id: str
    session_count: int
    last_date: date
    latest_estimated_1rm: float | None
    change_kg: float | None
    change_percent: float | None
    trend: list[ExerciseTrendPointRead]


class CsvImportRead(BaseModel):
    workouts_created: int
    workouts_skipped: int
    exercises_created: int
    sets_imported: int
    body_measurements_created: int
    body_measurements_updated: int
    warnings: list[str]


class CsvImportSessionRead(BaseModel):
    workout_date: date
    name: str
    exercises: list[str]
    sets: int
    duplicate: bool


class CsvImportPreviewRead(BaseModel):
    sessions: list[CsvImportSessionRead]
    workouts_to_create: int
    workouts_to_skip: int
    sets_to_import: int
    new_exercises: list[str]
    warnings: list[str]
    body_measurements_to_create: int = 0
    body_measurements_to_skip: int = 0
