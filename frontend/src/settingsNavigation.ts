import { createContext, useContext, useEffect, useRef } from 'react';

export const SETTINGS_GROUP_LABELS = {
  training: 'Training',
  appearance: 'Appearance',
  notifications: 'Notifications',
  account: 'Account & privacy',
  data: 'Data & connections',
  help: 'Help & about',
} as const;
export type SettingsGroupId = keyof typeof SETTINGS_GROUP_LABELS;

export interface SettingsDestination {
  id: string;
  title: string;
  page: 'settings' | 'profile';
  group?: SettingsGroupId;
  keywords: string;
  selector: string;
  reveal?: string[];
  editProfile?: boolean;
  requiresAccount?: boolean;
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
  {
    id: 'training-split',
    group: 'training',
    title: 'Your split',
    page: 'settings',
    keywords:
      'schedule rotation upper lower push pull legs ppl full body fbeod cardio rest templates cycle',
    selector: '#training-split-settings',
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
    keywords: 'notifications reminders push',
    selector: '#notification-settings-title',
  },
  {
    id: 'appearance',
    group: 'appearance',
    title: 'App theme',
    page: 'settings',
    keywords:
      'appearance light dark mode colour color palette accent blue green purple plum emerald amber coral',
    selector: '#colour-theme-title',
  },
  {
    id: 'training',
    group: 'training',
    title: 'Training preferences',
    page: 'settings',
    keywords:
      'weight units kg lb kilograms pounds week starts schedule weekly muscle sets goal warmups',
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
    id: 'delete',
    group: 'account',
    title: 'Delete account',
    page: 'settings',
    requiresAccount: true,
    keywords: 'remove permanently danger',
    selector: '.danger-zone h2',
  },
];

export function searchSettings(query: string, includeProfile = true): SettingsDestination[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTINGS_DESTINATIONS.filter(
    (entry) =>
      (includeProfile || (entry.page !== 'profile' && !entry.requiresAccount)) &&
      words.every((word) => `${entry.title} ${entry.keywords}`.toLocaleLowerCase().includes(word)),
  );
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
export function useSettingsPageJump(page: 'settings' | 'profile', active: boolean) {
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
          const root = document.querySelector(`[data-settings-page="${page}"]`);
          const target = root?.querySelector<HTMLElement>(destination.selector);
          if (!target || target.closest('.is-collapsed, [hidden]')) return;
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
