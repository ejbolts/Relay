export const APP_TABS = [
  'dashboard',
  'log',
  'body',
  'training',
  'social',
  'history',
  'progress',
  'cardio',
  'videos',
  'settings',
  'split',
  'profile',
  'shared-profile',
  'admin',
] as const;

export type AppTab = (typeof APP_TABS)[number];

/** Destinations shown in the persistent bottom tab bar. */
export type MainTab = 'dashboard' | 'training' | 'social' | 'body';

/** History, exercise progress, and cardio share one cached screen and its open-workout state. */
export type HistorySection = 'history' | 'progress' | 'cardio';

export interface AppHistoryState {
  gymLogger: true;
  index: number;
  tab: AppTab;
}

export function isAppTab(value: unknown): value is AppTab {
  return typeof value === 'string' && APP_TABS.includes(value as AppTab);
}

export function isAppHistoryState(value: unknown): value is AppHistoryState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppHistoryState>;
  return (
    candidate.gymLogger === true &&
    Number.isInteger(candidate.index) &&
    (candidate.index ?? -1) >= 0 &&
    isAppTab(candidate.tab)
  );
}

export function appTabFromHash(hash: string): AppTab {
  const requested = hash.replace(/^#/, '');
  if (requested === 'shared') return 'social';
  return isAppTab(requested) ? requested : 'dashboard';
}

export function createAppHistoryState(tab: AppTab, index: number): AppHistoryState {
  return { gymLogger: true, index, tab };
}

export function historySectionForTab(tab: AppTab): HistorySection | null {
  if (tab === 'training') return 'history';
  if (tab === 'history' || tab === 'progress' || tab === 'cardio') return tab;
  return null;
}

/** The tab-bar item that should appear selected for a screen, if any. */
export function mainTabFor(tab: AppTab): MainTab | null {
  if (tab === 'dashboard' || tab === 'social' || tab === 'body') return tab;
  if (tab === 'shared-profile') return 'social';
  if (historySectionForTab(tab) !== null) return 'training';
  return null;
}
