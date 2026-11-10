export const TIP_DEFINITIONS = {
  normalise: {
    title: 'Different machines, one progress chart',
    body: 'Open Machine weights to normalise different stacks against a reference machine. Your logged weights stay unchanged.',
    surface: 'hint',
  },
  mergeMachines: {
    title: 'Saved the same machine twice?',
    body: 'Choose Select to merge duplicate machines, keeping their photos and workout links together.',
    surface: 'hint',
  },
  maintenance: {
    title: 'Maintain a range, not a single number',
    body: 'Choose Maintain in your weight goal to set lower and upper limits. Your trend chart shows the band.',
    surface: 'home',
  },
  reorder: {
    title: 'Put sets in order',
    body: 'Hold a set’s dotted handle, then drag it into place.',
    surface: 'nudge',
  },
  swipe: {
    title: 'One less tap',
    body: 'Swipe a set left to delete it. Undo is there if you need it.',
    surface: 'nudge',
  },
  plates: {
    title: 'Let Relay count the plates',
    body: 'Tap the plates beside the exercise to see what goes on each side.',
    surface: 'hint',
  },
  swap: {
    title: 'Machine taken?',
    body: 'Choose Swap exercise in the exercise menu to keep your planned sets.',
    surface: 'nudge',
  },
  machine: {
    title: 'Remember your machine',
    body: 'Save an equipment photo with its seat and pin settings for next time.',
    surface: 'hint',
  },
  cardio: {
    title: 'Skip the typing',
    body: 'Upload or paste a cardio screenshot to fill in your set.',
    surface: 'nudge',
  },
  blocks: {
    title: 'Give your next phase a fresh start',
    body: 'Training blocks track new progress while keeping your full history.',
    surface: 'home',
  },
  home: {
    title: 'Make Home your own',
    body: 'Tap the pencil to move, resize or hide your Home cards.',
    surface: 'home',
  },
  friends: {
    title: 'Train alongside a friend',
    body: 'Share the QR code on your Profile to connect in person.',
    surface: 'home',
  },
  back: {
    title: 'A quicker way back',
    body: 'Swipe right from the left edge to go back a screen.',
    surface: 'nudge',
  },
  split: {
    title: 'Have a regular rotation?',
    body: 'Save your split so Up next follows your training days.',
    surface: 'home',
  },
} as const;
export type TipId = keyof typeof TIP_DEFINITIONS;
export type TipState = {
  enabled: boolean;
  lastShown: number;
  seen: Partial<Record<TipId, 'seen' | 'dismissed' | 'learned'>>;
  counts: Record<string, number>;
  homeRotation?: { id: TipId; shownAt: number };
};
export const TIP_COOLDOWN = 24 * 60 * 60 * 1000;
export const freshTips = (): TipState => ({ enabled: true, lastShown: 0, seen: {}, counts: {} });
export const tipStorageKey = (account: string) => `relay:tips:v1:${account}`;
export function loadTips(account: string): TipState {
  try {
    const value = JSON.parse(localStorage.getItem(tipStorageKey(account)) ?? 'null');
    if (!value || typeof value !== 'object') return freshTips();
    return {
      ...(value.homeRotation &&
      Object.hasOwn(TIP_DEFINITIONS, value.homeRotation.id) &&
      Number.isFinite(value.homeRotation.shownAt)
        ? { homeRotation: { id: value.homeRotation.id, shownAt: value.homeRotation.shownAt } }
        : {}),
      enabled: value.enabled !== false,
      lastShown:
        typeof value.lastShown === 'number' && Number.isFinite(value.lastShown)
          ? value.lastShown
          : 0,
      seen: Object.fromEntries(
        Object.entries(value.seen ?? {}).filter(
          ([id, status]) =>
            Object.hasOwn(TIP_DEFINITIONS, id) &&
            ['seen', 'dismissed', 'learned'].includes(String(status)),
        ),
      ),
      counts: Object.fromEntries(
        Object.entries(value.counts ?? {}).filter(
          ([, count]) => typeof count === 'number' && Number.isFinite(count) && count >= 0,
        ),
      ),
    } as TipState;
  } catch {
    return freshTips();
  }
}
export function saveTips(account: string, state: TipState) {
  try {
    localStorage.setItem(tipStorageKey(account), JSON.stringify(state));
  } catch {
    /* In-memory state still works when storage is unavailable. */
  }
}
export function canShowTip(state: TipState, id: TipId, now: number) {
  return (
    state.enabled &&
    !state.seen[id] &&
    (state.lastShown === 0 || now - state.lastShown >= TIP_COOLDOWN)
  );
}
export function countTipEvent(state: TipState, event: string): TipState {
  return {
    ...state,
    counts: { ...state.counts, [event]: Math.min(100, (state.counts[event] ?? 0) + 1) },
  };
}

export const HOME_TIP_REVISIT_MS = 5 * 60 * 1000;
export function rotatingHomeTip(
  ids: TipId[],
  previous: TipState['homeRotation'],
  advance: boolean,
): TipId | undefined {
  const index = previous ? ids.indexOf(previous.id) : -1;
  return index < 0 ? ids[0] : ids[(index + (advance ? 1 : 0)) % ids.length];
}
