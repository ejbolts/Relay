import { useSyncExternalStore } from 'react';
import type {
  PartnerSyncState,
  TrainInvite,
  TrainTogetherRead,
} from '../../../../frontend/src/trainTogether';
import type { ActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';

// Train together's state for the signed-in account. TrainTogetherHost (mounted once at the root,
// keyed by the account) owns it and the work behind it; screens read it here and act through
// `trainActions()`. Signing out or switching accounts unmounts the host, which empties it, so
// one account's session never shows to the next.

export type TrainSheetTab = 'code' | 'scan';

/** Why a join failed, as the scanner shows it beside the camera. */
export interface TrainJoinFailure {
  message: string;
  /** Train together's `train_not_friends`: the member to add as a friend first. */
  member?: { user_id: string; name: string };
}

export interface TrainState {
  userId: string | null;
  /** The latest GET /api/train-together, or null before the first answer. */
  read: TrainTogetherRead | null;
  /** This account's latest code, while it may still be live. */
  invite: TrainInvite | null;
  /** Why a new code could not be made (such as a full session), for the sheet. */
  inviteError: string | null;
  sheet: { open: boolean; tab: TrainSheetTab };
  /** The partner whose workout the logger is showing, or null for your own. */
  loggingFor: string | null;
  /** The partner whose Log button takes focus when you return to your own workout. */
  focusReturn: string | null;
  /** Each partner's draft as this phone shows it, with its sending state. */
  partnerSync: Record<string, PartnerSyncState>;
  /** Each partner's draft as the server last acknowledged it, so nothing unsent looks saved. */
  partnerAcked: Record<string, ActiveWorkoutDraft | null>;
  /** How many times each partner's edits came back not applied: fields show the server's value. */
  partnerConflicts: Record<string, number>;
  /** Movements this phone added to each partner's workout in this session (removable). */
  added: Record<string, readonly string[]>;
  /** A partner to offer "Start with {name}'s exercises" for, after joining with no workout. */
  startWith: string | null;
}

export interface TrainActions {
  join: (token: string, from: 'scan' | 'link') => Promise<TrainJoinFailure | null>;
  leave: () => void;
  newInvite: () => Promise<void>;
  openSheet: (tab?: TrainSheetTab) => void;
  closeSheet: () => void;
  /** Shows a partner's logger, or your own (null) with focus back on `returnTo`'s button. */
  logFor: (userId: string | null, returnTo?: string) => void;
  editPartner: (
    userId: string,
    edit: (draft: ActiveWorkoutDraft) => ActiveWorkoutDraft,
    added?: string,
  ) => void;
  retryPartner: (userId: string) => void;
  addFriend: (member: { user_id: string; name: string }) => void;
  closeStartWith: () => void;
  /** Opens a friend's invite once the sheet and logger have closed (a scanned friend code). */
  openProfile: (userId: string) => void;
}

export const EMPTY_TRAIN_STATE: TrainState = {
  userId: null,
  read: null,
  invite: null,
  inviteError: null,
  sheet: { open: false, tab: 'code' },
  loggingFor: null,
  focusReturn: null,
  partnerSync: {},
  partnerAcked: {},
  partnerConflicts: {},
  added: {},
  startWith: null,
};

let state: TrainState = EMPTY_TRAIN_STATE;
let actions: TrainActions | null = null;
const listeners = new Set<() => void>();

export function getTrainState() {
  return state;
}

export function setTrainState(update: Partial<TrainState> | ((current: TrainState) => TrainState)) {
  const next = typeof update === 'function' ? update(state) : { ...state, ...update };
  if (next === state) return;
  state = next;
  listeners.forEach((listener) => listener());
}

/** Called by the host as it mounts (with its actions) and unmounts (with null). */
export function setTrainActions(next: TrainActions | null) {
  actions = next;
  if (!next) setTrainState(EMPTY_TRAIN_STATE);
}

const NO_ACTIONS: TrainActions = {
  join: async () => ({ message: 'Sign in to train together.' }),
  leave: () => undefined,
  newInvite: async () => undefined,
  openSheet: () => undefined,
  closeSheet: () => undefined,
  logFor: () => undefined,
  editPartner: () => undefined,
  retryPartner: () => undefined,
  addFriend: () => undefined,
  closeStartWith: () => undefined,
  openProfile: () => undefined,
};

/** What screens do to train together; does nothing while signed out. */
export function trainActions(): TrainActions {
  return actions ?? NO_ACTIONS;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Hears every change of the train-together state (for code outside React). */
export function subscribeTrainState(listener: () => void): () => void {
  return subscribe(listener);
}

/** The train-together state, or the part of it `select` picks (return a stable value). */
export function useTrainState(): TrainState;
export function useTrainState<T>(select: (current: TrainState) => T): T;
export function useTrainState<T>(select?: (current: TrainState) => T) {
  return useSyncExternalStore(subscribe, () => (select ? select(state) : state));
}
