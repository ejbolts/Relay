/** Where a tip's button takes you. The app decides how to open each one. */
export type TipTarget =
  | 'machine-weights'
  | 'weight-goal'
  | 'training-blocks'
  | 'home-edit'
  | 'profile'
  | 'split'
  | 'appearance';

export const TIP_DEFINITIONS = {
  normalise: {
    title: 'Different machines, one progress chart',
    homeBody: 'Compare different machines on one chart with Machine weights.',
    body: 'Open Machine weights to normalise different stacks against a reference machine. Your logged weights stay unchanged.',
    surface: 'hint',
    action: { label: 'Open Machine weights', target: 'machine-weights' },
    reminds: true,
  },
  mergeMachines: {
    title: 'Saved the same machine twice?',
    homeBody: 'Choose Merge to combine duplicate machines and keep their history.',
    body: 'Choose Merge to combine duplicate machines, keeping their photos and workout links together.',
    surface: 'hint',
  },
  maintenance: {
    title: 'Maintain a range, not a single number',
    homeBody: 'Choose Maintain in your weight goal to set a lower and upper range.',
    body: 'Choose Maintain in your weight goal to set lower and upper limits. Your trend chart shows the band.',
    surface: 'home',
    action: { label: 'Set a goal', target: 'weight-goal' },
  },
  setType: {
    title: 'Warm-up or working set?',
    body: 'Tap W beside a set to make it a working set. Warm-ups don’t count toward volume.',
    surface: 'nudge',
    // Shown on the first logged warm-up, even on new accounts and inside the daily cooldown.
    priority: true,
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
    homeBody: 'Swap exercise in the menu keeps your planned sets when a machine is taken.',
    body: 'Choose Swap exercise in the exercise menu to keep your planned sets.',
    surface: 'nudge',
  },
  machine: {
    title: 'Remember your machine',
    homeBody: 'Save an equipment photo with your seat and pin settings for next time.',
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
    action: { label: 'Start a block', target: 'training-blocks' },
    reminds: true,
  },
  home: {
    title: 'Make Home your own',
    body: 'Tap the pencil to move, resize or hide your Home cards.',
    surface: 'home',
    action: { label: 'Edit Home', target: 'home-edit' },
  },
  friends: {
    title: 'Train alongside a friend',
    body: 'Share the QR code on your Profile to connect in person.',
    surface: 'home',
    action: { label: 'Open Profile', target: 'profile' },
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
    action: { label: 'Set up a split', target: 'split' },
    reminds: true,
  },
  repRange: {
    title: 'Know when to add weight',
    body: 'Give a planned exercise a rep range and Relay says when to stay and when to go up.',
    surface: 'home',
    action: { label: 'Open your split', target: 'split' },
    reminds: true,
  },
  appearance: {
    title: 'Make Relay look your way',
    body: 'Pick a colour theme, light or dark mode and a glass level in Settings › Appearance.',
    surface: 'home',
    action: { label: 'Open Appearance', target: 'appearance' },
  },
} as const;
export type TipId = keyof typeof TIP_DEFINITIONS;
export type TipState = {
  enabled: boolean;
  lastShown: number;
  seen: Partial<Record<TipId, 'seen' | 'dismissed' | 'learned'>>;
  counts: Record<string, number>;
  /** Home tips already opened from the date bulb; Home reading never spends contextual discovery. */
  homeRead?: TipId[];
  /** Home tips put away with Got it. They leave the bulb but may still appear where they apply. */
  homeDone?: TipId[];
  /** Times each tip has appeared without being opened or acted on. */
  shows?: Partial<Record<TipId, number>>;
  /**
   * Reminders for tips put away before their feature was set up: how many have come back, and
   * when the next one is due.
   */
  reminders?: Partial<Record<TipId, TipReminder>>;
};
export type TipReminder = { count: number; at?: number };
export const TIP_COOLDOWN = 24 * 60 * 60 * 1000;
/** A tip nobody touched gets this many showings before it stops appearing by itself. */
export const TIP_MAX_SHOWS = 3;
/** The button a tip offers, when it has somewhere to go. */
export function tipAction(id: TipId): { label: string; target: TipTarget } | null {
  const tip = TIP_DEFINITIONS[id];
  return 'action' in tip ? tip.action : null;
}
export const freshTips = (): TipState => ({
  enabled: true,
  lastShown: 0,
  seen: {},
  counts: {},
  shows: {},
});
export const tipStorageKey = (account: string) => `relay:tips:v1:${account}`;
export function loadTips(account: string): TipState {
  try {
    const value = JSON.parse(localStorage.getItem(tipStorageKey(account)) ?? 'null');
    if (!value || typeof value !== 'object') return freshTips();
    const tipIds = (list: unknown) =>
      Array.isArray(list)
        ? [
            ...new Set(
              list.filter(
                (id: unknown) => typeof id === 'string' && Object.hasOwn(TIP_DEFINITIONS, id),
              ),
            ),
          ]
        : null;
    const homeRead = tipIds(value.homeRead);
    const homeDone = tipIds(value.homeDone);
    const reminders = Object.fromEntries(
      Object.entries(value.reminders ?? {}).flatMap(([id, reminder]) => {
        const { count, at } = (reminder ?? {}) as { count?: unknown; at?: unknown };
        if (!Object.hasOwn(TIP_DEFINITIONS, id) || !isReminderTip(id as TipId)) return [];
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return [];
        return [[id, typeof at === 'number' && Number.isFinite(at) ? { count, at } : { count }]];
      }),
    );
    return {
      ...(homeRead ? { homeRead } : {}),
      ...(homeDone ? { homeDone } : {}),
      ...(Object.keys(reminders).length ? { reminders } : {}),
      shows: Object.fromEntries(
        Object.entries(value.shows ?? {}).filter(
          ([id, count]) =>
            Object.hasOwn(TIP_DEFINITIONS, id) &&
            typeof count === 'number' &&
            Number.isFinite(count) &&
            count >= 0,
        ),
      ),
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
/** Priority tips explain something easy to get wrong, so they skip the onboarding gates. */
export function isPriorityTip(id: TipId) {
  return 'priority' in TIP_DEFINITIONS[id] && TIP_DEFINITIONS[id].priority;
}
/** A dot beside a control interrupts nothing, so it neither waits for nor spends the daily tip. */
export function isQuietTip(id: TipId) {
  return TIP_DEFINITIONS[id].surface === 'hint';
}
export function canShowTip(state: TipState, id: TipId, now: number) {
  return (
    state.enabled &&
    !state.seen[id] &&
    (isPriorityTip(id) ||
      isQuietTip(id) ||
      state.lastShown === 0 ||
      now - state.lastShown >= TIP_COOLDOWN)
  );
}
/**
 * Records that a tip appeared. It is not "seen" yet: only opening it, acting on it or dismissing
 * it does that, so a tip that slipped past unnoticed gets another showing, up to the limit.
 */
export function tipShown(state: TipState, id: TipId, now: number): TipState {
  const shows = (state.shows?.[id] ?? 0) + 1;
  return {
    ...state,
    lastShown: isQuietTip(id) ? state.lastShown : now,
    shows: { ...state.shows, [id]: shows },
    seen: shows >= TIP_MAX_SHOWS ? { ...state.seen, [id]: 'seen' } : state.seen,
  };
}
export function countTipEvent(state: TipState, event: string): TipState {
  return {
    ...state,
    counts: { ...state.counts, [event]: Math.min(100, (state.counts[event] ?? 0) + 1) },
  };
}

/** Days until each reminder of a tip put away without its feature set up; then no more. */
export const TIP_REMINDER_DAYS = [7, 14, 28];
const DAY = 24 * 60 * 60 * 1000;

/** Tips with a setup guide, which come back while their feature is still unused. */
export function isReminderTip(id: TipId) {
  return 'reminds' in TIP_DEFINITIONS[id] && TIP_DEFINITIONS[id].reminds;
}

/** Put away without the feature being set up: opened, dismissed or set aside with Got it. */
function putAway(state: TipState, id: TipId) {
  const status = state.seen[id];
  return (status !== undefined && status !== 'learned') || !!state.homeDone?.includes(id);
}

/**
 * Schedules the next reminder for each guided tip that has been put away while its feature is
 * unused. A reminder already waiting keeps its date. Returns the same state when nothing changes.
 */
export function scheduleTipReminders(state: TipState, now: number): TipState {
  let reminders = state.reminders;
  for (const id of Object.keys(TIP_DEFINITIONS) as TipId[]) {
    if (!isReminderTip(id) || !putAway(state, id)) continue;
    const current = reminders?.[id] ?? { count: 0 };
    if (current.at !== undefined || current.count >= TIP_REMINDER_DAYS.length) continue;
    reminders = {
      ...reminders,
      [id]: { count: current.count, at: now + TIP_REMINDER_DAYS[current.count] * DAY },
    };
  }
  return reminders === state.reminders ? state : { ...state, reminders };
}

/**
 * Brings back each guided tip whose reminder is due and whose feature is still unused: it is
 * unread on Home again and can appear beside its control. Returns the same state when none is due.
 */
export function applyTipReminders(state: TipState, now: number): TipState {
  let next = state;
  for (const [key, reminder] of Object.entries(state.reminders ?? {})) {
    const id = key as TipId;
    if (!reminder || reminder.at === undefined || reminder.at > now) continue;
    if (next.seen[id] === 'learned') continue;
    const seen = { ...next.seen };
    delete seen[id];
    const shows = { ...next.shows };
    delete shows[id];
    next = {
      ...next,
      seen,
      shows,
      ...(next.homeRead ? { homeRead: next.homeRead.filter((item) => item !== id) } : {}),
      ...(next.homeDone ? { homeDone: next.homeDone.filter((item) => item !== id) } : {}),
      reminders: { ...next.reminders, [id]: { count: reminder.count + 1 } },
    };
  }
  return next;
}

/** Due reminders come back, then anything put away is scheduled to come back later. */
export function withTipReminders(state: TipState, now: number): TipState {
  return scheduleTipReminders(applyTipReminders(state, now), now);
}
