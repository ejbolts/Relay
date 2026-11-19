import { createContext, useContext, useEffect, useRef } from 'react';
import { searchWords, typoMatch } from './fuzzyText';
import type { TipAction } from './tipActions';

export const SETTINGS_GROUP_LABELS = {
  training: 'Training',
  appearance: 'Appearance',
  notifications: 'Notifications',
  account: 'Account & privacy',
  data: 'Data & connections',
  help: 'Help & about',
} as const;
export type SettingsGroupId = keyof typeof SETTINGS_GROUP_LABELS;

/** Screens a search result can open; settings found elsewhere live on Cardio, Home and Admin. */
export type SettingsPage = 'settings' | 'profile' | 'cardio' | 'dashboard' | 'admin';

export interface SettingsDestination {
  id: string;
  title: string;
  page: SettingsPage;
  group?: SettingsGroupId;
  keywords: string;
  selector: string;
  reveal?: string[];
  editProfile?: boolean;
  requiresAccount?: boolean;
  requiresAdmin?: boolean;
  /** Opens the place another way, such as Home's edit mode, instead of jumping to `selector`. */
  action?: TipAction;
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
  {
    id: 'tips',
    group: 'help',
    title: 'Tips',
    page: 'settings',
    keywords: 'hints tips learn disable turn off suggestions',
    selector: '#tips-settings-title',
  },
  {
    id: 'setup-guides',
    group: 'help',
    title: 'Setup guides',
    page: 'settings',
    keywords:
      'how to walkthrough normalise machine weights training blocks split rep range progression',
    selector: '#setup-guides-settings-title',
  },
  {
    id: 'workout-sharing',
    group: 'notifications',
    title: 'Share workout reminder',
    page: 'settings',
    keywords: 'share workout notification popup toast reminder completion',
    selector: '#workout-sharing-settings-title',
  },
  {
    id: 'training-split',
    group: 'training',
    title: 'Your split',
    page: 'settings',
    keywords:
      'schedule rotation routine routines upper lower push pull legs ppl full body fbeod cardio rest templates cycle',
    selector: '#training-split-settings',
  },
  {
    id: 'workout-auto-save',
    group: 'training',
    title: 'Auto-save unfinished workouts',
    page: 'settings',
    keywords: 'forgot finish inactive left running automatic save timeout three hours',
    selector: '#workout-auto-save-title',
    requiresAccount: true,
  },
  {
    id: 'pr-fresh-start',
    group: 'training',
    title: 'Fresh starts',
    page: 'settings',
    keywords: 'personal records pr prs reset baseline restart new start injury break gym',
    selector: '#pr-fresh-start-title',
    requiresAccount: true,
  },
  {
    id: 'rest',
    group: 'training',
    title: 'Rest timer',
    page: 'settings',
    keywords: 'automatic countdown between sets',
    selector: '[aria-label="Rest timer"]',
  },
  {
    id: 'rest-times',
    group: 'training',
    title: 'Show rest times',
    page: 'settings',
    keywords: 'hide display between sets rest duration',
    selector: '[aria-label="Show rest times"]',
  },
  {
    id: 'alerts',
    group: 'notifications',
    title: 'Phone alerts',
    page: 'settings',
    keywords: 'notifications reminders push rest alert alerts sound vibrate vibration',
    selector: '#notification-settings-title',
  },
  {
    id: 'appearance',
    group: 'appearance',
    title: 'App theme',
    page: 'settings',
    keywords:
      'appearance light dark mode automatic system colour color palette accent blue green purple plum emerald amber coral neutral silver grey gray frosted glass blur transparency oled',
    selector: '#colour-theme-title',
  },
  {
    id: 'training',
    group: 'training',
    title: 'Training preferences',
    page: 'settings',
    keywords:
      'weight units kg lb kilograms pounds week starts schedule weekly muscle sets goal targets volume warmups',
    selector: '#training-preferences-title',
  },
  {
    id: 'motion',
    group: 'appearance',
    title: 'Animations',
    page: 'settings',
    keywords: 'reduce motion accessibility',
    selector: '#motion-settings-title',
  },
  {
    id: 'colours',
    group: 'training',
    title: 'Workout types',
    page: 'settings',
    keywords: 'colour color category calendar legend custom add remove arms legs limbs torso',
    selector: '#workout-types-title',
    reveal: ['Workout types'],
  },
  {
    id: 'trend',
    group: 'training',
    title: 'Bodyweight trend defaults',
    page: 'settings',
    keywords: 'body weight average median duration statistic measurements',
    selector: '#bodyweight-trend-title',
  },
  {
    id: 'workouts',
    group: 'data',
    title: 'Import & export',
    page: 'settings',
    keywords:
      'import export csv backup sample workouts bodyweight body weight measurements check-ins',
    selector: '#workout-data-title',
  },
  {
    id: 'archive',
    group: 'data',
    title: 'Full backup',
    page: 'settings',
    keywords: 'backup restore archive download zip copy move server everything',
    selector: '#account-archive-title',
  },
  {
    id: 'youtube',
    group: 'data',
    title: 'YouTube connection',
    page: 'settings',
    keywords: 'video uploads channel connect disconnect',
    selector: '.youtube-connection h2',
  },
  {
    id: 'release',
    group: 'help',
    title: "What's new",
    page: 'settings',
    keywords: 'version updates release changelog changes',
    selector: '#release-settings-title',
  },
  {
    id: 'guide',
    group: 'help',
    title: 'App guide',
    page: 'settings',
    keywords: 'tour help replay',
    selector: '#app-guide-settings-title',
  },
  {
    id: 'install',
    group: 'help',
    title: 'Add to Home Screen',
    page: 'settings',
    keywords: 'install phone pwa app icon',
    selector: '#home-screen-settings-title',
  },
  {
    id: 'feedback',
    group: 'help',
    title: 'Feedback & feature requests',
    page: 'settings',
    keywords: 'suggestion bug report ideas support',
    selector: '#feedback-settings-title',
  },
  {
    id: 'username',
    title: 'Change username',
    page: 'profile',
    keywords: 'account login name edit',
    selector: '.profile-identity input[autocomplete="username"]',
    editProfile: true,
  },
  {
    id: 'name',
    title: 'Change display name',
    page: 'profile',
    keywords: 'profile name edit',
    selector: '.profile-identity input[autocomplete="name"]',
    editProfile: true,
  },
  {
    id: 'photo',
    title: 'Profile photo',
    page: 'profile',
    keywords: 'picture avatar change remove edit',
    selector: '.profile-photo-edit',
    editProfile: true,
  },
  {
    id: 'uuid',
    group: 'account',
    title: 'Account UUID',
    page: 'settings',
    requiresAccount: true,
    keywords: 'id identifier copy account',
    selector: '[aria-labelledby="account-settings-title"] .profile-account-id code',
  },
  {
    id: 'training-time',
    title: 'Time trained',
    page: 'profile',
    keywords: 'total hours minutes duration workouts cardio combined exercise stats',
    selector: '#shared-training-time-title',
  },
  {
    id: 'sharing',
    group: 'account',
    title: 'Profile sharing',
    page: 'settings',
    requiresAccount: true,
    keywords: 'privacy private public friends only visibility',
    selector: '.profile-sharing',
    reveal: ['Profile sharing'],
  },
  {
    id: 'shared-fields',
    group: 'account',
    title: 'What you share',
    page: 'settings',
    requiresAccount: true,
    keywords: 'sharing machine photos notes goals cardio body weight',
    selector: '.sharing-options',
    reveal: ['Profile sharing', 'What you share'],
  },
  {
    id: 'live-activity',
    group: 'account',
    title: 'Live activity',
    page: 'settings',
    requiresAccount: true,
    keywords: 'online status last active live workouts working out presence friends',
    selector: '.sharing-live',
    reveal: ['Profile sharing', 'Live activity'],
  },
  {
    id: 'password',
    group: 'account',
    title: 'Change password',
    page: 'settings',
    requiresAccount: true,
    keywords: 'security login account',
    selector: '.account-password input[autocomplete="current-password"]',
    reveal: ['Change password'],
  },
  {
    id: 'signout',
    group: 'account',
    title: 'Sign out',
    page: 'settings',
    requiresAccount: true,
    keywords: 'logout log out all devices session',
    selector: '#profile-session-title',
  },
  {
    id: 'profile-sex',
    title: 'Sex',
    page: 'profile',
    requiresAccount: true,
    keywords: 'male female gender profile body figure',
    selector: '.profile-sex-field',
    editProfile: true,
  },
  {
    id: 'cardio-zones',
    title: 'Heart-rate zones',
    page: 'cardio',
    keywords: 'cardio zone zones heart rate hr bpm zone 2 weekly goal minutes',
    selector: '[aria-label="Edit heart-rate zones and goals"]',
  },
  {
    id: 'home-check-in',
    title: 'Home check-in card',
    page: 'dashboard',
    keywords: 'check-in checkin weigh-in bodyweight body weight fat customise layout home card',
    selector: '.home-section',
    action: { target: 'home-edit' },
  },
  {
    id: 'admin',
    title: 'Admin console',
    page: 'admin',
    requiresAdmin: true,
    keywords: 'administrator accounts users sign-ups registration limits server storage feedback',
    selector: '#admin-users-title',
  },
  {
    id: 'delete',
    group: 'account',
    title: 'Delete account',
    page: 'settings',
    requiresAccount: true,
    keywords: 'remove permanently danger',
    selector: '.danger-zone h2',
  },
];

interface SearchField {
  words: string[];
  /** Neighbouring words written together, so "signout" finds Sign out. */
  joined: { text: string; first: string }[];
  weight: number;
}

function searchField(text: string, weight: number): SearchField {
  const words = searchWords(text);
  const joined = words
    .slice(1)
    .map((word, index) => ({ text: words[index] + word, first: words[index] }));
  return { words, joined, weight };
}

const SEARCH_FIELDS = new Map(
  SETTINGS_DESTINATIONS.map((entry) => [
    entry.id,
    [
      searchField(entry.title, 0),
      searchField(entry.keywords, 2),
      searchField(entry.group ? SETTINGS_GROUP_LABELS[entry.group] : '', 3),
    ],
  ]),
);

/** "timers" and "colours" also match timer and colour. */
const singular = (word: string) =>
  word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : null;

/**
 * Scores one searched word against a field as typed: a whole word, the start of a word (so
 * "plate" does not find templates) or words written together. Lower is better.
 */
function exactScore(query: string, field: SearchField): number | null {
  const stem = singular(query);
  const scores: number[] = [];
  for (const word of field.words) {
    if (word === query) scores.push(0);
    else if (word.startsWith(query)) scores.push(1 + (word.length - query.length) * 0.01);
    else if (stem && word === stem) scores.push(0.5);
  }
  for (const { text, first } of field.joined) {
    if (query.length > first.length && text.startsWith(query))
      scores.push(text === query ? 0.5 : 1.5);
  }
  return scores.length ? Math.min(...scores) + field.weight : null;
}

/** Scores a mistyped word, such as "pasword" or "notifcations". */
function typoScore(query: string, field: SearchField): number | null {
  const scores = [...field.words, ...field.joined.map(({ text }) => text)].flatMap((word) => {
    const match = typoMatch(query, word);
    return match ? [3 + match.distance + (match.length === word.length ? 0 : 0.5)] : [];
  });
  return scores.length ? Math.min(...scores) + field.weight : null;
}

export function searchSettings(
  query: string,
  includeProfile = true,
  includeAdmin = false,
): SettingsDestination[] {
  const words = searchWords(query);
  if (!words.length) return [];
  const available = SETTINGS_DESTINATIONS.filter(
    (entry) =>
      (includeProfile || (entry.page !== 'profile' && !entry.requiresAccount)) &&
      (includeAdmin || !entry.requiresAdmin),
  );
  const fields = (entry: SettingsDestination) => SEARCH_FIELDS.get(entry.id) ?? [];
  // Typing mistakes are only forgiven for a word that matches nothing as typed, so "timer"
  // finds Rest timer but not Show rest times.
  const forgiving = words.map(
    (word) =>
      !available.some((entry) => fields(entry).some((field) => exactScore(word, field) !== null)),
  );
  return available
    .map((entry, index) => {
      let score = 0;
      for (const [position, word] of words.entries()) {
        const scores = fields(entry).flatMap((field) => {
          const value = forgiving[position] ? typoScore(word, field) : exactScore(word, field);
          return value === null ? [] : [value];
        });
        if (!scores.length) return null;
        score += Math.min(...scores);
      }
      return { entry, index, score };
    })
    .filter((match) => match !== null)
    .sort((first, second) => first.score - second.score || first.index - second.index)
    .map(({ entry }) => entry);
}

export interface SettingsJump {
  destination: SettingsDestination;
  serial: number;
}
export const SettingsNavigationContext = createContext<{
  request: SettingsJump | null;
  navigate: (destination: SettingsDestination) => void;
} | null>(null);

/** Open folded sections without invoking any setting's action. */
export function useSettingsReveal(title: string, reveal: () => void) {
  const navigation = useContext(SettingsNavigationContext);
  const callback = useRef(reveal);
  callback.current = reveal;
  useEffect(() => {
    if (navigation?.request?.destination.reveal?.includes(title)) callback.current();
  }, [navigation?.request, title]);
}

/** Runs after page navigation and destination controls have been revealed. */
export function useSettingsPageJump(page: SettingsPage, active: boolean) {
  const navigation = useContext(SettingsNavigationContext);
  const handled = useRef(0);
  useEffect(() => {
    const request = navigation?.request;
    if (
      !active ||
      !request ||
      request.destination.page !== page ||
      handled.current === request.serial
    )
      return;
    const { destination, serial } = request;
    let first = 0;
    let second = 0;
    let queued = false;
    const observer = new MutationObserver(queueFocus);
    const expiry = setTimeout(() => observer.disconnect(), 15000);
    function queueFocus() {
      if (queued || handled.current === serial) return;
      queued = true;
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          queued = false;
          // Screens other than Settings and Profile are found by the control itself.
          const root = document.querySelector(`[data-settings-page="${page}"]`) ?? document;
          const target = Array.from(root.querySelectorAll<HTMLElement>(destination.selector)).find(
            (element) => !element.closest('.is-collapsed, [hidden]'),
          );
          if (!target) return;
          handled.current = serial;
          observer.disconnect();
          clearTimeout(expiry);
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          if (!target.matches('input,button,select,textarea,a')) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        });
      });
    }
    // Optional shared fields may arrive after a server request on the first profile visit.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
    queueFocus();
    return () => {
      observer.disconnect();
      clearTimeout(expiry);
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [active, navigation?.request, page]);
}
