import type {
  TrainExercise,
  TrainInvite,
  TrainPartnerChange,
  TrainPartnerWriteResult,
  TrainTogetherRead,
} from '../../../../frontend/src/trainTogether';
import { apiGet, apiSend } from '../../data/api';

// The train-together endpoints the web's `api.trainTogether` uses. The rules, wording and the
// partner request loop live in frontend/src/trainTogether.ts, which both apps import.

const id = encodeURIComponent;

/** Every train-together query sits under one key; refetch it on the socket's `train_together`. */
export const trainTogetherKeys = {
  all: ['train-together'] as const,
  session: ['train-together', 'session'] as const,
  partnerExercises: (userId: string) => ['train-together', 'exercises', userId] as const,
};

export const trainTogetherApi = {
  read: (signal?: AbortSignal) => apiGet<TrainTogetherRead>('/api/train-together', signal),
  invite: () => apiSend<TrainInvite>('/api/train-together/invite', 'POST'),
  join: (token: string) =>
    apiSend<TrainTogetherRead>('/api/train-together/join', 'POST', { token }),
  leave: () => apiSend<TrainTogetherRead>('/api/train-together/leave', 'POST'),
  /** The partner's exercise library for the add-exercise picker: favourites first, then by name. */
  partnerExercises: (userId: string, signal?: AbortSignal) =>
    apiGet<TrainExercise[]>(`/api/train-together/members/${id(userId)}/exercises`, signal),
  /** A partner's edit, merged on the server like another of their devices; see PartnerWorkoutSync. */
  changePartnerWorkout: (userId: string, change: TrainPartnerChange) =>
    apiSend<TrainPartnerWriteResult>(
      `/api/train-together/members/${id(userId)}/workout`,
      'PUT',
      change,
    ),
};
