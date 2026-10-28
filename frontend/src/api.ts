import type { NotificationReadReference } from './types';
import type {
  SharedWorkoutFilters,
  SharedWorkoutFilterOptions,
  AccountLimits,
  AppFeedback,
  AccountLimitsSettings,
  AdminUser,
  BodyMeasurement,
  BodyMeasurementCsvImportResult,
  BodyWeightGoal,
  BodyWeightGoalInput,
  CardioOverview,
  CardioScreenshotScan,
  CardioSession,
  CardioSessionInput,
  CardioMetricsInput,
  Clip,
  CsvImportResult,
  ImportBatch,
  ImportUndoResult,
  CsvImportPreview,
  WorkoutImportOptions,
  DashboardData,
  Exercise,
  ExerciseCreateInput,
  ExerciseHistoryBaseline,
  ExerciseProgress,
  ExerciseLibrarySummary,
  HeatmapDay,
  Health,
  AuthConfig,
  LoginInput,
  MachinePhoto,
  MachinePhotoUsage,
  MachineSetting,
  MuscleVolume,
  PersonalRecord,
  ProfileUpdateInput,
  PushConfig,
  RegisterInput,
  ServerSettings,
  ServerSettingsUpdate,
  ServerStatus,
  SharedProfile,
  SharedProfileSummary,
  SuggestedProfilePage,
  SharedWorkoutPage,
  SharingChoices,
  FriendConnections,
  SharingNotifications,
  FriendFeed,
  WorkoutReactionKind,
  WorkoutReactionPage,
  WorkoutReactions,
  SharingSettings,
  FriendStatus,
  TrackedWorkout,
  User,
  WorkoutInput,
  WorkoutCacheRevision,
  WorkoutSnapshot,
  WorkoutSession,
  TrainingPreferences,
  TrainingSplit,
  TrainingTime,
  WorkoutTypeColors,
  WorkoutType,
  YouTubeConnection,
} from './types';
import { cachedWorkoutsForRevision, readWorkoutCache, writeWorkoutCache } from './workoutCache';
import { dateRangeQuery, type DateRange } from './dateRanges';
import { emitAuthExpired, NOT_AUTHENTICATED_CODE } from './authEvents';
import type { HomeLayout } from './homeLayout';
import { localDate } from './utils';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code = 'request_failed',
    public readonly status = 0,
  ) {
    super(message);
  }
}

interface RequestOptions {
  /** Public auth endpoints handle their own 401s (for example a wrong password). */
  signalExpiredSession?: boolean;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  { signalExpiredSession = true }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    if (
      signalExpiredSession &&
      response.status === 401 &&
      body?.error?.code === NOT_AUTHENTICATED_CODE
    ) {
      emitAuthExpired();
    }
    throw new ApiError(
      body?.error?.message ?? `Request failed (${response.status})`,
      body?.error?.code,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) {
    if (response.status === 401) emitAuthExpired();
    throw new ApiError(`Export failed (${response.status})`, 'export_failed', response.status);
  }
  return response.blob();
}

/** Workouts dated `since` or later, from the device cache while the server revision matches. */
async function listCachedWorkouts(since: string): Promise<TrackedWorkout[]> {
  const [cached, current] = await Promise.all([
    readWorkoutCache(),
    request<WorkoutCacheRevision>('/api/workouts/revision'),
  ]);
  const reusable = cachedWorkoutsForRevision(cached, current.revision, since);
  if (reusable) return reusable;

  const snapshot = await request<WorkoutSnapshot>(
    `/api/workouts/snapshot?${new URLSearchParams({ start: since })}`,
  );
  await writeWorkoutCache({ ...snapshot, since });
  return snapshot.workouts;
}

/** Workouts and calendar days for an older window than the one loaded at startup. */
async function listOlderHistory(
  start: string,
  end: string,
): Promise<{ workouts: TrackedWorkout[]; heatmap: HeatmapDay[] }> {
  const query = new URLSearchParams({ start, end });
  const [snapshot, heatmap] = await Promise.all([
    request<WorkoutSnapshot>(`/api/workouts/snapshot?${query}`),
    request<HeatmapDay[]>(`/api/calendar?${query}`),
  ]);
  return { workouts: snapshot.workouts, heatmap };
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const api = {
  youtube: {
    connection: () => request<YouTubeConnection>('/api/youtube/connection'),
    connect: () => request<{ url: string }>('/api/youtube/connect', { method: 'POST' }),
    disconnect: () => request<YouTubeConnection>('/api/youtube/connection', { method: 'DELETE' }),
  },
  auth: {
    config: () =>
      request<AuthConfig>('/api/auth/config', undefined, { signalExpiredSession: false }),
    me: () => request<User>('/api/auth/me', undefined, { signalExpiredSession: false }),
    login: (payload: LoginInput) =>
      request<User>(
        '/api/auth/login',
        { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
        { signalExpiredSession: false },
      ),
    register: (payload: RegisterInput) =>
      request<User>(
        '/api/auth/register',
        { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) },
        { signalExpiredSession: false },
      ),
    logout: () =>
      request<void>('/api/auth/logout', { method: 'POST' }, { signalExpiredSession: false }),
  },
  admin: {
    feedback: () => request<AppFeedback[]>('/api/admin/feedback'),
    feedbackSummary: () => request<{ open: number }>('/api/admin/feedback/summary'),
    setFeedbackResolved: (feedbackId: string, resolved: boolean) =>
      request<AppFeedback>(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ resolved }),
      }),
    users: () => request<AdminUser[]>('/api/admin/users'),
    setUserDisabled: (userId: string, disabled: boolean) =>
      request<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ disabled }),
      }),
    settings: () => request<ServerSettings>('/api/admin/settings'),
    updateSettings: (payload: ServerSettingsUpdate) =>
      request<ServerSettings>('/api/admin/settings', {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      }),
    status: () => request<ServerStatus>('/api/admin/status'),
    limits: () => request<AccountLimitsSettings>('/api/admin/limits'),
    updateLimits: (values: AccountLimits) =>
      request<AccountLimitsSettings>('/api/admin/limits', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(values),
      }),
  },
  submitFeedback: (message: string, submissionId: string) =>
    request<{ id: string }>('/api/feedback', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ message, submission_id: submissionId }),
    }),
  sharing: {
    comments: (workoutId: string, offset = 0) =>
      request<import('./types').CommentPage>(
        `/api/sharing/workouts/${encodeURIComponent(workoutId)}/comments?offset=${offset}`,
      ),
    addComment: (
      workoutId: string,
      body: string,
      reply_to_id: string | null,
      reaction: WorkoutReactionKind | null,
    ) =>
      request<import('./types').WorkoutComment>(
        `/api/sharing/workouts/${encodeURIComponent(workoutId)}/comments`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ body, reply_to_id, reaction }),
        },
      ),
    editComment: (id: string, body: string) =>
      request<import('./types').WorkoutComment>(`/api/sharing/comments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ body }),
      }),
    deleteComment: (id: string) =>
      request<void>(`/api/sharing/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reactToComment: (id: string, reaction: WorkoutReactionKind | null) =>
      request<import('./types').WorkoutComment>(
        `/api/sharing/comments/${encodeURIComponent(id)}/reaction`,
        {
          method: reaction ? 'PUT' : 'DELETE',
          headers: jsonHeaders,
          ...(reaction ? { body: JSON.stringify({ reaction }) } : {}),
        },
      ),
    choices: () => request<SharingSettings>('/api/sharing'),
    updateChoices: (choices: SharingChoices) =>
      request<SharingSettings>('/api/sharing', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(choices),
      }),
    profiles: (query?: string) =>
      request<SharedProfileSummary[]>(
        `/api/sharing/profiles${query === undefined ? '' : `?q=${encodeURIComponent(query.trim())}`}`,
      ),
    suggestions: (page = 1) =>
      request<SuggestedProfilePage>(`/api/sharing/suggestions?page=${page}`),
    profile: (userId: string) =>
      request<SharedProfile>(`/api/sharing/profiles/${encodeURIComponent(userId)}`),
    workoutFilters: (userId: string) =>
      request<SharedWorkoutFilterOptions>(
        `/api/sharing/profiles/${encodeURIComponent(userId)}/workout-filters`,
      ),
    workouts: (
      userId: string,
      offset: number,
      limit: number,
      filters: Partial<SharedWorkoutFilters> = {},
    ) =>
      request<SharedWorkoutPage>(
        `/api/sharing/profiles/${encodeURIComponent(userId)}/workouts?${new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
          ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
        })}`,
      ),
    /** Send a friend request, or accept theirs when they already asked you. */
    addFriend: (userId: string) =>
      request<{ status: FriendStatus }>(`/api/sharing/friends/${encodeURIComponent(userId)}`, {
        method: 'POST',
      }),
    acceptFriend: (userId: string) =>
      request<{ status: FriendStatus }>(
        `/api/sharing/friends/${encodeURIComponent(userId)}/accept`,
        { method: 'POST' },
      ),
    /** Remove a friend, cancel your request, or decline theirs. */
    removeFriend: (userId: string) =>
      request<void>(`/api/sharing/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    friends: () => request<FriendConnections>('/api/sharing/friends'),
    notifications: () => request<SharingNotifications>('/api/sharing/notifications'),
    markNotificationsRead: (items: NotificationReadReference[]) =>
      request<void>('/api/sharing/notifications/read', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ items }),
      }),
    feed: (limit = 5) => request<FriendFeed>(`/api/sharing/feed?limit=${limit}`),
    reactionPeople: (workoutId: string, offset = 0) =>
      request<WorkoutReactionPage>(
        `/api/sharing/workouts/${encodeURIComponent(workoutId)}/reactions?offset=${offset}`,
      ),
    react: (workoutId: string, reaction: WorkoutReactionKind) =>
      request<WorkoutReactions>(`/api/sharing/workouts/${encodeURIComponent(workoutId)}/reaction`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ reaction }),
      }),
    removeReaction: (workoutId: string) =>
      request<WorkoutReactions>(`/api/sharing/workouts/${encodeURIComponent(workoutId)}/reaction`, {
        method: 'DELETE',
      }),
    dismissReaction: (workoutId: string, userId: string, since: string) =>
      request<void>(
        `/api/sharing/reactions/${encodeURIComponent(workoutId)}/${encodeURIComponent(userId)}/dismiss`,
        { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ since }) },
      ),
    dismissNotification: (userId: string, since: string) =>
      request<void>(`/api/sharing/notifications/${encodeURIComponent(userId)}/dismiss`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ since }),
      }),
    blockMember: (userId: string) =>
      request<void>(`/api/sharing/blocks/${encodeURIComponent(userId)}`, { method: 'POST' }),
    unblockMember: (userId: string) =>
      request<void>(`/api/sharing/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  },
  updateProfile: (payload: ProfileUpdateInput) =>
    request<User>('/api/profile', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  uploadProfilePhoto: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<User>('/api/profile/photo', { method: 'PUT', body: form });
  },
  removeProfilePhoto: () => request<User>('/api/profile/photo', { method: 'DELETE' }),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    request<void>('/api/profile/password', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  deleteAccount: (password: string) =>
    request<void>('/api/profile', {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ password }),
    }),
  health: () => request<Health>('/api/health'),
  pushConfig: () => request<PushConfig>('/api/notifications/push/config'),
  savePushSubscription: (payload: { endpoint: string; p256dh: string; auth: string }) =>
    request<void>('/api/notifications/push/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deletePushSubscription: (endpoint: string) =>
    request<void>('/api/notifications/push/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }),
  testPush: () => request<void>('/api/notifications/push/test', { method: 'POST' }),
  scheduleRestTimerNotification: (payload: {
    endpoint: string;
    timer_id: string;
    delay_seconds: number;
  }) =>
    request<void>('/api/notifications/push/rest-timer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  cancelRestTimerNotification: (payload: { endpoint: string; timer_id: string }) =>
    request<void>('/api/notifications/push/rest-timer/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  scheduleActiveWorkoutReminder: (payload: {
    endpoint: string;
    timer_id: string;
    started_at: number;
  }) =>
    request<void>('/api/notifications/push/active-workout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  cancelActiveWorkoutReminder: (payload: { endpoint: string; timer_id: string }) =>
    request<void>('/api/notifications/push/active-workout/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  listSessions: () => request<WorkoutSession[]>('/api/sessions'),
  listExercises: () => request<Exercise[]>('/api/exercises'),
  createExercise: (payload: ExerciseCreateInput) =>
    request<Exercise>('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateExerciseFavorite: (exerciseId: string, isFavorite: boolean) =>
    request<Exercise>(`/api/exercises/${exerciseId}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: isFavorite }),
    }),
  listMachinePhotos: (exerciseId: string) =>
    request<MachinePhotoUsage[]>(`/api/exercises/${exerciseId}/machine-photos`),
  getMachineSettings: (exerciseId: string, machinePhotoId?: string) =>
    request<{ settings: MachineSetting[] }>(
      `/api/exercises/${exerciseId}/machine-settings${machinePhotoId ? `?${new URLSearchParams({ machine_photo_id: machinePhotoId })}` : ''}`,
    ),
  saveMachineSettings: (exerciseId: string, settings: MachineSetting[], machinePhotoId?: string) =>
    request<{ settings: MachineSetting[] }>(
      `/api/exercises/${exerciseId}/machine-settings${machinePhotoId ? `?${new URLSearchParams({ machine_photo_id: machinePhotoId })}` : ''}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      },
    ),
  listAllMachinePhotos: () => request<MachinePhotoUsage[]>('/api/machine-photos'),
  machinePhotoWorkouts: (photoId: string) =>
    request<TrackedWorkout[]>(`/api/machine-photos/${photoId}/workouts`),
  lastUsedMachinePhotos: (exerciseId: string) =>
    request<MachinePhoto[]>(`/api/exercises/${exerciseId}/machine-photos/last-used`),
  uploadMachinePhoto: (
    exerciseId: string,
    file: File,
    caption: string,
    settings: MachineSetting[] = [],
  ) => {
    const form = new FormData();
    form.append('caption', caption);
    form.append('machine_settings', JSON.stringify({ settings }));
    form.append('file', file, file.name);
    return request<MachinePhoto>(`/api/exercises/${exerciseId}/machine-photos`, {
      method: 'POST',
      body: form,
    });
  },
  updateMachinePhoto: (photoId: string, caption: string) =>
    request<MachinePhoto>(`/api/machine-photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption }),
    }),
  deleteMachinePhoto: (photoId: string) =>
    request<void>(`/api/machine-photos/${photoId}`, { method: 'DELETE' }),
  dashboard: (calendarStart?: string) =>
    request<DashboardData>(
      `/api/dashboard?${new URLSearchParams({ on_date: localDate(), ...(calendarStart ? { calendar_start: calendarStart } : {}) })}`,
    ),
  getTrainingSplit: () => request<TrainingSplit | null>('/api/training-split'),
  saveTrainingSplit: (payload: TrainingSplit) =>
    request<TrainingSplit>('/api/training-split', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),
  trainingTime: () => request<TrainingTime>('/api/training-time'),
  workoutRevision: () =>
    request<WorkoutCacheRevision>('/api/workouts/revision', {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }),
  listWorkouts: listCachedWorkouts,
  listOlderHistory,
  exerciseHistoryBaselines: (before: string) =>
    request<ExerciseHistoryBaseline[]>(
      `/api/exercise-history-baselines?${new URLSearchParams({ before })}`,
    ),
  listBodyMeasurements: () => request<BodyMeasurement[]>('/api/body-measurements'),
  saveBodyMeasurement: (payload: {
    measurement_date: string;
    weight_kg: number;
    body_fat_pct: number | null;
    notes: string | null;
  }) =>
    request<BodyMeasurement>('/api/body-measurements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteBodyMeasurement: (id: string) =>
    request<void>(`/api/body-measurements/${id}`, { method: 'DELETE' }),
  exportBodyMeasurements: (range: DateRange = {}) =>
    requestBlob(`/api/body-measurements/export.csv${dateRangeQuery(range)}`),
  importBodyMeasurements: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<BodyMeasurementCsvImportResult>('/api/body-measurements/import', {
      method: 'POST',
      body: form,
    });
  },
  listBodyWeightGoals: () => request<BodyWeightGoal[]>('/api/body-weight-goals'),
  createBodyWeightGoal: (payload: BodyWeightGoalInput) =>
    request<BodyWeightGoal>('/api/body-weight-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateBodyWeightGoal: (id: string, payload: BodyWeightGoalInput) =>
    request<BodyWeightGoal>(`/api/body-weight-goals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteBodyWeightGoal: (id: string) =>
    request<void>(`/api/body-weight-goals/${id}`, { method: 'DELETE' }),
  listPersonalRecords: (params?: { exerciseId?: string; workoutId?: string }) => {
    const query = new URLSearchParams();
    if (params?.exerciseId) query.set('exercise_id', params.exerciseId);
    if (params?.workoutId) query.set('workout_id', params.workoutId);
    return request<PersonalRecord[]>(`/api/personal-records${query.size ? `?${query}` : ''}`);
  },
  muscleVolume: (start?: string, end?: string) => {
    const query = new URLSearchParams();
    if (start) query.set('start', start);
    if (end) query.set('end', end);
    return request<MuscleVolume[]>(`/api/muscle-volume${query.size ? `?${query}` : ''}`);
  },
  cardioOverview: () => request<CardioOverview>('/api/cardio'),
  scanCardioScreenshot: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<CardioScreenshotScan>('/api/cardio/scan', {
      method: 'POST',
      body: form,
    });
  },
  createCardio: (payload: CardioSessionInput) =>
    request<CardioSession>('/api/cardio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateCardio: (id: string, payload: CardioSessionInput) =>
    request<CardioSession>(`/api/cardio/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteCardio: (id: string) => request<void>(`/api/cardio/${id}`, { method: 'DELETE' }),
  updateCardioCalories: (id: string, calories_kcal: number | null) =>
    request<CardioSession>(`/api/cardio/${id}/calories`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calories_kcal }),
    }),
  updateCardioMetrics: (id: string, payload: CardioMetricsInput) =>
    request<CardioSession>(`/api/cardio/${id}/metrics`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  getTrainingPreferences: () => request<TrainingPreferences>('/api/training-preferences'),
  getHomeLayout: () => request<HomeLayout>('/api/home-layout'),
  saveHomeLayout: (layout: HomeLayout) =>
    request<HomeLayout>('/api/home-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    }),
  getWorkoutTypeColors: () => request<WorkoutTypeColors>('/api/workout-type-colors'),
  getWorkoutTypes: () => request<WorkoutType[]>('/api/workout-types'),
  createWorkoutType: (payload: { name: string; color: string }) =>
    request<WorkoutType>('/api/workout-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateWorkoutType: (id: string, payload: { name?: string; color?: string; archived?: boolean }) =>
    request<WorkoutType>(`/api/workout-types/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteWorkoutType: (id: string) =>
    request<void>(`/api/workout-types/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateWorkoutTypeColors: (colors: WorkoutTypeColors) =>
    request<WorkoutTypeColors>('/api/workout-type-colors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(colors),
    }),
  updateTrainingPreferences: (payload: TrainingPreferences) =>
    request<TrainingPreferences>('/api/training-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  exportWorkouts: (range: DateRange = {}) =>
    requestBlob(`/api/workouts/export.csv${dateRangeQuery(range)}`),
  importWorkouts: (file: File, options?: WorkoutImportOptions) => {
    const form = new FormData();
    form.append('file', file, file.name);
    if (options)
      Object.entries(options).forEach(([key, value]) => {
        form.append(
          key,
          key === 'exercise_mappings'
            ? JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, id]) => id)))
            : (value as string),
        );
      });
    return request<CsvImportResult>('/api/workouts/import', { method: 'POST', body: form });
  },
  previewWorkoutImport: (file: File, options?: WorkoutImportOptions) => {
    const form = new FormData();
    form.append('file', file, file.name);
    if (options)
      Object.entries(options).forEach(([key, value]) => {
        form.append(
          key,
          key === 'exercise_mappings'
            ? JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, id]) => id)))
            : (value as string),
        );
      });
    return request<CsvImportPreview>('/api/workouts/import/preview', {
      method: 'POST',
      body: form,
    });
  },
  importBatches: () => request<ImportBatch[]>('/api/workouts/import/batches'),
  undoImportBatch: (id: string) =>
    request<ImportUndoResult>(`/api/workouts/import/batches/${id}`, { method: 'DELETE' }),
  createWorkout: (payload: WorkoutInput) =>
    request<TrackedWorkout>('/api/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateWorkout: (id: string, payload: WorkoutInput) =>
    request<TrackedWorkout>(`/api/workouts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  deleteWorkout: (id: string) => request<void>(`/api/workouts/${id}`, { method: 'DELETE' }),
  deleteSampleData: () => request<void>('/api/sample-data', { method: 'DELETE' }),
  exerciseProgress: (id: string) => request<ExerciseProgress>(`/api/progress/${id}`),
  exerciseLibrary: () => request<ExerciseLibrarySummary[]>('/api/progress'),
  getWorkout: (id: string) => request<TrackedWorkout>(`/api/workouts/${id}`),
  getSession: (id: string) => request<WorkoutSession>(`/api/sessions/${id}`),
  deleteSession: (id: string) =>
    request<void>(`/api/sessions/${id}`, {
      method: 'DELETE',
    }),
  createSession: (payload: {
    name: string;
    workout_date: string;
    notes: string | null;
    expected_clip_count: number;
  }) =>
    request<WorkoutSession>('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  process: (id: string) =>
    request<WorkoutSession>(`/api/sessions/${id}/process`, { method: 'POST' }),
  retryProcessing: (id: string) =>
    request<WorkoutSession>(`/api/sessions/${id}/retry-processing`, { method: 'POST' }),
  retryYoutubeProcessing: (id: string) =>
    request<WorkoutSession>(`/api/sessions/${id}/retry-youtube-processing`, {
      method: 'POST',
    }),
  cancel: (id: string) => request<WorkoutSession>(`/api/sessions/${id}/cancel`, { method: 'POST' }),
  uploadClip: (
    sessionId: string,
    clip: { clientId: string; file: File; exerciseLabel: string; orderIndex: number },
    onProgress: (percent: number) => void,
  ) =>
    new Promise<Clip>((resolve, reject) => {
      const form = new FormData();
      form.append('client_clip_id', clip.clientId);
      form.append('order_index', String(clip.orderIndex));
      form.append('exercise_label', clip.exerciseLabel);
      form.append('file', clip.file, clip.file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/sessions/${sessionId}/clips`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new ApiError('Network error while uploading this clip.'));
      xhr.onload = () => {
        const body = xhr.responseText
          ? (JSON.parse(xhr.responseText) as { error?: { code?: string; message?: string } })
          : null;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as unknown as Clip);
          return;
        }
        if (xhr.status === 401 && body?.error?.code === NOT_AUTHENTICATED_CODE) emitAuthExpired();
        reject(
          new ApiError(
            body?.error?.message ?? `Upload failed (${xhr.status})`,
            body?.error?.code,
            xhr.status,
          ),
        );
      };
      xhr.send(form);
    }),
};
