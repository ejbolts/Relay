import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { parseRelease } from '../../../../frontend/src/releaseMetadata';
import type {
  CardioPreferences,
  Routine,
  TrainingPreferences,
  TrainingSplit,
  User,
  WorkoutType,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys } from '../../data/queries';
import { uploadFile } from '../../data/uploadFile';

/** Settings' own reads, beside the shared account queries in data/queries.ts. */
export const settingsKeys = {
  autoSave: ['settings', 'workout-auto-save'] as const,
  release: ['settings', 'release'] as const,
  cardioPreferences: ['settings', 'cardio-preferences'] as const,
  routines: ['routines'] as const,
  trainingSplit: ['training-split'] as const,
};

/** Everything that shows the account's training: Home, Up next, history and records. */
function refreshDerived(client: QueryClient) {
  return Promise.all(
    [['dashboard'], ['workouts'], queryKeys.personalRecords].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
}

/**
 * Saves units, week start, goals or the default rest. Weights everywhere follow the cached
 * preferences at once; the server rebuilds records and weekly totals, so those reload.
 */
export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (preferences: TrainingPreferences) =>
      apiSend<TrainingPreferences>('/api/training-preferences', 'PUT', preferences),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.trainingPreferences, saved);
      void refreshDerived(client);
    },
  });
}

type AutoSave = { after_minutes: number | null };

export function useAutoSave() {
  return useQuery({
    queryKey: settingsKeys.autoSave,
    queryFn: ({ signal }) => apiGet<AutoSave>('/api/workout-auto-save', signal),
  });
}

export function useSaveAutoSave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (afterMinutes: number | null) =>
      apiSend<AutoSave>('/api/workout-auto-save', 'PUT', { after_minutes: afterMinutes }),
    onSuccess: (saved) => client.setQueryData(settingsKeys.autoSave, saved),
  });
}

/** The release the server runs, from the same release.json the web announces. */
export function useServerRelease() {
  return useQuery({
    queryKey: settingsKeys.release,
    queryFn: async ({ signal }) => parseRelease(await apiGet<unknown>('/release.json', signal)),
    staleTime: 10 * 60_000,
  });
}

/** Replaces the cached workout types with the server's answer and refreshes their colours. */
export function applyWorkoutType(client: QueryClient, saved: WorkoutType) {
  client.setQueryData<WorkoutType[]>(queryKeys.workoutTypes, (types = []) =>
    types.some((type) => type.id === saved.id)
      ? types.map((type) => (type.id === saved.id ? saved : type))
      : [...types, saved],
  );
  void client.invalidateQueries({ queryKey: queryKeys.workoutTypes });
  void refreshDerived(client);
}

export function useWorkoutTypeActions() {
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      apiSend<WorkoutType>('/api/workout-types', 'POST', input),
    onSuccess: (saved) => applyWorkoutType(client, saved),
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...changes
    }: {
      id: string;
      name?: string;
      color?: string;
      archived?: boolean;
    }) => apiSend<WorkoutType>(`/api/workout-types/${encodeURIComponent(id)}`, 'PATCH', changes),
    onSuccess: (saved) => applyWorkoutType(client, saved),
  });
  const remove = useMutation({
    mutationFn: (type: WorkoutType) =>
      apiSend<void>(`/api/workout-types/${encodeURIComponent(type.id)}`, 'DELETE'),
    onSuccess: (_, type) => applyWorkoutType(client, { ...type, archived: true }),
  });
  return { create, update, remove };
}

export function updateProfile(changes: { display_name?: string; sex?: User['sex'] }) {
  return apiSend<User>('/api/profile', 'PATCH', changes);
}

/** Uploads a photo picked on the phone; the server crops it square and stores it as WebP. */
export function uploadProfilePhoto(photo: { uri: string; mimeType?: string | null }) {
  const type = photo.mimeType ?? 'image/jpeg';
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  return uploadFile<User>('/api/profile/photo', 'PUT', {
    uri: photo.uri,
    name: `profile.${extension}`,
    type,
  });
}

export const removeProfilePhoto = () => apiSend<User>('/api/profile/photo', 'DELETE');

export const changePassword = (current: string, next: string) =>
  apiSend<void>('/api/profile/password', 'PUT', {
    current_password: current,
    new_password: next,
  });

/** Ends every session the account has, this phone's included. */
export const signOutEverywhere = () => apiSend<void>('/api/auth/logout', 'POST');

export const currentAccount = () => apiGet<User>('/api/auth/me');

// The split library

export function useRoutines() {
  return useQuery({
    queryKey: settingsKeys.routines,
    queryFn: ({ signal }) => apiGet<Routine[]>('/api/routines', signal),
  });
}

export function useTrainingSplit() {
  return useQuery({
    queryKey: settingsKeys.trainingSplit,
    queryFn: ({ signal }) =>
      apiGet<TrainingSplit | null>(`/api/training-split?on_date=${localDate()}`, signal),
  });
}

export function useCardioGoal() {
  return useQuery({
    queryKey: settingsKeys.cardioPreferences,
    queryFn: ({ signal }) => apiGet<CardioPreferences>('/api/cardio-preferences', signal),
    // Without cardio goals the chart still shows planned minutes.
    select: (preferences) =>
      preferences.goals.reduce((total, goal) => total + goal.minutes, 0) || null,
  });
}

type Schedule = Pick<TrainingSplit, 'start_date' | 'enabled' | 'progression'>;

/** Splits, the active split and Up next all change together. */
export function refreshSplits(client: QueryClient) {
  return Promise.all(
    [settingsKeys.routines, settingsKeys.trainingSplit, ['dashboard']].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
}

export function saveRoutine(routine: Routine, schedule?: Schedule) {
  const scheduled = schedule ? { schedule } : {};
  // The current split from before the library existed is saved into it as a new split.
  if (!routine.id || routine.id === 'current-split')
    return apiSend<Routine>('/api/routines', 'POST', {
      name: routine.name,
      shared: routine.shared,
      days: routine.days,
      ...scheduled,
    });
  return apiSend<Routine>(`/api/routines/${encodeURIComponent(routine.id)}`, 'PUT', {
    ...routine,
    ...scheduled,
  });
}

export const deleteRoutine = (id: string) =>
  apiSend<void>(`/api/routines/${encodeURIComponent(id)}`, 'DELETE');

/** Makes a saved split the active one, from `startDate`; it follows logged workouts. */
export const startRoutine = (id: string, startDate: string) =>
  apiSend<TrainingSplit>(
    `/api/routines/${encodeURIComponent(id)}/use?on_date=${localDate()}`,
    'POST',
    {
      start_date: startDate,
      progression: 'workouts',
    },
  );

export const saveTrainingSplit = (split: TrainingSplit) =>
  apiSend<TrainingSplit>(`/api/training-split?on_date=${localDate()}`, 'PUT', split);
