import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  memberName,
  partnerConflictNotice,
  partners,
  PartnerWorkoutSync,
  TRAIN_ERRORS,
  trainTogetherNotice,
  type PartnerSyncState,
  type TrainMember,
  type TrainTogetherRead,
} from '../../../../frontend/src/trainTogether';
import { ApiError } from '../../data/api';
import { onTrainTogether } from '../../data/livePresence';
import { haptics } from '../../ui/haptics';
import { showToast } from '../../ui/Toast';
import { socialApi } from '../social/socialApi';
import { socialKeys } from '../social/socialQueries';
import { sessionBound } from '../workout/sessionBound';
import { useOptionalWorkout } from '../workout/WorkoutProvider';
import { takePendingTrainInvite, usePendingTrainInvite } from './trainLinks';
import {
  getTrainState,
  setTrainActions,
  setTrainState,
  trainActions,
  type TrainActions,
  type TrainJoinFailure,
} from './trainStore';
import { trainTogetherApi, trainTogetherKeys } from './trainTogetherApi';
import { TrainStartSheet } from './TrainStartSheet';

/** How often a session is read again while the socket may have missed something. */
const SESSION_POLL_MS = 20_000;
const NOBODY: TrainTogetherRead = { session: null, ended: null };

export const trainSessionKey = (userId: string) => [...trainTogetherKeys.session, userId] as const;

/** No answer, or a proxy's, rather than a refusal from Relay itself. */
export function isConnectionFailure(error: unknown) {
  return !(error instanceof ApiError) || [502, 503, 504].includes(error.status);
}

/** A read that belongs to `userId`: no session, or one where `userId` is the caller. */
export function readIsFor(read: TrainTogetherRead, userId: string) {
  return (
    !read.session ||
    read.session.members.some((member) => member.is_self && member.user_id === userId)
  );
}

function failure(error: unknown): TrainJoinFailure {
  if (error instanceof ApiError)
    return { message: error.message, ...(error.member && { member: error.member }) };
  return { message: error instanceof Error ? error.message : 'Could not join. Try again.' };
}

interface PartnerSync {
  sync: PartnerWorkoutSync;
  /** The workout it edits, so a partner starting another one gets a fresh loop. */
  clientSessionId: string | undefined;
}

/**
 * Train together for the signed-in account: reads the session (on the socket's message, on a
 * reconnect, on return to the app and every 20 s while in one), says what changed in a toast,
 * joins codes from links and scanners, and keeps one request loop per partner's workout. Mount
 * once, keyed by the account.
 */
export function TrainTogetherHost({ userId }: { userId: string }) {
  const client = useQueryClient();
  const workout = useOptionalWorkout();
  const pathname = usePathname();
  const key = trainSessionKey(userId);
  // Moves on whenever a join, leave or new code answers: a read started before then is older
  // than that answer and is dropped when it arrives.
  const generation = useRef(0);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const started = generation.current;
      const result = await sessionBound().read(() => trainTogetherApi.read(signal));
      if (!readIsFor(result, userId)) throw new Error('That session belongs to another account.');
      const current = client.getQueryData<TrainTogetherRead>(key);
      return started !== generation.current && current ? current : result;
    },
    refetchInterval: (current) => (current.state.data?.session ? SESSION_POLL_MS : false),
  });
  const read = query.data ?? null;
  const previous = useRef<TrainTogetherRead | null>(null);
  const syncs = useRef(new Map<string, PartnerSync>());
  const followRef = useRef<((next: TrainTogetherRead) => void) | null>(null);
  // The latest values for the actions, which are made once.
  const latest = useRef({ workout, pathname, client });
  useEffect(() => {
    latest.current = { workout, pathname, client };
  });

  // Set up the store and actions for this account; empty them when it goes.
  useEffect(() => {
    setTrainState({ userId });
    const loops = syncs.current;
    const readKey = trainSessionKey(userId);
    // False once this account's host has gone: late answers then do nothing.
    let alive = true;
    let leaving = false;
    let inviting = false;
    /** Tokens already sent to join, so the same code is never submitted twice. */
    const submitted = new Set<string>();

    function stopSync(partnerId: string) {
      loops.get(partnerId)?.sync.stop();
      loops.delete(partnerId);
      setTrainState((current) => {
        if (!(partnerId in current.partnerSync) && current.loggingFor !== partnerId) return current;
        const partnerSync = { ...current.partnerSync };
        delete partnerSync[partnerId];
        const partnerAcked = { ...current.partnerAcked };
        delete partnerAcked[partnerId];
        return {
          ...current,
          partnerSync,
          partnerAcked,
          loggingFor: current.loggingFor === partnerId ? null : current.loggingFor,
        };
      });
    }

    function partnerNamed(partnerId: string) {
      const member = partners(getTrainState().read?.session).find(
        (item) => item.user_id === partnerId,
      );
      return member ? memberName(member) : 'Your partner';
    }

    function startSync(member: TrainMember) {
      const remote = member.workout!;
      const partnerId = member.user_id;
      let status: PartnerSyncState['status'] = 'synced';
      const sync = new PartnerWorkoutSync(
        {
          put: (change) =>
            sessionBound().read(() => trainTogetherApi.changePartnerWorkout(partnerId, change)),
          changed: (next) => {
            const was = status;
            status = next.status;
            const acknowledged = next.status === 'synced' || next.status === 'conflict';
            setTrainState((current) => ({
              ...current,
              partnerSync: { ...current.partnerSync, [partnerId]: next },
              ...(acknowledged && {
                partnerAcked: { ...current.partnerAcked, [partnerId]: next.draft },
              }),
            }));
            if (next.status === 'conflict' && was !== 'conflict') {
              haptics.warning();
              showToast(partnerConflictNotice(partnerNamed(partnerId)), undefined, {
                variant: 'warning',
              });
            }
            // A refusal is not "offline": it can never be sent. Close their logger, read the
            // session again and say why; the next real copy starts a new loop.
            if (next.status === 'failed' && !isConnectionFailure(next.error)) {
              const error = next.error as ApiError;
              const gone =
                error.code === TRAIN_ERRORS.notPartner || error.code === TRAIN_ERRORS.noWorkout;
              showToast(
                gone
                  ? `${partnerNamed(partnerId)}'s workout is no longer open to you.`
                  : error.message,
                undefined,
                { variant: 'error' },
              );
              stopSync(partnerId);
              void latest.current.client.invalidateQueries({ queryKey: readKey });
            }
          },
        },
        { revision: remote.revision, draft: remote.draft },
      );
      loops.set(partnerId, { sync, clientSessionId: remote.draft.clientSessionId });
      setTrainState((current) => ({
        ...current,
        partnerSync: { ...current.partnerSync, [partnerId]: sync.current },
        partnerAcked: { ...current.partnerAcked, [partnerId]: remote.draft },
      }));
    }

    /** Brings the partner loops in line with a read: new partners, new copies, departures. */
    function follow(next: TrainTogetherRead) {
      const live = new Map(partners(next.session).map((member) => [member.user_id, member]));
      for (const partnerId of [...loops.keys()]) {
        const member = live.get(partnerId);
        const loop = loops.get(partnerId)!;
        if (!member?.workout || member.workout.draft.clientSessionId !== loop.clientSessionId)
          stopSync(partnerId);
        else loop.sync.refresh({ revision: member.workout.revision, draft: member.workout.draft });
      }
      for (const member of live.values())
        if (member.workout && !loops.has(member.user_id)) startSync(member);
      const state = getTrainState();
      if (state.loggingFor && !loops.has(state.loggingFor)) setTrainState({ loggingFor: null });
      if (state.startWith && !live.has(state.startWith)) setTrainState({ startWith: null });
      if (!next.session) setTrainState({ invite: null, added: {} });
      // A code belongs to one session: drop one held for another.
      const invite = getTrainState().invite;
      if (invite && next.session && invite.session_id !== next.session.id)
        setTrainState({ invite: null });
    }

    /** Takes an answer from the server as the session now. */
    async function adopt(next: TrainTogetherRead) {
      // A read already on its way is older than this answer: it is dropped (generation) and
      // cancelled; the cancel settles first, so it can't put back what was there before.
      generation.current += 1;
      const { client } = latest.current;
      await client.cancelQueries({ queryKey: readKey }, { revert: false });
      if (alive && readIsFor(next, userId)) client.setQueryData(readKey, next);
    }

    const actions: TrainActions = {
      async join(token, from) {
        if (submitted.has(token)) return null;
        submitted.add(token);
        let result: TrainTogetherRead;
        try {
          result = await sessionBound().read(() => trainTogetherApi.join(token));
        } catch (error) {
          if (!alive) return null;
          // Refused, so the same code may be tried again (after adding the friend, say).
          submitted.delete(token);
          const reason = failure(error);
          haptics.error();
          if (from === 'link') {
            const member = reason.member;
            showToast(
              reason.message,
              member ? { label: 'Add friend', run: () => actions.addFriend(member) } : undefined,
              { variant: 'error' },
            );
          }
          return reason;
        }
        if (!alive) return null;
        // The join is announced even before the first read has answered.
        previous.current ??= NOBODY;
        await adopt(result);
        if (!alive) return null;
        haptics.success();
        setTrainState({ sheet: { ...getTrainState().sheet, open: false } });
        const { workout: engine, pathname: path } = latest.current;
        if (engine?.live) {
          if (path !== '/workout') engine.open();
        } else {
          const first = partners(result.session)[0];
          if (first) setTrainState({ startWith: first.user_id });
        }
        return null;
      },
      leave() {
        // A second press while leaving does nothing.
        if (leaving) return;
        leaving = true;
        void sessionBound()
          .read(() => trainTogetherApi.leave())
          .then((result) => {
            if (!alive) return;
            // Your own leaving says nothing.
            previous.current = result;
            setTrainState({ loggingFor: null, invite: null });
            return adopt(result);
          })
          .catch((error: unknown) => {
            if (alive)
              showToast(`Couldn't leave the session. ${failure(error).message}`, undefined, {
                variant: 'error',
              });
          })
          .finally(() => {
            leaving = false;
          });
      },
      async newInvite() {
        // One request at a time, never retried by itself.
        if (inviting) return;
        inviting = true;
        const session = getTrainState().read?.session?.id ?? null;
        try {
          const invite = await sessionBound().read(() => trainTogetherApi.invite());
          if (!alive) return;
          // The session changed while the code was being made: it belongs to the old one.
          if (session && (getTrainState().read?.session?.id ?? null) !== session) return;
          generation.current += 1;
          setTrainState({ invite, inviteError: null });
          await latest.current.client.cancelQueries({ queryKey: readKey }, { revert: false });
          void latest.current.client.invalidateQueries({ queryKey: readKey });
        } catch (error) {
          if (alive) setTrainState({ invite: null, inviteError: failure(error).message });
        } finally {
          inviting = false;
        }
      },
      openSheet(tab = 'code') {
        setTrainState({ sheet: { open: true, tab } });
      },
      closeSheet() {
        setTrainState({ sheet: { ...getTrainState().sheet, open: false } });
      },
      logFor(partnerId) {
        if (partnerId && !loops.has(partnerId)) return;
        haptics.selection();
        setTrainState({ loggingFor: partnerId });
      },
      editPartner(partnerId, edit, added) {
        const loop = loops.get(partnerId);
        if (!loop) return;
        if (added)
          setTrainState((current) => ({
            ...current,
            added: { ...current.added, [partnerId]: [...(current.added[partnerId] ?? []), added] },
          }));
        void loop.sync.edit(edit);
      },
      retryPartner(partnerId) {
        void loops.get(partnerId)?.sync.retry();
      },
      addFriend(member) {
        // A notice's button can be pressed after the account changed: then it does nothing.
        if (!alive || getTrainState().userId !== userId) return;
        void sessionBound()
          .read(() => socialApi.addFriend(member.user_id))
          .then(() => {
            if (!alive) return;
            haptics.success();
            showToast(`Friend request sent to ${member.name}`);
            void latest.current.client.invalidateQueries({ queryKey: socialKeys.friends });
          })
          .catch((error: unknown) => {
            if (alive) showToast(failure(error).message, undefined, { variant: 'error' });
          });
      },
      closeStartWith() {
        setTrainState({ startWith: null });
      },
    };
    setTrainActions(actions);
    followRef.current = follow;
    // Socket messages and reconnects read the session again.
    const stopListening = onTrainTogether(
      () => void latest.current.client.invalidateQueries({ queryKey: readKey }),
    );
    // A partner's unsent edit goes as soon as the connection is back.
    const stopNet = onlineManager.subscribe((online) => {
      if (online) loops.forEach((loop) => void loop.sync.retry());
    });
    return () => {
      alive = false;
      stopListening();
      stopNet();
      loops.forEach((loop) => loop.sync.stop());
      loops.clear();
      followRef.current = null;
      setTrainActions(null);
    };
  }, [userId]);

  // Each new read: follow it, retry unsent partner edits, and say what changed.
  useEffect(() => {
    if (!read) return;
    // A code is single use. Once someone new joins, the sheet closes on your code, so the logger
    // shows who joined; reopening it makes another code.
    const state = getTrainState();
    const had = new Set(partners(state.read?.session).map((member) => member.user_id));
    const joined = partners(read.session).some((member) => !had.has(member.user_id));
    setTrainState(
      joined ? { read, invite: null, sheet: { ...state.sheet, open: false } } : { read },
    );
    followRef.current?.(read);
    syncs.current.forEach((loop) => {
      if (loop.sync.current.status === 'failed') void loop.sync.retry();
    });
    const before = previous.current;
    previous.current = read;
    if (before === read) return;
    // Your own finishing, discarding or leaving says nothing.
    if (!read.session && read.ended?.by_user_id === userId) return;
    const notice = trainTogetherNotice(before, read);
    if (notice) showToast(notice);
  }, [read, userId]);

  // A code from a link or another scanner, once signed in.
  const pending = usePendingTrainInvite();
  useEffect(() => {
    if (!pending) return;
    const token = takePendingTrainInvite();
    // The actions are set by the effect above, which runs first.
    if (token) void trainActions().join(token, 'link');
  }, [pending]);

  return <TrainStartSheet />;
}
