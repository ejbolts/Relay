import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useSyncExternalStore } from 'react';
import type { WorkoutSession } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import {
  ALREADY_PROCESSING_CODES,
  moveItem,
  newerSession,
  PROCESSING_SESSION_STATUSES,
  SESSION_POLL_MS,
  TERMINAL_SESSION_STATUSES,
} from '../../../../frontend/src/videoSessions';
import { ApiError, serverOrigin } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { UploadStopped } from '../../data/uploadFile';
import { sessionEpoch } from '../../session/sessionEpoch';
import { useOptionalSession } from '../../session/SessionProvider';
import { errorMessage } from '../../ui/components';
import { showToast, toastAccount } from '../../ui/Toast';
import type { ClipTransfer } from './clipUpload';
import { videoApi, type PhoneClip } from './videoData';

export type VideoStep = 'upload' | 'progress' | 'processing' | 'complete';

/**
 * What the batch is doing with the server: creating its session, uploading clips, starting
 * processing (or reading back whether it started), or stopping. One runs at a time.
 */
export type VideoPhase = 'idle' | 'creating' | 'uploading' | 'starting' | 'stopping';

export interface VideoUploadState {
  step: VideoStep;
  name: string;
  date: string;
  notes: string;
  clips: PhoneClip[];
  session: WorkoutSession | null;
  phase: VideoPhase;
  busy: boolean;
  message: string | null;
  /** Every clip uploaded but the request to start processing failed: offer to start it again. */
  processFailed: boolean;
}

const STILL_UPLOADABLE: WorkoutSession['status'][] = ['draft', 'uploading', 'upload_failed'];
const UPLOAD_WAKE_LOCK_TAG = 'relay-video-upload';

/** The server has started work on the batch (or finished it), so it can't be cancelled. */
export const processingBegan = (status: WorkoutSession['status']) =>
  PROCESSING_SESSION_STATUSES.includes(status) || status === 'complete' || status === 'failed';

/**
 * A batch is uploading or waiting to start processing. Its session belongs to the connected
 * channel, and the server only refuses a channel change once processing has begun, so changing
 * or disconnecting the channel now would leave the clips unable to start.
 */
export function channelChangeBlocked(current: VideoUploadState): boolean {
  return (
    current.busy ||
    current.phase !== 'idle' ||
    (current.session !== null && STILL_UPLOADABLE.includes(current.session.status))
  );
}

function initialState(): VideoUploadState {
  return {
    step: 'upload',
    name: '',
    date: localDate(),
    notes: '',
    clips: [],
    session: null,
    phase: 'idle',
    busy: false,
    message: null,
    processFailed: false,
  };
}

let state: VideoUploadState = initialState();
const listeners = new Set<() => void>();

// Account & run ownership: every async step checks both `runId` and `sessionEpoch()` so signing
// out or switching accounts immediately stops transfers, releases the wake lock, and drops any
// late reply before it can touch the next account.
let ownerUserId: string | null = null;
let ownerEpoch: number | null = null;
let runId = 0;
let stopped = false;
const transfers = new Set<ClipTransfer>();

// Wake lock owned at app level so leaving Videos keeps the screen awake for the whole upload run.
// Each run gets a unique tag so a late activation from an earlier run can never drop a retry's lock.
let wakeLockRuns = 0;
let activeWakeLock: { tag: string; released: boolean } | null = null;

// Polling timer for the processing step, one request at a time.
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollingSessionId: string | null = null;
let pollingRunId = -1;

// The open Stop and discard question, answered with what was chosen so finishing clips never race.
let stopQuestion: {
  promise: Promise<'keep' | 'stop'>;
  settle: (choice: 'keep' | 'stop') => void;
} | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(
  updater: Partial<VideoUploadState> | ((current: VideoUploadState) => VideoUploadState),
) {
  const next = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
  if (next === state) return;
  state = next;
  syncWakeLock();
  syncPolling();
  emit();
}

function acquireWakeLock() {
  if (activeWakeLock) return;
  wakeLockRuns += 1;
  const entry = { tag: `${UPLOAD_WAKE_LOCK_TAG}-${wakeLockRuns}`, released: false };
  activeWakeLock = entry;
  void activateKeepAwakeAsync(entry.tag)
    .then(() => {
      if (entry.released) return deactivateKeepAwake(entry.tag);
    })
    .catch(() => {
      // Upload still works; wake locks are a best-effort guard only.
    });
}

function releaseWakeLock() {
  if (!activeWakeLock) return;
  const entry = activeWakeLock;
  activeWakeLock = null;
  entry.released = true;
  void deactivateKeepAwake(entry.tag).catch(() => undefined);
}

function syncWakeLock() {
  const active =
    state.phase === 'creating' || state.phase === 'uploading' || state.phase === 'starting';
  if (active) acquireWakeLock();
  else releaseWakeLock();
}

function clearPolling() {
  if (pollTimer !== undefined) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
  pollingSessionId = null;
  pollingRunId = -1;
}

function syncPolling() {
  const session = state.session;
  const shouldPoll =
    state.step === 'processing' &&
    session !== null &&
    !TERMINAL_SESSION_STATUSES.includes(session.status);
  if (!shouldPoll) {
    clearPolling();
    return;
  }
  if (pollingSessionId === session.id && pollingRunId === runId) return;
  clearPolling();
  const targetId = session.id;
  const myRun = runId;
  const myEpoch = sessionEpoch();
  pollingSessionId = targetId;
  pollingRunId = myRun;

  const schedule = () => {
    pollTimer = setTimeout(() => void check(), SESSION_POLL_MS);
  };

  const check = async () => {
    pollTimer = undefined;
    if (!isRunCurrent(myRun, myEpoch)) return;
    if (
      state.step !== 'processing' ||
      state.session?.id !== targetId ||
      TERMINAL_SESSION_STATUSES.includes(state.session.status)
    ) {
      clearPolling();
      return;
    }
    try {
      const next = await videoApi.get(targetId);
      if (!isRunCurrent(myRun, myEpoch)) return;
      if (state.step !== 'processing' || state.session?.id !== targetId) return;
      const merged = newerSession(state.session, next);
      setState((current) => ({
        ...current,
        session: merged,
        step: merged.status === 'complete' ? 'complete' : current.step,
      }));
      if (merged.status === 'complete' || TERMINAL_SESSION_STATUSES.includes(merged.status)) {
        clearPolling();
        return;
      }
    } catch (reason) {
      if (!isRunCurrent(myRun, myEpoch)) return;
      if (state.step !== 'processing' || state.session?.id !== targetId) return;
      setState({ message: errorMessage(reason) });
    }
    if (
      isRunCurrent(myRun, myEpoch) &&
      state.step === 'processing' &&
      state.session?.id === targetId &&
      !TERMINAL_SESSION_STATUSES.includes(state.session.status)
    ) {
      schedule();
    } else {
      clearPolling();
    }
  };

  schedule();
}

function stopActiveTransfers(markClipsFailed: boolean) {
  stopped = true;
  for (const transfer of transfers) transfer.stop();
  transfers.clear();
  if (!markClipsFailed) return;
  setState((current) => ({
    ...current,
    clips: current.clips.map((clip) =>
      clip.status === 'uploading' || clip.status === 'waiting'
        ? { ...clip, status: 'failed', error: 'Stopped.' }
        : clip,
    ),
  }));
}

function resolveStopQuestion(choice: 'keep' | 'stop') {
  const open = stopQuestion;
  stopQuestion = null;
  open?.settle(choice);
}

function abortAndReset(nextUserId: string | null, nextEpoch: number) {
  runId += 1;
  ownerUserId = nextUserId;
  ownerEpoch = nextEpoch;
  resolveStopQuestion('stop');
  clearPolling();
  stopActiveTransfers(false);
  releaseWakeLock();
  state = initialState();
  emit();
}

/**
 * Whether a run's async step may still touch the store: the same run, in the same session. A
 * stale step never resets the store itself once it has been rebound to the next session (by
 * VideoUploadSessionSync), so a late reply from one account can't clear the next one's upload.
 */
function isRunCurrent(myRun: number, myEpoch: number): boolean {
  if (sessionEpoch() === myEpoch) return myRun === runId;
  // The session ended and nothing has rebound the store yet: stop this account's run now.
  if (ownerEpoch === myEpoch) abortAndReset(null, sessionEpoch());
  return false;
}

function hasSessionState(): boolean {
  return (
    state.step !== 'upload' ||
    state.phase !== 'idle' ||
    state.busy ||
    state.session !== null ||
    state.clips.length > 0 ||
    state.name !== '' ||
    state.notes !== '' ||
    state.message !== null ||
    state.processFailed ||
    transfers.size > 0 ||
    activeWakeLock !== null
  );
}

/**
 * Binds the app-level upload store to the currently signed-in account and session epoch.
 * Signing out, switching accounts, or losing video upload permission immediately stops every
 * transfer, releases the wake lock, stops polling, and clears state so nothing leaks across accounts.
 */
export function syncVideoUploadSession(userId: string | null, allowed = true) {
  const epoch = sessionEpoch();
  if (!userId || !allowed) {
    if (ownerUserId !== null || ownerEpoch !== epoch || hasSessionState()) {
      abortAndReset(null, epoch);
    } else {
      ownerEpoch = epoch;
    }
    return;
  }
  if (
    (ownerUserId !== null && ownerUserId !== userId) ||
    (ownerEpoch !== null && ownerEpoch !== epoch)
  ) {
    abortAndReset(userId, epoch);
    return;
  }
  ownerUserId = userId;
  ownerEpoch = epoch;
}

/** Resets all store state (for tests). */
export function resetVideoUploadStore() {
  abortAndReset(null, sessionEpoch());
  ownerEpoch = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): VideoUploadState {
  return state;
}

const currentPhase = (): VideoPhase => state.phase;

export function useVideoUploadState(): VideoUploadState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const channelBlockedSnapshot = () => channelChangeBlocked(state);

/** Whether the YouTube channel must stay as it is for the batch in progress, wherever it's shown. */
export function useChannelChangeBlocked(): boolean {
  return useSyncExternalStore(subscribe, channelBlockedSnapshot);
}

/**
 * Mounts once at the root layout to keep video uploads bound to the active session even when
 * the Videos screen is not open.
 */
export function VideoUploadSessionSync() {
  const status = useOptionalSession()?.status;
  const userId = status?.kind === 'signed-in' ? status.user.id : null;
  const allowed = status?.kind === 'signed-in' ? status.user.can_upload_videos !== false : false;
  const epoch = sessionEpoch();

  useEffect(() => {
    syncVideoUploadSession(userId, allowed);
  }, [userId, allowed, epoch]);

  return null;
}

function updateClip(clientId: string, update: Partial<PhoneClip>) {
  setState((current) => ({
    ...current,
    clips: current.clips.map((clip) =>
      clip.clientId === clientId ? { ...clip, ...update } : clip,
    ),
  }));
}

function follow(next: WorkoutSession) {
  const nextStep: VideoStep =
    next.status === 'complete'
      ? 'complete'
      : !STILL_UPLOADABLE.includes(next.status)
        ? 'processing'
        : 'progress';
  setState({ session: next, step: nextStep });
}

async function captureBoundToken(): Promise<string | undefined> {
  try {
    return (await sessionToken(serverOrigin())) ?? undefined;
  } catch {
    return undefined;
  }
}

async function uploadClips(
  target: WorkoutSession,
  selected: PhoneClip[],
  concurrency: number,
  myRun: number,
  myEpoch: number,
  boundToken: string | undefined,
): Promise<boolean> {
  let next = 0;
  let failed = false;

  async function worker() {
    while (next < selected.length && !stopped && isRunCurrent(myRun, myEpoch)) {
      const clip = selected[next++];
      if (stopped || !isRunCurrent(myRun, myEpoch)) return;
      updateClip(clip.clientId, { status: 'uploading', progress: 0, error: undefined });
      const orderIndex = state.clips.findIndex((item) => item.clientId === clip.clientId);
      const transfer = videoApi.uploadClip(
        target.id,
        clip,
        orderIndex,
        (progress) => {
          if (!stopped && isRunCurrent(myRun, myEpoch)) {
            updateClip(clip.clientId, { progress });
          }
        },
        boundToken,
      );
      transfers.add(transfer);
      try {
        await transfer.done;
        if (!stopped && isRunCurrent(myRun, myEpoch)) {
          updateClip(clip.clientId, { status: 'uploaded', progress: 100 });
        }
      } catch (reason) {
        failed = true;
        // The captured token was refused (signed out elsewhere, or a new password): forget it, so
        // a retry doesn't keep sending it.
        if (reason instanceof ApiError && reason.status === 401 && boundToken)
          void forgetSessionTokenIf(serverOrigin(), boundToken).catch(() => undefined);
        if (stopped || reason instanceof UploadStopped || !isRunCurrent(myRun, myEpoch)) return;
        updateClip(clip.clientId, { status: 'failed', error: errorMessage(reason) });
      } finally {
        transfers.delete(transfer);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
  return !failed && !stopped && isRunCurrent(myRun, myEpoch);
}

/**
 * Starts processing the uploaded batch. When the answer is lost or refused, the session is read
 * back first: if the server already started it, the store follows it; otherwise Start processing
 * stays offered. Retrying asks the same session again, so it can't make another.
 */
async function beginProcessing(target: WorkoutSession, myRun: number, myEpoch: number) {
  if (!isRunCurrent(myRun, myEpoch)) return;
  setState({ phase: 'starting', processFailed: false });
  try {
    try {
      const started = await videoApi.process(target.id);
      if (isRunCurrent(myRun, myEpoch)) follow(started);
      return;
    } catch (reason) {
      if (!isRunCurrent(myRun, myEpoch)) return;
      const alreadyStarted =
        reason instanceof ApiError && ALREADY_PROCESSING_CODES.includes(reason.code ?? '');
      try {
        const latest = await videoApi.get(target.id);
        if (!isRunCurrent(myRun, myEpoch)) return;
        if (alreadyStarted || !STILL_UPLOADABLE.includes(latest.status)) {
          follow(latest);
          return;
        }
      } catch {
        // Still unreachable: offer Start processing again below.
      }
      setState({ processFailed: true, message: errorMessage(reason) });
    }
  } finally {
    if (isRunCurrent(myRun, myEpoch) && currentPhase() === 'starting') {
      setState({ phase: 'idle' });
    }
  }
}

/** Starts processing once any open Stop and discard question has been answered Keep. */
async function startWhenAnswered(target: WorkoutSession, myRun: number, myEpoch: number) {
  const question = stopQuestion?.promise;
  if (question && (await question) === 'stop') return;
  if (!isRunCurrent(myRun, myEpoch)) return;
  if (currentPhase() === 'uploading') await beginProcessing(target, myRun, myEpoch);
}

/**
 * Stops every upload, then cancels the session once the server confirms it, and with `discard`
 * deletes it and its clips too. If processing had already started, the session can't be cancelled:
 * the store follows its status instead. Resolves true once everything asked is done.
 */
async function stopAndCancel(target: WorkoutSession, discard: boolean): Promise<boolean> {
  const myRun = runId;
  const myEpoch = sessionEpoch();
  setState({ phase: 'stopping', processFailed: false, message: null });
  stopActiveTransfers(true);
  try {
    let cancelled: WorkoutSession;
    try {
      cancelled = await videoApi.cancel(target.id);
    } catch (reason) {
      if (!isRunCurrent(myRun, myEpoch)) return false;
      if (!(reason instanceof ApiError && reason.code === 'cannot_cancel')) {
        setState({ message: errorMessage(reason) });
        return false;
      }
      // Refused: read the session back to see why.
      let latest: WorkoutSession;
      try {
        latest = await videoApi.get(target.id);
      } catch (readFailure) {
        if (isRunCurrent(myRun, myEpoch)) setState({ message: errorMessage(readFailure) });
        return false;
      }
      if (!isRunCurrent(myRun, myEpoch)) return false;
      if (latest.id === target.id && latest.status === 'cancelled') {
        // An earlier cancel reached the server but its answer was lost: it is cancelled.
        cancelled = latest;
      } else if (processingBegan(latest.status)) {
        follow(latest);
        setState({ message: 'Processing had already started, so this session carries on.' });
        return false;
      } else {
        follow(latest);
        setState({ message: errorMessage(reason) });
        return false;
      }
    }
    if (!isRunCurrent(myRun, myEpoch)) return false;
    follow(cancelled);
    if (!discard) return true;
    try {
      await videoApi.remove(target.id);
    } catch (reason) {
      if (isRunCurrent(myRun, myEpoch)) {
        setState({
          message: `The session is cancelled but couldn’t be deleted. ${errorMessage(reason)}`,
        });
      }
      return false;
    }
    return isRunCurrent(myRun, myEpoch);
  } finally {
    if (isRunCurrent(myRun, myEpoch) && currentPhase() === 'stopping') {
      setState({ phase: 'idle' });
    }
  }
}

export const videoUploadActions = {
  setName(name: string) {
    setState({ name });
  },
  setDate(date: string) {
    setState({ date });
  },
  setNotes(notes: string) {
    setState({ notes });
  },
  setMessage(message: string | null) {
    setState({ message });
  },
  addClips(accepted: PhoneClip[]) {
    if (!accepted.length) return;
    setState((current) => ({ ...current, clips: [...current.clips, ...accepted] }));
  },
  setClipLabel(clientId: string, exerciseLabel: string) {
    updateClip(clientId, { exerciseLabel });
  },
  moveClip(from: number, to: number) {
    setState((current) => ({ ...current, clips: moveItem(current.clips, from, to) }));
  },
  removeClip(clientId: string) {
    setState((current) => ({
      ...current,
      clips: current.clips.filter((item) => item.clientId !== clientId),
    }));
  },

  async startUpload(concurrency: number, ready: boolean) {
    if (!state.name.trim() || !state.date || !state.clips.length || state.busy || !ready) return;
    if (state.phase !== 'idle') return;
    runId += 1;
    const myRun = runId;
    const myEpoch = sessionEpoch();
    ownerEpoch = myEpoch;
    stopped = false;
    setState({ busy: true, message: null, phase: 'creating' });
    try {
      const boundToken = await captureBoundToken();
      if (!isRunCurrent(myRun, myEpoch)) return;
      const created = await videoApi.create({
        name: state.name.trim(),
        workout_date: state.date,
        notes: state.notes.trim() || null,
        expected_clip_count: state.clips.length,
      });
      if (!isRunCurrent(myRun, myEpoch)) return;
      setState({ session: created, step: 'progress', phase: 'uploading' });
      const uploaded = await uploadClips(
        created,
        state.clips,
        concurrency,
        myRun,
        myEpoch,
        boundToken,
      );
      if (uploaded && isRunCurrent(myRun, myEpoch) && currentPhase() === 'uploading') {
        await startWhenAnswered(created, myRun, myEpoch);
      }
    } catch (reason) {
      if (isRunCurrent(myRun, myEpoch)) setState({ message: errorMessage(reason) });
    } finally {
      if (isRunCurrent(myRun, myEpoch)) {
        setState((current) => ({
          ...current,
          busy: false,
          phase:
            current.phase === 'creating' || current.phase === 'uploading' ? 'idle' : current.phase,
        }));
      }
    }
  },

  async retryFailedUploads(concurrency: number) {
    if (!state.session || state.busy || state.phase !== 'idle') return;
    const target = state.session;
    const myRun = runId;
    const myEpoch = sessionEpoch();
    stopped = false;
    setState({ busy: true, message: null, phase: 'uploading' });
    try {
      const boundToken = await captureBoundToken();
      if (!isRunCurrent(myRun, myEpoch)) return;
      const failed = state.clips.filter((clip) => clip.status === 'failed');
      const uploaded = await uploadClips(target, failed, concurrency, myRun, myEpoch, boundToken);
      if (uploaded && isRunCurrent(myRun, myEpoch) && currentPhase() === 'uploading') {
        await startWhenAnswered(target, myRun, myEpoch);
      }
    } finally {
      if (isRunCurrent(myRun, myEpoch)) {
        setState((current) => ({
          ...current,
          busy: false,
          phase: current.phase === 'uploading' ? 'idle' : current.phase,
        }));
      }
    }
  },

  async retryProcessingStart(target: WorkoutSession) {
    if (state.busy || state.phase !== 'idle') return;
    const myRun = runId;
    const myEpoch = sessionEpoch();
    setState({ busy: true, message: null });
    try {
      await beginProcessing(target, myRun, myEpoch);
    } finally {
      if (isRunCurrent(myRun, myEpoch)) setState({ busy: false });
    }
  },

  cancelSession() {
    // Waits for a start that is on its way, so the two never cross.
    if (!state.session || state.phase === 'starting' || state.phase === 'stopping') return;
    void stopAndCancel(state.session, false);
  },

  /**
   * Holds automatic processing start while the Stop and discard confirmation is open, so a clip
   * finishing behind the alert can never race the user's choice.
   */
  beginStopQuestion(): (choice: 'keep' | 'stop') => void {
    resolveStopQuestion('keep');
    let answer!: (choice: 'keep' | 'stop') => void;
    const promise = new Promise<'keep' | 'stop'>((resolve) => (answer = resolve));
    const entry = {
      promise,
      settle: (choice: 'keep' | 'stop') => {
        if (stopQuestion === entry) stopQuestion = null;
        answer(choice);
      },
    };
    stopQuestion = entry;
    return entry.settle;
  },

  async stopAndDiscard(target: WorkoutSession): Promise<boolean> {
    const latest = state.session;
    if (
      state.phase === 'starting' ||
      state.phase === 'stopping' ||
      !latest ||
      latest.id !== target.id ||
      !STILL_UPLOADABLE.includes(latest.status)
    ) {
      if (latest && processingBegan(latest.status)) {
        setState({ message: 'Processing had already started, so this session carries on.' });
      }
      return false;
    }
    const account = toastAccount();
    const myRun = runId;
    const myEpoch = sessionEpoch();
    const done = await stopAndCancel(target, true);
    if (!done || !isRunCurrent(myRun, myEpoch)) return false;
    videoUploadActions.reset();
    showToast('Upload discarded', undefined, { account });
    return true;
  },

  retryFailedSession() {
    const target = state.session;
    if (!target) return;
    const myRun = runId;
    const myEpoch = sessionEpoch();
    const retry = target.youtube_video_id ? videoApi.retryYoutube : videoApi.retryProcessing;
    void retry(target.id)
      .then((next) => {
        if (isRunCurrent(myRun, myEpoch)) setState({ session: next });
      })
      .catch((reason: unknown) => {
        if (isRunCurrent(myRun, myEpoch)) setState({ message: errorMessage(reason) });
      });
  },

  async deleteSession(target: WorkoutSession) {
    const myRun = runId;
    const myEpoch = sessionEpoch();
    setState({ busy: true, message: null });
    try {
      await videoApi.remove(target.id);
      if (isRunCurrent(myRun, myEpoch)) videoUploadActions.reset();
    } catch (reason) {
      if (isRunCurrent(myRun, myEpoch)) setState({ message: errorMessage(reason), busy: false });
    }
  },

  reset() {
    runId += 1;
    resolveStopQuestion('stop');
    clearPolling();
    stopActiveTransfers(false);
    releaseWakeLock();
    state = initialState();
    emit();
  },
};
