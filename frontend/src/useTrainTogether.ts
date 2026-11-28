import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import {
  inviteSecondsLeft,
  memberName,
  partnerConflictNotice,
  partners as sessionPartners,
  PartnerWorkoutSync,
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
  /** Extra exercise definitions loaded via partner picker or write responses, keyed by partner id. */
  partnerExercisesByUser: Readonly<Record<string, ReadonlyMap<string, TrainExercise>>>;
  /** Movement keys added by the current viewer in partner mode (so only those show Remove). */
  viewerAddedMovements: Readonly<Record<string, ReadonlySet<string>>>;
  refresh: (options?: { silent?: boolean }) => Promise<TrainTogetherRead | null>;
  createInvite: () => Promise<TrainInvite | null>;
  join: (token: string) => Promise<TrainTogetherRead>;
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

export function useTrainTogether(
  userId: string | null,
  onNotice?: (message: string) => void,
): TrainTogetherController {
  const [read, setRead] = useState<TrainTogetherRead | null>(null);
  const [invite, setInvite] = useState<TrainInvite | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [recentlyJoinedIds, setRecentlyJoinedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [partnerSyncStates, setPartnerSyncStates] = useState<Record<string, PartnerSyncState>>({});
  const [partnerAcknowledgedDrafts, setPartnerAcknowledgedDrafts] = useState<
    Record<string, ActiveWorkoutDraft | null>
  >({});
  const [partnerExercisesByUser, setPartnerExercisesByUser] = useState<
    Record<string, ReadonlyMap<string, TrainExercise>>
  >({});
  const [viewerAddedMovements, setViewerAddedMovements] = useState<
    Record<string, ReadonlySet<string>>
  >({});

  const activeUserRef = useRef<string | null>(userId);
  const generationRef = useRef(0);
  const previousReadRef = useRef<TrainTogetherRead | null>(null);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  const syncsRef = useRef<Map<string, PartnerWorkoutSync>>(new Map());
  const partnerNamesRef = useRef<Map<string, string>>(new Map());
  const joinPulseTimerRef = useRef<number | null>(null);

  const stopAllSyncs = useCallback(() => {
    for (const sync of syncsRef.current.values()) sync.stop();
    syncsRef.current.clear();
    setPartnerSyncStates({});
    setPartnerAcknowledgedDrafts({});
    setPartnerExercisesByUser({});
    setViewerAddedMovements({});
  }, []);

  const mergePartnerExercises = useCallback((partnerId: string, list: TrainExercise[]) => {
    if (!list.length) return;
    setPartnerExercisesByUser((current) => {
      const existing = current[partnerId];
      let changed = !existing;
      const nextMap = new Map(existing);
      for (const item of list) {
        const prev = nextMap.get(item.id);
        if (!prev || prev.name !== item.name || prev.same_as_exercise_id !== item.same_as_exercise_id) {
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
      const activeIds = new Set(currentPartners.map((member) => member.user_id));

      for (const [partnerId, sync] of syncsRef.current.entries()) {
        if (!activeIds.has(partnerId)) {
          sync.stop();
          syncsRef.current.delete(partnerId);
          partnerNamesRef.current.delete(partnerId);
        }
      }

      setPartnerSyncStates((current) => {
        let pruned = false;
        const next: Record<string, PartnerSyncState> = {};
        for (const [id, state] of Object.entries(current)) {
          if (activeIds.has(id)) next[id] = state;
          else pruned = true;
        }
        return pruned ? next : current;
      });

      setPartnerAcknowledgedDrafts((current) => {
        let pruned = false;
        const next: Record<string, ActiveWorkoutDraft | null> = {};
        for (const [id, draft] of Object.entries(current)) {
          if (activeIds.has(id)) next[id] = draft;
          else pruned = true;
        }
        return pruned ? next : current;
      });

      for (const partner of currentPartners) {
        const partnerId = partner.user_id;
        partnerNamesRef.current.set(partnerId, memberName(partner));
        const workout = partner.workout;
        if (workout?.exercises.length) {
          mergePartnerExercises(partnerId, workout.exercises);
        }
        const existing = syncsRef.current.get(partnerId);
        if (!workout) {
          if (existing) {
            existing.refresh({ revision: existing.current.revision + 1, draft: null });
          }
          setPartnerAcknowledgedDrafts((prev) =>
            prev[partnerId] === null ? prev : { ...prev, [partnerId]: null },
          );
          continue;
        }
        if (existing) {
          existing.refresh({ revision: workout.revision, draft: workout.draft });
          if (!existing.unsent) {
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
                setPartnerSyncStates((prev) => ({ ...prev, [partnerId]: state }));
                if (state.status === 'synced' || state.status === 'conflict') {
                  setPartnerAcknowledgedDrafts((prev) => ({ ...prev, [partnerId]: state.draft }));
                }
                if (state.exercises?.length) {
                  mergePartnerExercises(partnerId, state.exercises);
                }
                if (state.status === 'conflict' && state.notApplied) {
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
      options: { suppressNotice?: boolean } = {},
    ) => {
      if (generationRef.current !== expectedGen || activeUserRef.current !== expectedUser) return;
      const previous = previousReadRef.current;
      previousReadRef.current = next;
      setRead(next);

      const prevPartners = new Set(sessionPartners(previous?.session).map((m) => m.user_id));
      const nextPartners = sessionPartners(next.session);
      const newlyJoined = nextPartners
        .filter((m) => !prevPartners.has(m.user_id))
        .map((m) => m.user_id);

      if (newlyJoined.length > 0 && previous !== null) {
        // An invite was consumed by someone joining; clear the cached single-use token.
        setInvite((current) =>
          current && (!next.session || current.session_id === next.session.id) ? null : current,
        );
        setRecentlyJoinedIds(new Set(newlyJoined));
        if (joinPulseTimerRef.current !== null) window.clearTimeout(joinPulseTimerRef.current);
        joinPulseTimerRef.current = window.setTimeout(() => {
          setRecentlyJoinedIds(new Set());
          joinPulseTimerRef.current = null;
        }, 1600);
      }
      if (!next.session) {
        setInvite(null);
      }

      reconcilePartnerSyncs(next.session, expectedGen);

      if (!options.suppressNotice && !isOwnEndNotice(next, expectedUser)) {
        const notice = trainTogetherNotice(previous, next);
        if (notice) onNoticeRef.current?.(notice);
      }
    },
    [reconcilePartnerSyncs],
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean }): Promise<TrainTogetherRead | null> => {
      const currentUser = activeUserRef.current;
      if (!currentUser) return null;
      const gen = generationRef.current;
      setLoading(true);
      try {
        const next = await api.trainTogether.read();
        if (generationRef.current !== gen || activeUserRef.current !== currentUser) return null;
        applyRead(next, gen, currentUser, { suppressNotice: options?.silent });
        return next;
      } catch {
        return null;
      } finally {
        if (generationRef.current === gen) setLoading(false);
      }
    },
    [applyRead],
  );

  // Reset cleanly on sign-out or account switch; drop all in-flight responses from prior account.
  useEffect(() => {
    activeUserRef.current = userId;
    generationRef.current += 1;
    previousReadRef.current = null;
    setRead(null);
    setInvite(null);
    setRecentlyJoinedIds(new Set());
    stopAllSyncs();
    if (joinPulseTimerRef.current !== null) {
      window.clearTimeout(joinPulseTimerRef.current);
      joinPulseTimerRef.current = null;
    }
    if (!userId) return;
    void refresh();
  }, [userId, refresh, stopAllSyncs]);

  // Refresh on presence socket events, visibility return, focus, and reconnect.
  useEffect(() => {
    if (!userId) return;
    const onWake = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener(TRAIN_TOGETHER_CHANGED, onWake);
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(TRAIN_TOGETHER_CHANGED, onWake);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, refresh]);

  // 20-second fallback poll while in a session or waiting for an invite to be scanned.
  const hasSessionOrInvite = Boolean(read?.session || invite);
  useEffect(() => {
    if (!userId || !hasSessionOrInvite) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_FALLBACK_MS);
    return () => window.clearInterval(timer);
  }, [userId, hasSessionOrInvite, refresh]);

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
    setCreatingInvite(true);
    try {
      const created = await api.trainTogether.invite();
      if (generationRef.current !== gen || activeUserRef.current !== currentUser) return null;
      setInvite(created);
      setNow(Date.now());
      // Refresh session state in case creating an invite also started a new session.
      void refresh({ silent: true });
      return created;
    } finally {
      if (generationRef.current === gen) setCreatingInvite(false);
    }
  }, [refresh]);

  const join = useCallback(
    async (token: string): Promise<TrainTogetherRead> => {
      const currentUser = activeUserRef.current;
      if (!currentUser) throw new Error('Sign in to train together.');
      const gen = generationRef.current;
      setJoining(true);
      try {
        const next = await api.trainTogether.join(token);
        if (generationRef.current !== gen || activeUserRef.current !== currentUser) return next;
        // If previousReadRef was still null (e.g. link opened right on sign-in), treat previous as empty
        // so join always produces the "Training with {Name}" confirmation toast.
        if (previousReadRef.current === null) {
          previousReadRef.current = { session: null, ended: null };
        }
        applyRead(next, gen, currentUser);
        return next;
      } finally {
        if (generationRef.current === gen) setJoining(false);
      }
    },
    [applyRead],
  );

  const leave = useCallback(async (): Promise<void> => {
    const currentUser = activeUserRef.current;
    if (!currentUser) return;
    const gen = generationRef.current;
    setLeaving(true);
    try {
      const next = await api.trainTogether.leave();
      if (generationRef.current !== gen || activeUserRef.current !== currentUser) return;
      setInvite(null);
      applyRead(next, gen, currentUser, { suppressNotice: true });
    } finally {
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

  return {
    read,
    session,
    partners: currentPartners,
    invite,
    inviteSeconds,
    loading,
    creatingInvite,
    joining,
    leaving,
    recentlyJoinedIds,
    partnerSyncStates,
    partnerAcknowledgedDrafts,
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
  };
}
