import { useQuery } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';
import { acceptedVideoName } from '../../../../frontend/src/videoSessions';
import type {
  ClipUploadStatus,
  Health,
  WorkoutSession,
  YouTubeConnection,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { newId } from '../../data/deviceStorage';
import { startClipUpload } from './clipUpload';

/** A clip picked on this phone, waiting to upload or uploading. */
export interface PhoneClip {
  clientId: string;
  uri: string;
  name: string;
  type: string;
  size: number | null;
  durationMs: number | null;
  exerciseLabel: string;
  status: ClipUploadStatus;
  progress: number;
  error?: string;
}

export const videoKeys = {
  youtube: ['videos', 'youtube'] as const,
  health: ['videos', 'health'] as const,
};

const session = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;

export const videoApi = {
  youtube: (signal?: AbortSignal) => apiGet<YouTubeConnection>('/api/youtube/connection', signal),
  disconnect: () => apiSend<YouTubeConnection>('/api/youtube/connection', 'DELETE'),
  health: (signal?: AbortSignal) => apiGet<Health>('/api/health', signal),
  get: (id: string) => apiGet<WorkoutSession>(session(id)),
  create: (payload: {
    name: string;
    workout_date: string;
    notes: string | null;
    expected_clip_count: number;
  }) => apiSend<WorkoutSession>('/api/sessions', 'POST', payload),
  process: (id: string) => apiSend<WorkoutSession>(`${session(id)}/process`, 'POST'),
  retryProcessing: (id: string) =>
    apiSend<WorkoutSession>(`${session(id)}/retry-processing`, 'POST'),
  retryYoutube: (id: string) =>
    apiSend<WorkoutSession>(`${session(id)}/retry-youtube-processing`, 'POST'),
  cancel: (id: string) => apiSend<WorkoutSession>(`${session(id)}/cancel`, 'POST'),
  remove: (id: string) => apiSend<void>(session(id), 'DELETE'),
  /** Streams one clip from its file, with the web's form fields; `stop` cancels it. */
  uploadClip: (
    sessionId: string,
    clip: PhoneClip,
    orderIndex: number,
    onProgress: (percent: number) => void,
    token?: string,
  ) =>
    token !== undefined
      ? startClipUpload(
          `${session(sessionId)}/clips`,
          { uri: clip.uri, name: clip.name, type: clip.type },
          {
            client_clip_id: clip.clientId,
            order_index: String(orderIndex),
            exercise_label: clip.exerciseLabel,
          },
          onProgress,
          token,
        )
      : startClipUpload(
          `${session(sessionId)}/clips`,
          { uri: clip.uri, name: clip.name, type: clip.type },
          {
            client_clip_id: clip.clientId,
            order_index: String(orderIndex),
            exercise_label: clip.exerciseLabel,
          },
          onProgress,
        ),
};

export function useYouTubeConnection() {
  return useQuery({
    queryKey: videoKeys.youtube,
    queryFn: ({ signal }) => videoApi.youtube(signal),
  });
}

export function useVideoHealth() {
  return useQuery({ queryKey: videoKeys.health, queryFn: ({ signal }) => videoApi.health(signal) });
}

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

/**
 * A picked or recorded video as a clip, or null when the server would refuse it. A camera
 * recording may have no file name, so one is made from its type.
 */
export function clipFromAsset(asset: ImagePickerAsset, index: number): PhoneClip | null {
  const type =
    asset.mimeType ??
    (asset.fileName?.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
  const extension = EXTENSIONS[type] ?? asset.uri.split('.').pop()?.toLowerCase() ?? 'mp4';
  const name = asset.fileName || `set-${index + 1}.${extension}`;
  if (!acceptedVideoName(name)) return null;
  return {
    clientId: newId(),
    uri: asset.uri,
    name,
    type,
    size: asset.fileSize ?? null,
    durationMs: asset.duration ?? null,
    exerciseLabel: '',
    status: 'waiting',
    progress: 0,
  };
}
