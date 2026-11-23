import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { BodyCheckInApi, BodyCheckInPayload } from '../../../../frontend/src/bodyCheckInUndo';
import type { BodySizeLog } from '../../../../frontend/src/bodySizes';
import type {
  BodyMeasurement,
  BodyWeightGoal,
  BodyWeightGoalInput,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { queryKeys } from '../../data/queries';
import { trainingKeys } from '../training/trainingQueries';
import {
  bodyCheckInQueueActive,
  deleteBodyCheckIn,
  fetchBodyMeasurements,
  localBodyMeasurements,
  saveBodyCheckIn,
} from './bodyCheckInQueue';

/**
 * Body's reads, shared with Home's body cards, all under `body` so one refresh updates every
 * screen showing a check-in. Check-ins come newest first, as the server sends them.
 */
export const bodyKeys = {
  all: ['body'] as const,
  measurements: ['body', 'measurements'] as const,
  goals: ['body', 'goals'] as const,
  sizes: ['body', 'sizes'] as const,
};

/** Check-ins with any still waiting on this phone; the phone's copy fills in while offline. */
export function useBodyMeasurements() {
  return useQuery({
    queryKey: bodyKeys.measurements,
    queryFn: ({ signal }) => fetchBodyMeasurements(signal),
    initialData: () => localBodyMeasurements() ?? undefined,
    // The copy is old by definition: the query still loads when it can.
    initialDataUpdatedAt: 0,
  });
}

export function useBodyGoals() {
  return useQuery({
    queryKey: bodyKeys.goals,
    queryFn: ({ signal }) => apiGet<BodyWeightGoal[]>('/api/body-weight-goals', signal),
  });
}

export function useBodySizes() {
  return useQuery({
    queryKey: bodyKeys.sizes,
    queryFn: ({ signal }) => apiGet<BodySizeLog[]>('/api/body-sizes', signal),
  });
}

/**
 * After a check-in changes, refresh Body, Home's body cards, Training's bodyweight lookups and
 * the records the server rebuilds from bodyweight (relative strength).
 */
export function refreshBodyMeasurements(client: QueryClient) {
  return Promise.all(
    [bodyKeys.measurements, trainingKeys.measurements, queryKeys.personalRecords].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
}

/**
 * The check-in calls the web's shared Undo rules use (frontend/src/bodyCheckInUndo.ts). As on
 * the web, saves and deletions go to the phone's queue first and are sent from there.
 */
export const bodyCheckInApi: BodyCheckInApi = {
  saveBodyMeasurement: async (payload: BodyCheckInPayload) =>
    bodyCheckInQueueActive()
      ? saveBodyCheckIn(payload)
      : apiSend<BodyMeasurement>('/api/body-measurements', 'POST', payload),
  deleteBodyMeasurement: async (id: string) =>
    bodyCheckInQueueActive()
      ? deleteBodyCheckIn(id)
      : apiSend<void>(`/api/body-measurements/${id}`, 'DELETE'),
  listBodyMeasurements: async () => localBodyMeasurements() ?? fetchBodyMeasurements(),
};

export const bodyGoalApi = {
  create: (payload: BodyWeightGoalInput) =>
    apiSend<BodyWeightGoal>('/api/body-weight-goals', 'POST', payload),
  update: (id: string, payload: BodyWeightGoalInput) =>
    apiSend<BodyWeightGoal>(`/api/body-weight-goals/${id}`, 'PUT', payload),
  remove: (id: string) => apiSend<void>(`/api/body-weight-goals/${id}`, 'DELETE'),
};

export const bodySizeApi = {
  save: (payload: BodySizeLog) => apiSend<BodySizeLog>('/api/body-sizes', 'PUT', payload),
  remove: (date: string) => apiSend<void>(`/api/body-sizes/${date}`, 'DELETE'),
};
