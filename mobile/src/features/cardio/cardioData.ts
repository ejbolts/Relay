import type { CardioDeletion } from '../../../../frontend/src/cardioHistory';
import type {
  CardioMetricsInput,
  CardioPreferences,
  CardioScreenshotScan,
  CardioSession,
  CardioSessionInput,
  PersonalRecord,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';

export const createCardioSession = (session: CardioSessionInput) =>
  apiSend<CardioSession>('/api/cardio', 'POST', session);

export const updateCardioSession = (id: string, session: CardioSessionInput) =>
  apiSend<CardioSession>(`/api/cardio/${encodeURIComponent(id)}`, 'PUT', session);

/** Deletes a session logged on its own, or (`workout`) the cardio-only workout holding it. */
export const deleteCardioEntry = ({ kind, id }: CardioDeletion) =>
  apiSend<void>(
    kind === 'workout'
      ? `/api/workouts/${encodeURIComponent(id)}`
      : `/api/cardio/${encodeURIComponent(id)}`,
    'DELETE',
  );

export const saveCardioMetrics = (id: string, metrics: CardioMetricsInput) =>
  apiSend<CardioSession>(`/api/cardio/${encodeURIComponent(id)}/metrics`, 'PATCH', metrics);

export const saveCardioZones = (preferences: CardioPreferences) =>
  apiSend<CardioPreferences>('/api/cardio-preferences', 'PUT', preferences);

export const scanCardioPhoto = (file: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}) =>
  uploadFile<CardioScreenshotScan>(
    '/api/cardio/scan',
    'POST',
    { uri: file.uri, name: file.fileName ?? 'screenshot.jpg', type: file.mimeType ?? 'image/jpeg' },
    { failure: 'Could not scan that screenshot.' },
  );

export const cardioWorkoutRecords = (workoutId: string) =>
  apiGet<PersonalRecord[]>(`/api/personal-records?workout_id=${encodeURIComponent(workoutId)}`);
