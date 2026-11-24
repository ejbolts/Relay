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
 */

const run = setupGuideRun();
let owner: { userId: string; session: number } | null = null;
const ownerCurrent = () => !!owner && owner.session === sessionEpoch();

run.onFinished((id) => {
  if (!owner || !ownerCurrent()) return;
  for (const tip of GUIDE_TIPS[id]) tipsFor(owner.userId).learn(tip);
});

export function startSetupGuide(id: SetupGuideId, userId: string, workouts: TrackedWorkout[]) {
  owner = { userId, session: sessionEpoch() };
  run.start(id, guideFacts(workouts));
}

export const updateSetupGuide = run.update;

/** Leaves a guide part way; nothing is marked as set up. */
export const exitSetupGuide = run.exit;

/** The feature was saved: the guide is complete and its tips are learned. */
export const finishSetupGuide = run.finish;

const current = () => {
  const guide = run.get();
  return guide && ownerCurrent() ? guide : null;
};

/** The running guide, or only the named one when an id is given. */
export function useSetupGuide(id?: SetupGuideId): ActiveGuide | null {
  const guide = useSyncExternalStore(run.subscribe, run.get);
  const live = guide && guide === current() ? guide : null;
  return live && (!id || live.id === id) ? live : null;
}

/** The running guide outside React, in this session only. */
export const activeSetupGuide = current;

/**
 * Leaves the named guide when this screen goes away, as closing the web's dialog does. A guide
 * finished by saving has already ended, so this only ends one left part way. The check waits a
 * moment, so a screen mounted again straight away (a remount, or the same screen replacing
 * itself) keeps its guide.
 */
export function useExitGuideOnLeave(id: SetupGuideId, scope = id) {
  useEffect(() => {
    mounted.set(scope, (mounted.get(scope) ?? 0) + 1);
    return () => {
      mounted.set(scope, (mounted.get(scope) ?? 1) - 1);
      setTimeout(() => {
        if (!mounted.get(scope)) run.exit(id);
      }, 0);
    };
  }, [id, scope]);
}
const mounted = new Map<string, number>();

/** For tests: end any guide. */
export function resetSetupGuideForTests() {
  run.exit();
  owner = null;
  mounted.clear();
}
