export type SessionStatus =
  | 'draft'
  | 'uploading'
  | 'upload_failed'
  | 'queued'
  | 'normalizing'
  | 'stitching'
  | 'uploading_to_youtube'
  | 'youtube_processing'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type ClipUploadStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed';

export interface Clip {
  id: string;
  client_clip_id: string;
  original_filename: string;
  order_index: number;
  exercise_label: string | null;
  file_size: number;
  upload_status: ClipUploadStatus;
  uploaded_at: string | null;
  duration_ms: number | null;
}

export interface Timestamp {
  clip_id: string;
  order_index: number;
  label: string;
  start_seconds: number;
  youtube_url: string | null;
}

export interface WorkoutSession {
  id: string;
  name: string;
  workout_date: string;
  notes: string | null;
  status: SessionStatus;
  expected_clip_count: number;
  uploaded_clip_count: number;
  processing_error: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  created_at: string;
  updated_at: string;
  clips: Clip[];
  timestamps: Timestamp[];
}

export interface Health {
  status: string;
  upload_concurrency: number;
  youtube_mock_mode: boolean;
}

export interface YouTubeConnection {
  status: 'mock' | 'unavailable' | 'not_connected' | 'connected' | 'reconnect_required';
  channel_id: string | null;
  channel_title: string | null;
  channel_url: string | null;
  can_disconnect: boolean;
  message: string;
  privacy_status: 'unlisted' | 'private' | 'public';
}

export interface PushConfig {
  enabled: boolean;
  public_key: string | null;
}

export interface LocalClip {
  clientId: string;
  file: File;
  previewUrl: string;
  exerciseLabel: string;
  status: ClipUploadStatus;
  progress: number;
  error?: string;
}

export type WorkoutCategory =
  'upper' | 'lower' | 'push' | 'pull' | 'full_body' | 'cardio' | 'other';

export type WorkoutTypeColors = Record<WorkoutCategory, string>;

export interface WorkoutType {
  id: string;
  name: string;
  color: string;
  is_custom: boolean;
  archived: boolean;
}

export type ExerciseKind = 'strength' | 'cardio';

export type SetType = 'warmup' | 'normal' | 'drop';
export type PersonalRecordType =
  'weight' | 'reps_at_weight' | 'estimated_1rm' | 'duration' | 'distance';

export interface MuscleContribution {
  muscle_name: string;
  role: 'primary' | 'secondary';
  contribution_factor: number;
}

export interface Exercise {
  id: string;
  name: string;
  category: WorkoutCategory;
  kind: ExerciseKind;
  muscle_group: string;
  equipment: string | null;
  is_custom: boolean;
  is_favorite: boolean;
  muscle_contributions: MuscleContribution[];
  muscle_set_credits?: { muscle_name: string; sets: number }[];
  default_muscle_set_credits?: { muscle_name: string; sets: number }[];
  partial_sets_enabled?: boolean;
  partial_sets_default?: boolean;
  partial_set_weeks?: { week_start: string; enabled: boolean }[];
}

export type ExerciseCreateInput = Pick<
  Exercise,
  'name' | 'category' | 'kind' | 'muscle_group' | 'equipment'
>;

export interface MachinePhoto {
  id: string;
  exercise_id: string;
  caption: string;
  thumbnail_url: string;
  full_url: string;
  width: number;
  height: number;
  created_at: string;
}

/** A saved machine with when, and how often, saved workouts have pinned it. */
export interface MachinePhotoUsage extends MachinePhoto {
  exercise_name: string;
  workout_count: number;
  last_used_date: string | null;
}

export interface TrackedSet {
  id: string;
  order_index: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  rest_seconds: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  calories_kcal?: number | null;
  average_heart_rate_bpm?: number | null;
  incline_percent: number | null;
  speed_kph: number | null;
  bodyweight_kg: number | null;
  percentile: number | null;
  warmup: boolean;
  set_type: SetType;
  failed: boolean;
  target_reps: number | null;
  notes: string | null;
  completed: boolean;
}

export interface TrackedMovement {
  id: string;
  order_index: number;
  notes: string | null;
  exercise: Exercise;
  sets: TrackedSet[];
  machine_photos: MachinePhoto[];
  superset_group_id: string | null;
  superset_name: string | null;
}

export interface TrackedWorkout {
  id: string;
  name: string;
  workout_date: string;
  category: WorkoutCategory;
  workout_type_id?: string | null;
  workout_type?: WorkoutType | null;
  notes: string | null;
  duration_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
  movements: TrackedMovement[];
}

export interface WorkoutCacheRevision {
  revision: string;
}

export interface WorkoutSnapshot extends WorkoutCacheRevision {
  workouts: TrackedWorkout[];
}

export interface WorkoutSetInput {
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  rest_seconds: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  calories_kcal?: number | null;
  average_heart_rate_bpm?: number | null;
  incline_percent?: number | null;
  speed_kph?: number | null;
  bodyweight_kg?: number | null;
  percentile?: number | null;
  warmup?: boolean;
  set_type?: SetType;
  failed?: boolean;
  target_reps?: number | null;
  notes: string | null;
  completed: boolean;
}

export interface WorkoutInput {
  name: string;
  workout_date: string;
  category: WorkoutCategory;
  workout_type_id?: string | null;
  notes: string | null;
  duration_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  movements: Array<{
    exercise_id: string;
    notes: string | null;
    machine_photo_ids: string[];
    superset_key?: string | null;
    sets: WorkoutSetInput[];
  }>;
}

export interface HeatmapDay {
  workout_date: string;
  categories: WorkoutCategory[];
  workout_types?: WorkoutType[];
  workout_count: number;
  set_count: number;
  workouts: Array<{
    id: string;
    name: string;
    category: WorkoutCategory;
    workout_type_id?: string | null;
    workout_type?: WorkoutType | null;
    duration_minutes: number | null;
    exercises: Array<{
      exercise_name: string;
      set_count: number;
      bodyweight_kg: number | null;
    }>;
  }>;
}

export interface BodyMeasurement {
  id: string;
  measurement_date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  notes: string | null;
  is_sample: boolean;
  created_at: string;
}

export interface BodyMeasurementCsvImportResult {
  measurements_created: number;
  measurements_updated: number;
  rows_imported: number;
}

export interface WeeklyExerciseBreakdown {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  category: WorkoutCategory;
  set_count: number;
  volume_kg: number;
}

export interface WeeklyDayBreakdown {
  workout_date: string;
  workout_count: number;
  total_sets: number;
  volume_kg: number;
  workout_names: string[];
  categories: WorkoutCategory[];
  exercises: WeeklyExerciseBreakdown[];
}

export interface MuscleFrequency {
  muscle_group: string;
  sessions_last_7_days: number;
  target_sessions: number;
}

export interface WorkoutRecommendation {
  category: WorkoutCategory;
  session_name: string;
  rotation_next: WorkoutCategory;
  reason: string;
  muscle_frequency: MuscleFrequency[];
  workout_type?: WorkoutType | null;
  is_rest_day?: boolean;
  needs_split_update?: boolean;
  scheduled_date?: string | null;
  split_name?: string | null;
}

export interface TrainingSplit {
  name: string;
  enabled: boolean;
  start_date: string;
  steps: { workout_type_id: string | null }[];
}

export interface WeeklyMuscleContribution {
  workout_id: string;
  workout_name: string;
  workout_date: string;
  movement_id: string;
  exercise_id: string;
  exercise_name: string;
  working_sets: number;
  credit_per_set: number;
  set_credits: number;
}

export interface WeeklyMuscleSets {
  muscle_group: string;
  raw_sets: number;
  effective_sets: number;
  average_rpe: number | null;
  /** Absent in dashboards cached before the muscle contribution sheet was added. */
  contributions?: WeeklyMuscleContribution[];
}

export interface WeeklySets {
  week_start: string;
  week_end: string;
  raw_sets: number;
  effective_sets: number;
  unrated_sets: number;
  low_rpe_sets: number;
  rpe_logging_percent: number;
  muscle_groups: WeeklyMuscleSets[];
}

/** Lifetime minutes on Profile; `total_minutes` counts cardio inside a workout once. */
export interface TrainingTime {
  workout_minutes: number;
  workout_count: number;
  cardio_minutes: number;
  cardio_count: number;
  total_minutes: number;
}

export interface DashboardData {
  workouts_this_week: number;
  sets_this_week: number;
  volume_this_week_kg: number;
  current_streak: number;
  total_cardio_sessions: number;
  cardio_minutes_this_week: number;
  cardio_energy_periods: CardioEnergyPeriod[];
  heatmap: HeatmapDay[];
  weekly_days: WeeklyDayBreakdown[];
  recommendation: WorkoutRecommendation;
  weekly_sets: WeeklySets;
  muscle_volume: MuscleVolume[];
  zone2: Zone2Week;
  recent_workouts: TrackedWorkout[];
  /** Whole-log facts; absent from dashboards cached by earlier releases. */
  history?: WorkoutHistorySummary | null;
}

export interface WorkoutHistorySummary {
  total_workouts: number;
  first_workout_date: string | null;
  last_workout_date: string | null;
  has_sample_workouts: boolean;
}

/** An exercise's history before the loaded window, condensed by the server. */
export interface ExerciseHistoryBaseline {
  exercise_id: string;
  best_weight_kg: number | null;
  reps_by_weight: Array<{ weight_kg: number; reps: number }>;
  latest: {
    workout_id: string;
    workout_date: string;
    workout_name: string;
    movement_notes: string | null;
    sets: TrackedSet[];
  } | null;
}

export interface MuscleVolume {
  muscle_name: string;
  set_total: number;
}

export interface PersonalRecord {
  id: string;
  exercise_id: string;
  workout_id: string;
  set_id: string;
  achieved_date: string;
  record_type: PersonalRecordType;
  value: number;
  unit: string;
  normalized_weight: number | null;
  weight_kg?: number | null;
  formula: string | null;
  exercise_name: string | null;
}

export interface TrainingPreferences {
  preferred_weight_unit: 'kg' | 'lb';
  week_start: 'monday' | 'sunday' | 'saturday';
  zone2_goal_minutes: number;
  weekly_muscle_set_goal: number;
}

export interface Zone2Week {
  week_start: string;
  week_end: string;
  goal_minutes: number;
  completed_minutes: number;
  remaining_minutes: number;
  percentage: number;
  complete: boolean;
}

export interface CardioSessionInput {
  session_date: string;
  exercise_id?: string | null;
  activity_type: string;
  duration_minutes: number;
  calories_kcal?: number | null;
  average_heart_rate_bpm?: number | null;
  distance_km?: number | null;
  average_speed_kph?: number | null;
  incline_percent?: number | null;
  average_power_watts?: number | null;
  average_mets?: number | null;
  intensity: string | null;
  zone: string | null;
  qualifies_zone2: boolean;
  notes: string | null;
}

export interface CardioSession extends CardioSessionInput {
  id: string;
  source_workout_id: string | null;
  workout_context?: 'pure_cardio' | 'workout_plus_cardio';
  performed_after_strength?: boolean;
  source_workout_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardioScreenshotScan {
  session_date: string | null;
  activity_type: string | null;
  duration_minutes: number | null;
  calories_kcal: number | null;
  average_heart_rate_bpm: number | null;
  distance_km: number | null;
  average_speed_kph: number | null;
  fields_found: string[];
  warning: string | null;
}

export interface CardioOverview {
  preferences: TrainingPreferences;
  current_week: Zone2Week;
  previous_weeks: Zone2Week[];
  sessions: CardioSession[];
  energy_periods: CardioEnergyPeriod[];
}

export interface CardioEnergyPeriod {
  period: 'week' | 'month' | '3m' | '6m' | 'year' | 'all';
  start_date: string;
  end_date: string;
  calories_kcal: number;
  logged_sessions: number;
  total_sessions: number;
  previous_start_date: string | null;
  previous_end_date: string | null;
  previous_calories_kcal: number | null;
  average_heart_rate_bpm: number | null;
  previous_average_heart_rate_bpm: number | null;
  distance_km: number;
  previous_distance_km: number | null;
  average_speed_kph: number | null;
  previous_average_speed_kph: number | null;
  average_incline_percent: number | null;
  previous_average_incline_percent: number | null;
  average_mets: number | null;
  previous_average_mets: number | null;
  met_minutes: number;
  previous_met_minutes: number | null;
  heart_rate_sessions: number;
  distance_sessions: number;
  speed_sessions: number;
  incline_sessions: number;
  mets_sessions: number;
}

export interface CardioMetricsInput {
  calories_kcal: number | null;
  average_heart_rate_bpm: number | null;
  distance_km: number | null;
  average_speed_kph: number | null;
  incline_percent: number | null;
  average_power_watts?: number | null;
  average_mets?: number | null;
}

export interface BodyWeightGoalInput {
  start_date: string;
  target_date: string;
  start_weight_kg: number;
  target_weight_kg: number;
  active: boolean;
}

export interface BodyWeightGoal extends BodyWeightGoalInput {
  id: string;
  created_at: string;
}

export interface ProgressPoint {
  workout_date: string;
  workout_id: string;
  best_weight_kg: number;
  best_reps: number;
  estimated_1rm: number;
  volume_kg: number;
  best_rpe: number | null;
}

export interface ExerciseProgress {
  exercise: Exercise;
  points: ProgressPoint[];
  personal_best_weight_kg: number;
  personal_best_estimated_1rm: number;
}

export interface ExerciseLibrarySummary {
  exercise_id: string;
  session_count: number;
  last_date: string;
  latest_estimated_1rm: number | null;
  change_kg: number | null;
  change_percent: number | null;
  trend: { date: string; estimated_1rm: number }[];
}

export interface CsvImportResult {
  workouts_created: number;
  workouts_skipped: number;
  exercises_created: number;
  sets_imported: number;
  body_measurements_created: number;
  body_measurements_updated: number;
  warnings: string[];
}

export interface WorkoutImportOptions {
  source: 'gym' | 'strengthlevel' | 'hevy' | 'strong';
  weight_unit: 'kg' | 'lb';
  distance_unit: 'km' | 'mi';
}

export interface CsvImportPreview {
  sessions: {
    workout_date: string;
    name: string;
    exercises: string[];
    sets: number;
    duplicate: boolean;
  }[];
  workouts_to_create: number;
  workouts_to_skip: number;
  sets_to_import: number;
  new_exercises: string[];
  warnings: string[];
  body_measurements_to_create?: number;
  body_measurements_to_skip?: number;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  can_upload_videos: boolean;
  created_at: string;
  /** Versioned URL of the account's profile photo; null when it has none. */
  profile_photo_url?: string | null;
}

/** Who may upload workout videos: nobody, administrators only, or every account. */
export type VideoUploadMode = 'off' | 'admin' | 'everyone';

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
  disabled_at: string | null;
  created_at: string;
  last_active_at: string | null;
  signed_in_devices: number;
  workouts: number;
  photos: number;
  photo_bytes: number;
  video_sessions: number;
}

export interface ServerSettings {
  video_uploads: VideoUploadMode;
  allow_registration: boolean;
  invite_code_required: boolean;
}

/** Hidden limits an admin can adjust; users are never told they exist. */
export interface AccountLimits {
  workouts_per_account: number;
  cardio_sessions_per_account: number;
  custom_exercises_per_account: number;
  photos_per_account: number;
  saves_per_minute: number;
  exercises_per_workout: number;
  sets_per_workout: number;
  workout_note_characters: number;
  exercise_note_characters: number;
  set_note_characters: number;
  photo_upload_megabytes: number;
}

export type AccountLimitName = keyof AccountLimits;

export interface AccountLimitsSettings {
  values: AccountLimits;
  defaults: AccountLimits;
  bounds: Record<AccountLimitName, { minimum: number; maximum: number }>;
}

export interface ServerSettingsUpdate {
  video_uploads?: VideoUploadMode;
  allow_registration?: boolean;
}

export interface ServerStatus {
  disk: { total_bytes: number; used_bytes: number; free_bytes: number };
  database_bytes: number;
  photos: number;
  photo_bytes: number;
  video_file_bytes: number;
  video_queue: Record<string, number>;
}

export interface AuthConfig {
  registration_open: boolean;
  invite_code_required: boolean;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  password: string;
  display_name: string;
  invite_code: string | null;
}

export interface ProfileUpdateInput {
  display_name?: string;
  username?: string;
}
export interface AppFeedback {
  id: string;
  username: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** Who can see a profile: nobody, its friends (`followers`, "Friends only"), or everyone. */
export type ProfileVisibility = 'private' | 'followers' | 'public';

/** Who can see the profile and what it shares beyond its workouts, cardio and profile photo. */
export interface SharingChoices {
  visibility: ProfileVisibility;
  share_notes: boolean;
  share_body_weight: boolean;
  share_goals: boolean;
  share_machine_photos: boolean;
  /** Friends see whether you are online and when you were last active. */
  share_online_status: boolean;
  /** Friends see the name of a workout while you are doing it. */
  share_live_workouts: boolean;
}

export interface SharingSettings extends SharingChoices {
  /** Friend requests waiting for this account to accept or decline. */
  pending_requests: number;
}

/** `incoming` requests asked you; `outgoing` requests are yours, waiting for them. */
export type FriendStatus = 'none' | 'incoming' | 'outgoing' | 'friends';

export interface SharedProfileSummary {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  member_since: string;
  /** Private is returned only when viewing your own profile. */
  visibility: ProfileVisibility;
  is_you: boolean;
  friend_status: FriendStatus;
  /** When the friendship was accepted; requests have no start date. */
  friends_since?: string | null;
  /** False for a friends-only profile of a non-friend: only its name and photo are shown. */
  can_view: boolean;
  workout_count: number | null;
  /** Workouts in the last 30 days. */
  recent_workout_count: number | null;
  last_workout_date: string | null;
  /** Shared cardio sessions and weight and volume PRs, as counted on the member's Today. */
  cardio_count?: number | null;
  record_count?: number | null;
  shares: {
    notes: boolean;
    body_weight: boolean;
    goals: boolean;
    machine_photos: boolean;
  } | null;
}

export interface SuggestedProfileSummary extends SharedProfileSummary {
  username: string;
}

export interface SuggestedProfilePage {
  profiles: SuggestedProfileSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface SharingConnection {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  since: string;
  /** Present on notification snapshots; read notices remain available in the bell. */
  is_read?: boolean;
}

/** A friend, `since` the friendship began, with their latest session and recent training. */
/** A friend's workout in progress. */
export interface LiveWorkout {
  name: string;
  kind: 'strength' | 'cardio';
  started_at: string;
}

/** What a friend shares live. Online fields are null when they hide their online status. */
export interface FriendPresence {
  online: boolean | null;
  last_active_at: string | null;
  workout: LiveWorkout | null;
}

export interface FriendActivity extends SharingConnection {
  latest: { workout: TrackedWorkout; reactions: WorkoutReactions } | null;
  /** Workouts in the last 30 days. */
  recent_workout_count: number;
  /** Dates with a workout in roughly the last week, oldest first. */
  training_dates: string[];
  /** Absent when the friend shares no live activity. */
  presence?: FriendPresence | null;
}

export interface FriendConnections {
  /** A private account sees only the members it blocked, so it can still unblock them. */
  locked?: boolean;
  /** Most recent activity first. */
  friends: FriendActivity[];
  /** Requests waiting for you, and yours waiting for them. */
  requests: SharingConnection[];
  sent: SharingConnection[];
  blocked: SharingConnection[];
}

export type WorkoutReactionKind = 'like' | 'love' | 'strong' | 'fire' | 'clap' | 'trophy';

export interface WorkoutReactions {
  counts: Array<{ reaction: WorkoutReactionKind; count: number }>;
  yours: WorkoutReactionKind | null;
  comment_count?: number;
}

export interface WorkoutComment {
  id: string;
  author: Pick<SharingConnection, 'id' | 'display_name' | 'profile_photo_url'>;
  body: string;
  reaction?: WorkoutReactionKind | null;
  parent_id: string | null;
  reply_to: WorkoutComment['author'] | null;
  created_at: string;
  edited_at: string | null;
  can_edit: boolean;
  can_delete: boolean;
  reactions: WorkoutReactions;
}

export interface CommentPage {
  reactions?: WorkoutReactions;
  total: number;
  next_offset: number | null;
  items: WorkoutComment[];
}

export interface CommentNotice extends SharingConnection {
  notice_id: string;
  kind: 'comment' | 'reply' | 'comment_reaction';
  comment_id: string;
  workout_id: string;
  workout_name: string;
  body: string;
  reaction: WorkoutReactionKind | null;
}

/** A friend's latest workout or cardio session. */
export interface FriendFeedItem {
  friend: Pick<SharingConnection, 'id' | 'display_name' | 'profile_photo_url'> & {
    presence?: FriendPresence | null;
  };
  workout: TrackedWorkout;
  reactions: WorkoutReactions;
}

export interface FriendFeed {
  items: FriendFeedItem[];
  /** Friends who share, including those without a session yet. */
  friends: number;
  /** Friends with a session available in the feed. */
  with_sessions: number;
}

/** A reaction to one of your workouts; `since` is when it was given. */
export interface ReactionNotice extends SharingConnection {
  workout_id: string;
  workout_name: string;
  reaction: WorkoutReactionKind;
}

export interface SharingNotifications {
  comments?: CommentNotice[];
  /** Friend requests waiting for you. */
  requests: SharingConnection[];
  /** Your friend requests that were accepted; `since` is when. */
  accepted: SharingConnection[];
  reactions?: ReactionNotice[];
}

export interface NotificationReadReference {
  kind: 'request' | 'accepted' | 'reaction' | 'comment';
  id: string;
  since: string;
  workout_id?: string;
}

export interface SharedBodyMeasurement {
  measurement_date: string;
  weight_kg: number;
  body_fat_pct: number | null;
}

export interface SharedGoals {
  body_weight: Omit<BodyWeightGoalInput, 'active'> | null;
  zone2: Zone2Week;
}

export type SharedCardioSession = Pick<
  CardioSession,
  | 'id'
  | 'session_date'
  | 'activity_type'
  | 'duration_minutes'
  | 'calories_kcal'
  | 'average_heart_rate_bpm'
  | 'distance_km'
  | 'average_speed_kph'
  | 'incline_percent'
  | 'average_power_watts'
  | 'average_mets'
  | 'zone'
  | 'qualifies_zone2'
  | 'notes'
>;

/** Complete calendar data for the viewed account, independent of workout list filters. */
export interface SharedConsistency {
  heatmap: HeatmapDay[];
  current_streak: number;
  training_days: number;
  workout_types: WorkoutType[];
}

export interface SharedProfile extends SharedProfileSummary {
  consistency?: SharedConsistency | null;
  body_weight: SharedBodyMeasurement[] | null;
  goals: SharedGoals | null;
  cardio_sessions: SharedCardioSession[] | null;
  cardio_total?: number | null;
  training_time?: TrainingTime | null;
  /** The same totals from this day last year onwards. */
  training_time_past_year?: TrainingTime | null;
}

export interface SharedCardioPage {
  total: number;
  sessions: SharedCardioSession[];
}

export interface SharedWorkoutPage {
  total: number;
  workouts: TrackedWorkout[];
  personal_records: PersonalRecord[];
  reactions?: Record<string, WorkoutReactions>;
}

export interface SharedWorkoutFilters {
  category: WorkoutCategory | '';
  workout_type_id?: string;
  exercise_id: string;
  machine_photo_id: string;
  start_date: string;
  end_date: string;
}

export interface SharedWorkoutFilterOptions {
  workout_types?: WorkoutType[];
  exercises: { id: string; name: string }[];
  machines: MachinePhoto[];
}
