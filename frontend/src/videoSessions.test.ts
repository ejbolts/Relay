import { describe, expect, it } from 'vitest';
import type { WorkoutSession, YouTubeConnection } from './types';
import {
  acceptedVideoName,
  canDeleteSession,
  moveItem,
  newerSession,
  overallUploadProgress,
  sessionRetryLabel,
  sessionStatusDetail,
  sessionStatusText,
  youtubeAvailable,
  youtubeCallbackResult,
  youtubeConnectLabel,
  youtubePrivacyCopy,
  youtubeReady,
  youtubeStatusLabel,
} from './videoSessions';

const connection = (status: YouTubeConnection['status']): YouTubeConnection => ({
  status,
  channel_id: null,
  channel_title: null,
  channel_url: null,
  can_disconnect: true,
  message: '',
  privacy_status: 'unlisted',
});

describe('video sessions', () => {
  it('describes each session status', () => {
    expect(sessionStatusText('stitching')).toBe('Stitching your workout');
    expect(sessionStatusDetail('queued')).toMatch(/work will begin shortly/);
    expect(sessionStatusDetail('complete')).toBeNull();
  });

  it('allows deleting only sessions the server is not working on', () => {
    const session = { status: 'normalizing', youtube_video_id: null } as WorkoutSession;
    expect(canDeleteSession(null)).toBe(false);
    expect(canDeleteSession(session)).toBe(false);
    expect(canDeleteSession({ ...session, status: 'failed' })).toBe(true);
    expect(sessionRetryLabel(session)).toBe('Retry processing');
    expect(sessionRetryLabel({ ...session, youtube_video_id: 'abc' })).toBe('Check YouTube again');
  });

  it('accepts phone video files and tracks the batch upload', () => {
    expect(acceptedVideoName('Set 1.MOV')).toBe(true);
    expect(acceptedVideoName('clip.m4v')).toBe(true);
    expect(acceptedVideoName('photo.jpg')).toBe(false);
    expect(overallUploadProgress([])).toBe(0);
    expect(overallUploadProgress([{ progress: 100 }, { progress: 50 }])).toBe(75);
  });

  it('reorders clips', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('describes the YouTube connection', () => {
    expect(youtubeReady(connection('mock'))).toBe(true);
    expect(youtubeReady(connection('not_connected'))).toBe(false);
    expect(youtubeAvailable(connection('unavailable'))).toBe(false);
    expect(youtubeAvailable(connection('not_connected'))).toBe(true);
    expect(youtubeStatusLabel(null)).toBe('Checking connection…');
    expect(youtubeStatusLabel(connection('reconnect_required'))).toBe('Reconnect needed');
    expect(youtubeConnectLabel(connection('connected'))).toBe('Reconnect YouTube');
    expect(youtubeConnectLabel(connection('not_connected'))).toBe('Connect YouTube');
    expect(youtubePrivacyCopy('private').title).toBe('Your videos upload as Private');
    expect(youtubeCallbackResult('connected').confirmation).toBe(true);
    expect(youtubeCallbackResult('nonsense')).toEqual({
      message: youtubeCallbackResult('failed').message,
      confirmation: false,
    });
  });
});

describe('newerSession', () => {
  const at = (id: string, status: WorkoutSession['status']) => ({ id, status });
  it('never takes a finished session back, and ignores another session', () => {
    expect(newerSession(null, at('a', 'queued'))).toEqual(at('a', 'queued'));
    expect(newerSession(at('a', 'queued'), at('a', 'stitching'))).toEqual(at('a', 'stitching'));
    expect(newerSession(at('a', 'complete'), at('a', 'stitching'))).toEqual(at('a', 'complete'));
    expect(newerSession(at('a', 'failed'), at('a', 'queued'))).toEqual(at('a', 'failed'));
    expect(newerSession(at('a', 'queued'), at('b', 'complete'))).toEqual(at('a', 'queued'));
  });
});
