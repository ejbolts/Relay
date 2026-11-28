import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from './api';
import { COLOUR_THEMES, type ColourThemeId } from './appearanceChoices';
import { colourThemePreference } from './colourThemes';
import { partnerPalettes, type PartnerPalette } from './trainTogetherTheme';
import {
  inviteSecondsLeft,
  memberName,
  partnerAccessEnded,
  partnerAccessEndedNotice,
  partnerChangeRefusedNotice,
  partnerConflictNotice,
  partners as sessionPartners,
  PartnerWorkoutSync,
  partnerWriteRefused,
  trainTogetherNotice,
  type PartnerSyncState,
  type TrainExercise,
  type TrainInvite,
  type TrainMember,
  type TrainSession,
  type TrainTogetherRead,
} from './trainTogether';
import { TRAIN_TOGETHER_CHANGED } from './trainTogetherInvite';
import type { ActiveWorkoutDraft } from './workoutDraft';

const POLL_FALLBACK_MS = 20_000;

/**
 * Whether the server refused a partner workout edit (thin wrapper over the shared rule).
 * Transient failures (no response, 408, 429, and every 5xx) return false so they stay retryable.
 */
export function isPartnerWriteRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return partnerWriteRefused(error.status || undefined, error.code);
}

export interface TrainTogetherController {
  read: TrainTogetherRead | null;
  session: TrainSession | null;
  partners: TrainMember[];
  invite: TrainInvite | null;
  inviteSeconds: number;
  loading: boolean;
  creatingInvite: boolean;
  joining: boolean;
  leaving: boolean;
  /** The partner user ids that joined during this browser session (for finite join pulse). */
  recentlyJoinedIds: ReadonlySet<string>;
  /** Per-partner sync state for partner-mode edits. */
  partnerSyncStates: Readonly<Record<string, PartnerSyncState>>;
  /** Last server-acknowledged draft per partner (so unsent ticks render pending, not saved). */
  partnerAcknowledgedDrafts: Readonly<Record<string, ActiveWorkoutDraft | null>>;
  /** Monotonic conflict count per partner, incremented each time a partner write is not applied. */
  partnerConflictCounts: Readonly<Record<string, number>>;
  /** Extra exercise definitions loaded via partner picker or write responses, keyed by partner id. */
  partnerExercisesByUser: Readonly<Record<string, ReadonlyMap<string, TrainExercise>>>;
  /** Movement keys added by the current viewer in partner mode (so only those show Remove). */
  viewerAddedMovements: Readonly<Record<string, ReadonlySet<string>>>;
  refresh: (options?: { silent?: boolean }) => Promise<TrainTogetherRead | null>;
  createInvite: () => Promise<TrainInvite | null>;
  join: (token: string) => Promise<TrainTogetherRead | null>;
  leave: () => Promise<void>;
  clearInvite: () => void;
  editPartnerWorkout: (
    partnerId: string,
    change: (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft,
    addedExercise?: { movementKey: string; exercise: TrainExercise },
  ) => Promise<void>;
  retryPartnerSync: (partnerId: string) => Promise<void>;
  registerPartnerExercises: (partnerId: string, exercises: TrainExercise[]) => void;
}

function isOwnEndNotice(next: TrainTogetherRead, userId: string): boolean {
  const ended = next.ended;
  if (!ended || ended.by_user_id !== userId) return false;
  return ended.reason === 'left' || ended.reason === 'finished' || ended.reason === 'discarded';
}

function pruneRecord<T>(
  current: Record<string, T>,
  keepIds: ReadonlySet<string>,
): Record<string, T> {
  let pruned = false;
  const next: Record<string, T> = {};
  for (const [id, value] of Object.entries(current)) {
    if (keepIds.has(id)) next[id] = value;
    else pruned = true;
  }
  return pruned ? next : current;
}

export function useTrainTogether(
  userId: string | null,
  onNotice?: (message: string) => void,
  options?: {
    confirmed?: boolean;
    onErrorNotice?: (message: string) => void;
    onPartnerRetired?: (partnerId: string) => void;
  },
): TrainTogetherController {
  const confirmed = options?.confirmed ?? true;
  const [read, setRead] = useState<TrainTogetherRead | null>(null);
  const [invite, setInvite] = useState<TrainInvite | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [recentlyJoinedIds, setRecentlyJoinedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [partnerSyncStates, setPartnerSyncStates] = useState<Record<string, PartnerSyncState>>({});
  const [partnerAcknowledgedDrafts, setPartnerAcknowledgedDrafts] = useState<
    Record<string, ActiveWorkoutDraft | null>
  >({});
  const [partnerConflictCounts, setPartnerConflictCounts] = useState<Record<string, number>>({});
  const [partnerExercisesByUser, setPartnerExercisesByUser] = useState<
    Record<string, ReadonlyMap<string, TrainExercise>>
  >({});
  const [viewerAddedMovements, setViewerAddedMovements] = useState<
    Record<string, ReadonlySet<string>>
  >({});

  const activeUserRef = useRef<string | null>(userId);
  const confirmedRef = useRef<boolean>(confirmed);
  confirmedRef.current = confirmed;
  const generationRef = useRef(0);
  const readSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const inviteGenRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const previousReadRef = useRef<TrainTogetherRead | null>(null);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const onErrorNoticeRef = useRef(options?.onErrorNotice);
  onErrorNoticeRef.current = options?.onErrorNotice;
  const onPartnerRetiredRef = useRef(options?.onPartnerRetired);
  onPartnerRetiredRef.current = options?.onPartnerRetired;
  const refreshRef = useRef<
    ((options?: { silent?: boolean }) => Promise<TrainTogetherRead | null>) | null
  >(null);

  const syncsRef = useRef<Map<string, PartnerWorkoutSync>>(new Map());
  const partnerNamesRef = useRef<Map<string, string>>(new Map());
  const joinPulseTimerRef = useRef<number | null>(null);

  const stopAllSyncs = useCallback(() => {
    for (const sync of syncsRef.current.values()) sync.stop();
    syncsRef.current.clear();
    partnerNamesRef.current.clear();
    setPartnerSyncStates((current) => (Object.keys(current).length ? {} : current));
    setPartnerAcknowledgedDrafts((current) => (Object.keys(current).length ? {} : current));
    setPartnerConflictCounts((current) => (Object.keys(current).length ? {} : current));
    setPartnerExercisesByUser((current) => (Object.keys(current).length ? {} : current));
    setViewerAddedMovements((current) => (Object.keys(current).length ? {} : current));
  }, []);

  const mergePartnerExercises = useCallback((partnerId: string, list: TrainExercise[]) => {
    if (!list.length) return;
    setPartnerExercisesByUser((current) => {
      const existing = current[partnerId];
      let changed = !existing;
      const nextMap = new Map(existing);
      for (const item of list) {
        const prev = nextMap.get(item.id);
        if (
          !prev ||
          prev.name !== item.name ||
          prev.same_as_exercise_id !== item.same_as_exercise_id
        ) {
          nextMap.set(item.id, item);
          changed = true;
        }
      }
      return changed ? { ...current, [partnerId]: nextMap } : current;
    });
  }, []);

  const reconcilePartnerSyncs = useCallback(
    (session: TrainSession | null, expectedGen: number) => {
      const currentPartners = sessionPartners(session);
      const activeWorkoutIds = new Set(
        currentPartners.filter((member) => member.workout !== null).map((member) => member.user_id),
      );
      const activePartnerIds = new Set(currentPartners.map((member) => member.user_id));

      for (const [partnerId, sync] of syncsRef.current.entries()) {
        if (!activeWorkoutIds.has(partnerId)) {
          sync.stop();
          syncsRef.current.delete(partnerId);
        }
      }
      for (const partnerId of [...partnerNamesRef.current.keys()]) {
        if (!activePartnerIds.has(partnerId)) partnerNamesRef.current.delete(partnerId);
      }

      setPartnerSyncStates((current) => pruneRecord(current, activeWorkoutIds));
      setPartnerAcknowledgedDrafts((current) => pruneRecord(current, activeWorkoutIds));
      setPartnerConflictCounts((current) => pruneRecord(current, activeWorkoutIds));
      setPartnerExercisesByUser((current) => pruneRecord(current, activeWorkoutIds));
      setViewerAddedMovements((current) => pruneRecord(current, activeWorkoutIds));

      for (const partner of currentPartners) {
        const partnerId = partner.user_id;
        partnerNamesRef.current.set(partnerId, memberName(partner));
        const workout = partner.workout;
        if (!workout) continue;

        if (workout.exercises.length) {
          mergePartnerExercises(partnerId, workout.exercises);
        }
        const existing = syncsRef.current.get(partnerId);
        if (existing) {
          const prevSessionId = existing.current.draft?.clientSessionId;
          const nextSessionId = workout.draft.clientSessionId;
          if (prevSessionId && nextSessionId && prevSessionId !== nextSessionId) {
            setViewerAddedMovements((current) => {
              if (!(partnerId in current)) return current;
              const next = { ...current };
              delete next[partnerId];
              return next;
            });
          }
          existing.refresh({ revision: workout.revision, draft: workout.draft });
          if (
            (existing.current.status === 'synced' || existing.current.status === 'conflict') &&
            !existing.unsent
          ) {
            setPartnerAcknowledgedDrafts((prev) =>
              prev[partnerId] === existing.current.draft
                ? prev
                : { ...prev, [partnerId]: existing.current.draft },
            );
          }
        } else {
          const sync = new PartnerWorkoutSync(
            {
              put: (change) => api.trainTogether.changePartnerWorkout(partnerId, change),
              changed: (state) => {
                if (generationRef.current !== expectedGen) return;
                if (state.status === 'failed' && isPartnerWriteRefusal(state.error)) {
                  const apiError = state.error as ApiError;
                  const activeSync = syncsRef.current.get(partnerId);
                  activeSync?.stop();
                  syncsRef.current.delete(partnerId);
                  setPartnerSyncStates((prev) => {
                    if (!(partnerId in prev)) return prev;
                    const next = { ...prev };
                    delete next[partnerId];
                    return next;
                  });
                  const notifyError = onErrorNoticeRef.current ?? onNoticeRef.current;
                  if (partnerAccessEnded(apiError.code)) {
                    setPartnerAcknowledgedDrafts((prev) => {
                      if (!(partnerId in prev)) return prev;
                      const next = { ...prev };
                      delete next[partnerId];
                      return next;
                    });
                    setPartnerConflictCounts((prev) => {
                      if (!(partnerId in prev)) return prev;
                      const next = { ...prev };
                      delete next[partnerId];
                      return next;
                    });
                    setPartnerExercisesByUser((prev) => {
                      if (!(partnerId in prev)) return prev;
                      const next = { ...prev };
                      delete next[partnerId];
                      return next;
                    });
                    setViewerAddedMovements((prev) => {
                      if (!(partnerId in prev)) return prev;
                      const next = { ...prev };
                      delete next[partnerId];
                      return next;
                    });
                    const name = partnerNamesRef.current.get(partnerId) ?? 'Your partner';
                    notifyError?.(partnerAccessEndedNotice(name));
                    onPartnerRetiredRef.current?.(partnerId);
                  } else {
                    // Refused change: discard it, stay in the partner's logger, reset focused
                    // fields back to the server's copy, and reload so a fresh queue starts clean.
                    setPartnerConflictCounts((prev) => ({
                      ...prev,
                      [partnerId]: (prev[partnerId] ?? 0) + 1,
                    }));
                    notifyError?.(partnerChangeRefusedNotice(apiError.message));
                  }
                  void refreshRef.current?.({ silent: true });
                  return;
                }
                setPartnerSyncStates((prev) => ({ ...prev, [partnerId]: state }));
                if ((state.status === 'synced' || state.status === 'conflict') && !sync.unsent) {
                  setPartnerAcknowledgedDrafts((prev) => ({ ...prev, [partnerId]: state.draft }));
                }
                if (state.exercises?.length) {
                  mergePartnerExercises(partnerId, state.exercises);
                }
                if (state.status === 'conflict' && state.notApplied) {
                  setPartnerConflictCounts((prev) => ({
                    ...prev,
                    [partnerId]: (prev[partnerId] ?? 0) + 1,
                  }));
                  const name = partnerNamesRef.current.get(partnerId) ?? 'Your partner';
                  onNoticeRef.current?.(partnerConflictNotice(name));
                }
              },
            },
            { revision: workout.revision, draft: workout.draft },
          );
          syncsRef.current.set(partnerId, sync);
          setPartnerSyncStates((prev) => ({ ...prev, [partnerId]: sync.current }));
          setPartnerAcknowledgedDrafts((prev) => ({ ...prev, [partnerId]: workout.draft }));
        }
      }
    },
    [mergePartnerExercises],
  );

  const applyRead = useCallback(
    (
      next: TrainTogetherRead,
      expectedGen: number,
      expectedUser: string,
      seq: number,
      options: { suppressNotice?: boolean } = {},
    ): boolean => {
      if (generationRef.current !== expectedGen || activeUserRef.current !== expectedUser) {
        return false;
      }
      if (seq <= appliedSeqRef.current) return false;
      if (next.session) {
        const self = next.session.members.find((member) => member.is_self);
        if (!self || self.user_id !== expectedUser) return false;
      }
      appliedSeqRef.current = seq;
      const previous = previousReadRef.current;
      previousReadRef.current = next;
      const prevSessionId = sessionIdRef.current;
      const nextSessionId = next.session?.id ?? null;
      sessionIdRef.current = nextSessionId;
      // Avoid churning React state when there is no session before or after this read.
      if (previous?.session == null && next.session === null) {
        if (nextSessionId !== prevSessionId) inviteGenRef.current += 1;
        setInvite((current) => (current ? null : current));
        if (syncsRef.current.size > 0) reconcilePartnerSyncs(null, expectedGen);
        return true;
      }
      setRead(next);

      const prevPartners = new Set(sessionPartners(previous?.session).map((m) => m.user_id));
      const nextPartners = sessionPartners(next.session);
      const newlyJoined = nextPartners
        .filter((m) => !prevPartners.has(m.user_id))
        .map((m) => m.user_id);

      if (nextSessionId !== prevSessionId) {
        inviteGenRef.current += 1;
        setInvite((current) =>
          current && nextSessionId !== null && current.session_id === nextSessionId
            ? current
            : null,
        );
      }

      if (newlyJoined.length > 0 && previous !== null) {
        // An invite was consumed by someone joining; clear the cached single-use token.
        setInvite((current) =>
          current && (!next.session || current.session_id === next.session.id) ? null : current,
        );
        setRecentlyJoinedIds(new Set(newlyJoined));
        if (joinPulseTimerRef.current !== null) window.clearTimeout(joinPulseTimerRef.current);
        joinPulseTimerRef.current = window.setTimeout(() => {
          if (generationRef.current !== expectedGen) return;
          setRecentlyJoinedIds(new Set());
          joinPulseTimerRef.current = null;
        }, 1600);
      }
      if (!next.session) {
        inviteGenRef.current += 1;
        setInvite(null);
      }

      reconcilePartnerSyncs(next.session, expectedGen);

      if (!options.suppressNotice && !isOwnEndNotice(next, expectedUser)) {
        const notice = trainTogetherNotice(previous, next);
        if (notice) onNoticeRef.current?.(notice);
      }
      return true;
    },
    [reconcilePartnerSyncs],
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean }): Promise<TrainTogetherRead | null> => {
      const currentUser = activeUserRef.current;
      if (!currentUser || !confirmedRef.current) return null;
      const gen = generationRef.current;
      const seq = ++readSeqRef.current;
      try {
        const next = await api.trainTogether.read();
        if (generationRef.current !== gen || activeUserRef.current !== currentUser) return null;
        const applied = applyRead(next, gen, currentUser, seq, {
          suppressNotice: options?.silent,
        });
        return applied ? next : null;
      } catch {
        return null;
      }
    },
    [applyRead],
  );
  refreshRef.current = refresh;

  // Reset cleanly on sign-out, account switch, or unmount; stop all syncs and drop in-flight work.
  useEffect(() => {
    const syncs = syncsRef.current;
    const partnerNames = partnerNamesRef.current;
    const accountChanged = activeUserRef.current !== userId;
    activeUserRef.current = userId;
    if (accountChanged) {
      generationRef.current += 1;
      readSeqRef.current = 0;
      appliedSeqRef.current = 0;
      inviteGenRef.current += 1;
      sessionIdRef.current = null;
      previousReadRef.current = null;
      setRead(null);
      setInvite(null);
      setRecentlyJoinedIds((current) => (current.size ? new Set() : current));
      stopAllSyncs();
      if (joinPulseTimerRef.current !== null) {
        window.clearTimeout(joinPulseTimerRef.current);
        joinPulseTimerRef.current = null;
      }
    }
    return () => {
      generationRef.current += 1;
      activeUserRef.current = null;
      inviteGenRef.current += 1;
      sessionIdRef.current = null;
      for (const sync of syncs.values()) sync.stop();
      syncs.clear();
      partnerNames.clear();
      if (joinPulseTimerRef.current !== null) {
        window.clearTimeout(joinPulseTimerRef.current);
        joinPulseTimerRef.current = null;
      }
    };
  }, [userId, stopAllSyncs]);

  // Initial read once the account is confirmed.
  useEffect(() => {
    if (!userId || !confirmed) return;
    void refresh();
  }, [userId, confirmed, refresh]);

  // Refresh on presence socket events, visibility return, and reconnect.
  useEffect(() => {
    if (!userId || !confirmed) return;
    const onWake = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener(TRAIN_TOGETHER_CHANGED, onWake);
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(TRAIN_TOGETHER_CHANGED, onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, confirmed, refresh]);

  // 20-second fallback poll while in a session or waiting for an invite to be scanned.
  const hasSessionOrInvite = Boolean(read?.session || invite);
  useEffect(() => {
    if (!userId || !confirmed || !hasSessionOrInvite) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_FALLBACK_MS);
    return () => window.clearInterval(timer);
  }, [userId, confirmed, hasSessionOrInvite, refresh]);

  // 1-second tick for the invite countdown while an invite is active.
  useEffect(() => {
    if (!invite) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [invite]);

  const inviteSeconds = useMemo(
    () => (invite ? inviteSecondsLeft(invite.expires_at, now) : 0),
    [invite, now],
  );

  // Drop expired invite automatically so the entry pill returns to "Train together" when closed.
  useEffect(() => {
    if (invite && inviteSeconds <= 0) {
      setInvite(null);
    }
  }, [invite, inviteSeconds]);

  const createInvite = useCallback(async (): Promise<TrainInvite | null> => {
    const currentUser = activeUserRef.current;
    if (!currentUser) return null;
    const gen = generationRef.current;
    const inviteGen = inviteGenRef.current;
    setCreatingInvite(true);
    try {
      const created = await api.trainTogether.invite();
      if (
        generationRef.current !== gen ||
        activeUserRef.current !== currentUser ||
        inviteGenRef.current !== inviteGen
      ) {
        return null;
      }
      // Invalidate any session read that was in flight before this invite completed.
      appliedSeqRef.current = ++readSeqRef.current;
      const replacedSession =
        sessionIdRef.current !== null && sessionIdRef.current !== created.session_id;
      sessionIdRef.current = created.session_id;
      if (previousReadRef.current === null) {
        previousReadRef.current = { session: null, ended: null };
      }
      if (replacedSession) {
        setRead((current) =>
          current?.session && current.session.id !== created.session_id
            ? { session: null, ended: current.ended }
            : current,
        );
      }
      setInvite(created);
      setNow(Date.now());
      // Refresh session state without suppressing real partner join/leave notices.
      void refresh();
      return created;
    } catch (reason) {
      if (generationRef.current !== gen || activeUserRef.current !== currentUser) return null;
      throw reason;
    } finally {
      if (generationRef.current === gen) setCreatingInvite(false);
    }
  }, [refresh]);

  const join = useCallback(
    async (token: string): Promise<TrainTogetherRead | null> => {
      const currentUser = activeUserRef.current;
      if (!currentUser) throw new Error('Sign in to train together.');
      const gen = generationRef.current;
      setJoining(true);
      try {
        const next = await api.trainTogether.join(token);
        if (generationRef.current !== gen || activeUserRef.current !== currentUser) return null;
        // If previousReadRef was still null (e.g. link opened right on sign-in), treat previous as empty
        // so join always produces the "Training with {Name}" confirmation toast.
        if (previousReadRef.current === null) {
          previousReadRef.current = { session: null, ended: null };
        }
        const seq = ++readSeqRef.current;
        const applied = applyRead(next, gen, currentUser, seq);
        return applied ? next : null;
      } catch (reason) {
        if (generationRef.current !== gen || activeUserRef.current !== currentUser) return null;
        throw reason;
      } finally {
        if (generationRef.current === gen) setJoining(false);
      }
    },
    [applyRead],
  );

  const leavingRef = useRef(false);
  const leave = useCallback(async (): Promise<void> => {
    const currentUser = activeUserRef.current;
    if (!currentUser || leavingRef.current) return;
    leavingRef.current = true;
    inviteGenRef.current += 1;
    const gen = generationRef.current;
    setLeaving(true);
    try {
      const next = await api.trainTogether.leave();
      if (generationRef.current !== gen || activeUserRef.current !== currentUser) return;
      inviteGenRef.current += 1;
      setInvite(null);
      const seq = ++readSeqRef.current;
      applyRead(next, gen, currentUser, seq, { suppressNotice: true });
    } catch (reason) {
      if (generationRef.current !== gen || activeUserRef.current !== currentUser) return;
      throw reason;
    } finally {
      leavingRef.current = false;
      if (generationRef.current === gen) setLeaving(false);
    }
  }, [applyRead]);

  const editPartnerWorkout = useCallback(
    async (
      partnerId: string,
      change: (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft,
      addedExercise?: { movementKey: string; exercise: TrainExercise },
    ) => {
      const sync = syncsRef.current.get(partnerId);
      if (!sync) return;
      if (addedExercise) {
        mergePartnerExercises(partnerId, [addedExercise.exercise]);
        setViewerAddedMovements((current) => {
          const nextSet = new Set(current[partnerId]);
          nextSet.add(addedExercise.movementKey);
          return { ...current, [partnerId]: nextSet };
        });
      }
      await sync.edit(change);
    },
    [mergePartnerExercises],
  );

  const retryPartnerSync = useCallback(async (partnerId: string) => {
    const sync = syncsRef.current.get(partnerId);
    if (!sync) return;
    await sync.retry();
  }, []);

  const clearInvite = useCallback(() => setInvite(null), []);

  const session = read?.session ?? null;
  const currentPartners = useMemo(() => sessionPartners(session), [session]);

  return useMemo(
    () => ({
      read,
      session,
      partners: currentPartners,
      invite,
      inviteSeconds,
      loading: false,
      creatingInvite,
      joining,
      leaving,
      recentlyJoinedIds,
      partnerSyncStates,
      partnerAcknowledgedDrafts,
      partnerConflictCounts,
      partnerExercisesByUser,
      viewerAddedMovements,
      refresh,
      createInvite,
      join,
      leave,
      clearInvite,
      editPartnerWorkout,
      retryPartnerSync,
      registerPartnerExercises: mergePartnerExercises,
    }),
    [
      read,
      session,
      currentPartners,
      invite,
      inviteSeconds,
      creatingInvite,
      joining,
      leaving,
      recentlyJoinedIds,
      partnerSyncStates,
      partnerAcknowledgedDrafts,
      partnerConflictCounts,
      partnerExercisesByUser,
      viewerAddedMovements,
      refresh,
      createInvite,
      join,
      leave,
      clearInvite,
      editPartnerWorkout,
      retryPartnerSync,
      mergePartnerExercises,
    ],
  );
}

function readThemeState(): { themeId: ColourThemeId; lightMode: boolean } {
  if (typeof document === 'undefined') return { themeId: 'blue', lightMode: false };
  const rawTheme = document.documentElement.dataset.colourTheme;
  const themeId =
    COLOUR_THEMES.find((entry) => entry.id === rawTheme)?.id ?? colourThemePreference();
  return { themeId, lightMode: document.documentElement.dataset.colourMode === 'light' };
}

/** Reactively derives partner colour palettes from the active Relay theme and light/dark mode. */
export function usePartnerPalettes(count: number): PartnerPalette[] {
  const [themeState, setThemeState] = useState(readThemeState);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setThemeState(readThemeState()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-colour-theme', 'data-colour-mode'],
    });
    return () => observer.disconnect();
  }, []);

  return useMemo(
    () => partnerPalettes(themeState.themeId, count, themeState.lightMode),
    [themeState.themeId, themeState.lightMode, count],
  );
}
