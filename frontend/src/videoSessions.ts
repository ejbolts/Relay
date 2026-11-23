import type { SessionStatus, WorkoutSession, YouTubeConnection } from './types';

// The videos tab's rules, shared by the web and the app: session progress words, which clips are
// accepted, and how the YouTube connection is described.

export const TERMINAL_SESSION_STATUSES: SessionStatus[] = ['complete', 'failed', 'cancelled'];
export const PROCESSING_SESSION_STATUSES: SessionStatus[] = [
  'queued',
  'normalizing',
  'stitching',
  'uploading_to_youtube',
  'youtube_processing',
];

/** How often a processing session is checked again. */
export const SESSION_POLL_MS = 2500;

export function sessionStatusText(status: SessionStatus): string {
  return {
    draft: 'Waiting for uploads',
    uploading: 'Uploading clips',
    upload_failed: 'Some uploads need attention',
    queued: 'Queued',
    normalizing: 'Normalizing videos',
    stitching: 'Stitching your workout',
    uploading_to_youtube: 'Uploading to YouTube',
    youtube_processing: 'YouTube is processing',
    complete: 'Complete',
    failed: 'Processing failed',
    cancelled: 'Cancelled',
  }[status];
}

/** What a session's status means for the person waiting on it; none once it is complete. */
export function sessionStatusDetail(status: SessionStatus): string | null {
  const details: Partial<Record<SessionStatus, string>> = {
    queued: 'Your complete batch is ready; work will begin shortly.',
    normalizing: 'Preparing each phone video for a consistent, 1080p MP4 output.',
    stitching: 'Joining sets in the order you selected.',
    uploading_to_youtube: 'Sending the combined video to your connected YouTube channel.',
    youtube_processing:
      'YouTube is preparing playback versions. Configure completion alerts in Settings.',
    draft: 'This batch was never started. Delete it if you no longer have the original clips.',
    uploading:
      'This batch has incomplete uploads. Re-select the original clips in a new session, or delete this batch.',
    upload_failed: 'An upload was rejected. Delete this incomplete batch before starting again.',
    failed: 'Review the error below, then retry processing or delete the batch.',
    cancelled:
      'This upload batch was cancelled. Any successful uploads remain on disk until you delete the session.',
  };
  return details[status] ?? null;
}

/** A session can be deleted unless the server is still working on it. */
export function canDeleteSession(session: WorkoutSession | null): boolean {
  return session !== null && !PROCESSING_SESSION_STATUSES.includes(session.status);
}

/** A failed session retries on YouTube once it reached YouTube, otherwise from processing. */
export function sessionRetryLabel(session: WorkoutSession): string {
  return session.youtube_video_id ? 'Check YouTube again' : 'Retry processing';
}

export const VIDEO_FILE_TYPES = 'MP4, MOV, and M4V';

/** Whether a clip's file name is a video the server accepts. */
export function acceptedVideoName(name: string): boolean {
  return /\.(mp4|mov|m4v)$/i.test(name);
}

/** The whole batch's upload progress, from each clip's percentage. */
export function overallUploadProgress(clips: { progress: number }[]): number {
  if (!clips.length) return 0;
  return Math.round(clips.reduce((sum, clip) => sum + clip.progress, 0) / clips.length);
}

/** Moves one clip to another place in the order, or leaves the list as it is. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Clips can be added once a channel is connected, or in the server's demo mode. */
export function youtubeReady(connection: YouTubeConnection | null): boolean {
  return connection?.status === 'connected' || connection?.status === 'mock';
}

/** Whether the server can connect a channel at all (not demo mode, and set up). */
export function youtubeAvailable(connection: YouTubeConnection | null): boolean {
  return !!connection && !['mock', 'unavailable'].includes(connection.status);
}

export function youtubeStatusLabel(connection: YouTubeConnection | null): string {
  if (!connection) return 'Checking connection…';
  switch (connection.status) {
    case 'connected':
      return 'Connected';
    case 'reconnect_required':
      return 'Reconnect needed';
    case 'mock':
      return 'Demo mode';
    case 'unavailable':
      return 'Setup needed';
    default:
      return 'Not connected';
  }
}

export function youtubeConnectLabel(connection: YouTubeConnection | null): string {
  return connection?.status === 'connected' || connection?.status === 'reconnect_required'
    ? 'Reconnect YouTube'
    : 'Connect YouTube';
}

export function youtubePrivacyCopy(privacy: YouTubeConnection['privacy_status']): {
  title: string;
  detail: string;
} {
  if (privacy === 'private')
    return {
      title: 'Your videos upload as Private',
      detail:
        'Only you and people you invite on YouTube can watch. A link alone does not give access.',
    };
  if (privacy === 'unlisted')
    return {
      title: 'Your videos upload as Unlisted',
      detail:
        "They aren't listed on your channel's Videos tab. Anyone with the link can watch and share them.",
    };
  return { title: 'Your videos upload as Public', detail: 'Anyone can find and watch them.' };
}

// After returning from Google; only these two are confirmations, the rest need action.
const CALLBACK_CONFIRMATIONS = new Set(['connected', 'cancelled']);
const CALLBACK_MESSAGES: Record<string, string> = {
  connected: 'YouTube connected. Your next upload will go to the channel shown below.',
  cancelled: 'Connection cancelled. Your previous connection has not changed.',
  expired: 'That connection link expired or belongs to another sign-in. Try connecting again.',
  permission: 'Allow the requested YouTube permission to upload and check your videos.',
  no_channel: 'Create a channel on YouTube first, then choose Connect YouTube again.',
  busy: 'A video is still processing. Reconnect its original channel, or wait before changing channels.',
  failed: 'Could not connect YouTube. Your previous connection has not changed. Try again.',
};

/** The message for the server's `?youtube=<result>` return from Google. */
export function youtubeCallbackResult(result: string): { message: string; confirmation: boolean } {
  return {
    message: CALLBACK_MESSAGES[result] ?? CALLBACK_MESSAGES.failed,
    confirmation: CALLBACK_CONFIRMATIONS.has(result),
  };
}

/**
 * The session to show after a status check. A reply for another session, or one that would take
 * a finished session (complete, failed or cancelled) back to an earlier state, is an older reply
 * that arrived late, so the current session stays.
 */
export function newerSession<T extends { id: string; status: SessionStatus }>(
  current: T | null,
  next: T,
): T {
  if (!current) return next;
  if (current.id !== next.id) return current;
  if (
    TERMINAL_SESSION_STATUSES.includes(current.status) &&
    !TERMINAL_SESSION_STATUSES.includes(next.status)
  )
    return current;
  return next;
}

/** Processing that the server reports as already started counts as started. */
export const ALREADY_PROCESSING_CODES = ['already_processing', 'already_complete'];
