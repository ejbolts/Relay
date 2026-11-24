import type { GuideFacts, SetupGuideId } from './setupGuideSteps';

/** A setup guide running in its feature's own screens. */
export interface ActiveGuide {
  id: SetupGuideId;
  facts: GuideFacts;
  /** Splits: a saved split still to be made active, after the editor closes. */
  useRoutineId?: string;
}

/**
 * The running setup guide and its rules, shared by the web and the app: one guide at a time,
 * leaving part way marks nothing, and only saving the feature finishes it.
 */
export function setupGuideRun() {
  let active: ActiveGuide | null = null;
  const listeners = new Set<() => void>();
  const finishedListeners = new Set<(id: SetupGuideId) => void>();
  function emit(next: ActiveGuide | null) {
    active = next;
    for (const listener of listeners) listener();
  }
  return {
    /** The running guide. */
    get: () => active,
    start(id: SetupGuideId, facts: GuideFacts) {
      emit({ id, facts });
    },
    update(id: SetupGuideId, change: Partial<Omit<ActiveGuide, 'id'>>) {
      if (active?.id === id) emit({ ...active, ...change });
    },
    /** Leaves a guide part way; nothing is marked as set up. */
    exit(id?: SetupGuideId) {
      if (active && (!id || active.id === id)) emit(null);
    },
    /** The feature was saved: the guide is complete. */
    finish(id: SetupGuideId) {
      if (active?.id !== id) return;
      emit(null);
      for (const listener of finishedListeners) listener(id);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onFinished(listener: (id: SetupGuideId) => void) {
      finishedListeners.add(listener);
      return () => {
        finishedListeners.delete(listener);
      };
    },
  };
}
