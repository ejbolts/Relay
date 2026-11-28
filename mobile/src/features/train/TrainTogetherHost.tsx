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
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => sessionBound().read(() => trainTogetherApi.read(signal)),
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
            // A change the server refuses can never be sent: start again from its copy.
            if (
              next.status === 'failed' &&
              next.error instanceof ApiError &&
              next.error.code === TRAIN_ERRORS.changeNotAllowed
            ) {
              showToast(next.error.message, undefined, { variant: 'error' });
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
    }

    /** Takes an answer from the server as the session now. */
    function adopt(next: TrainTogetherRead) {
      latest.current.client.setQueryData(readKey, next);
    }

    const actions: TrainActions = {
      async join(token, from) {
        let result: TrainTogetherRead;
        try {
          result = await sessionBound().read(() => trainTogetherApi.join(token));
        } catch (error) {
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
        // The join is announced even before the first read has answered.
        previous.current ??= NOBODY;
        adopt(result);
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
        void sessionBound()
          .read(() => trainTogetherApi.leave())
          .then((result) => {
            // Your own leaving says nothing.
            previous.current = result;
            adopt(result);
          })
          .catch((error: unknown) =>
            showToast(failure(error).message, undefined, { variant: 'error' }),
          );
        setTrainState({ loggingFor: null, invite: null });
      },
      async newInvite() {
        try {
          const invite = await sessionBound().read(() => trainTogetherApi.invite());
          setTrainState({ invite, inviteError: null });
          void latest.current.client.invalidateQueries({ queryKey: readKey });
        } catch (error) {
          setTrainState({ invite: null, inviteError: failure(error).message });
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
        void sessionBound()
          .read(() => socialApi.addFriend(member.user_id))
          .then(() => {
            haptics.success();
            showToast(`Friend request sent to ${member.name}`);
            void latest.current.client.invalidateQueries({ queryKey: socialKeys.friends });
          })
          .catch((error: unknown) =>
            showToast(failure(error).message, undefined, { variant: 'error' }),
          );
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
    // A code is single use: once someone new joins, the sheet makes another.
    const had = new Set(partners(getTrainState().read?.session).map((member) => member.user_id));
    const joined = partners(read.session).some((member) => !had.has(member.user_id));
    setTrainState(joined ? { read, invite: null } : { read });
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
