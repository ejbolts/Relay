import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { setupGuideRun, type ActiveGuide } from '../../../../frontend/src/setupGuideRun';
import {
  guideFacts,
  GUIDE_TIPS,
  type SetupGuideId,
} from '../../../../frontend/src/setupGuideSteps';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { sessionEpoch } from '../../session/sessionEpoch';
import { tipsFor } from './tips';

/**
 * The setup guide running in its feature's own screens, as the web's: started from Guides or a
 * tip, coached inside the editor, left part way by Skip guide or leaving the feature (nothing is
 * marked), and finished by saving the feature, which teaches its tips. A guide belongs to the
 * session that started it, so it never carries over to another account.
 *
 * Each start is a new run. Work that finishes later (a save) holds a ticket for the run it began
 * in, so it can only finish or update that run, never one started since, in this session or
 * another account's.
 */

const run = setupGuideRun();
let owner: { userId: string; session: number; run: number } | null = null;
let runs = 0;
const ownerCurrent = () => !!owner && owner.session === sessionEpoch();

/** The run a piece of work began in. */
export interface GuideTicket {
  id: SetupGuideId;
  run: number;
  session: number;
}

run.onFinished((id) => {
  if (!owner || !ownerCurrent()) return;
  for (const tip of GUIDE_TIPS[id]) tipsFor(owner.userId).learn(tip);
});

export function startSetupGuide(id: SetupGuideId, userId: string, workouts: TrackedWorkout[]) {
  runs += 1;
  owner = { userId, session: sessionEpoch(), run: runs };
  run.start(id, guideFacts(workouts));
}

const current = () => {
  const guide = run.get();
  return guide && ownerCurrent() ? guide : null;
};

/** A ticket for the named guide's current run, or null when it isn't running in this session. */
export function setupGuideTicket(id: SetupGuideId): GuideTicket | null {
  const guide = current();
  return guide?.id === id && owner ? { id, run: owner.run, session: owner.session } : null;
}

/** Whether the ticket's run is still the one running, in the session that started it. */
function holds(ticket: GuideTicket | null | undefined): ticket is GuideTicket {
  return (
    !!ticket &&
    !!owner &&
    owner.run === ticket.run &&
    owner.session === ticket.session &&
    ticket.session === sessionEpoch() &&
    run.get()?.id === ticket.id
  );
}

/** The ticket's run, if it is still running. */
export const ticketGuide = (ticket: GuideTicket | null | undefined) =>
  holds(ticket) ? run.get() : null;

/** Changes the ticket's run only. */
export function updateSetupGuide(
  ticket: GuideTicket | null | undefined,
  change: Partial<Omit<ActiveGuide, 'id'>>,
) {
  if (holds(ticket)) run.update(ticket.id, change);
}

/** The feature was saved: the ticket's run is complete and its tips are learned. */
export function finishSetupGuide(ticket: GuideTicket | null | undefined) {
  if (holds(ticket)) run.finish(ticket.id);
}

/** Leaves a guide part way; nothing is marked as set up. */
export const exitSetupGuide = run.exit;

/** The running guide, or only the named one when an id is given. */
export function useSetupGuide(id?: SetupGuideId): ActiveGuide | null {
  const guide = useSyncExternalStore(run.subscribe, run.get);
  const live = guide && guide === current() ? guide : null;
  return live && (!id || live.id === id) ? live : null;
}

/** The running guide outside React, in this session only. */
export const activeSetupGuide = current;

// Screens of each guide's feature that are mounted and in front.
const present = new Map<string, number>();
/** How long a guide waits for one of its screens to come back to the front before it ends. */
const LEAVE_GRACE_MS = 500;

/**
 * Leaves the named guide once none of its feature's screens (`scope`) is in front, as closing the
 * web's dialog does: the screen closed, or another tab or screen covered it while it stays
 * mounted. Moving between the feature's own screens (the splits page and its editor) keeps it, as
 * does a screen mounted again straight away. A guide finished by saving has already ended, and
 * only the run that was going when the screen left is ended.
 */
export function useExitGuideOnLeave(id: SetupGuideId, scope: string = id) {
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    present.set(scope, (present.get(scope) ?? 0) + 1);
    return () => {
      present.set(scope, Math.max(0, (present.get(scope) ?? 1) - 1));
      const left = setupGuideTicket(id);
      if (!left) return;
      setTimeout(() => {
        if (!present.get(scope) && holds(left)) run.exit(id);
      }, LEAVE_GRACE_MS);
    };
  }, [id, scope, focused]);
}

/** For tests: end any guide. */
export function resetSetupGuideForTests() {
  run.exit();
  owner = null;
  present.clear();
}
