import type { AppTab } from './appNavigation';

export interface AppGuideStep {
  title: string;
  description: string;
  target: string;
  tab: AppTab;
}

/**
 * The quick tour. `app` is the native app, which is already on the phone's home screen, so its
 * last step leaves out the web's Add to Home Screen steps.
 */
export function appGuideSteps(videosAllowed: boolean, { app = false } = {}): AppGuideStep[] {
  return [
    {
      title: 'Your training, at a glance',
      description:
        'Home brings together your week, training calendar and suggested next session. Come back here to see how you are doing.',
      target: 'today',
      tab: 'dashboard',
    },
    {
      title: 'Start a workout',
      description:
        'Tap Start to choose exercises and log sets, reps, weight and effort. Rest timers keep you moving. If a workout is already running, this button resumes it.',
      target: 'start',
      tab: 'dashboard',
    },
    {
      title: 'Your training in one place',
      description:
        'Training keeps your calendar and saved workouts in Sessions. Review notes, machine photos and older workouts here, or switch to Cardio.',
      target: 'training',
      tab: 'training',
    },
    {
      title: 'Watch your progress',
      description:
        'Open Exercises in Training and choose a lift to explore its existing charts, records and previous sessions.',
      target: 'progress',
      tab: 'progress',
    },
    {
      title: 'Train alongside friends',
      description:
        'Social shows each friend’s latest session and lets you react. Use Find to search for people and answer friend requests. Your sharing choices still apply.',
      target: 'social',
      tab: 'social',
    },
    {
      title: 'Track your body',
      description:
        'Log body weight and optional body-fat measurements, follow trends and set a weight goal. A single check-in is enough to get started.',
      target: 'body',
      tab: 'body',
    },
    {
      title: 'Keep cardio in the picture',
      description:
        'Open Cardio from this Home card. Log sessions and machine metrics, and compare your time, distance and energy across date ranges.',
      target: 'cardio',
      tab: 'dashboard',
    },
    ...(videosAllowed
      ? [
          {
            title: 'Save your workout videos',
            description:
              'The video logger batches set clips into one workout video. Follow its upload steps to keep a record of your technique.',
            target: 'videos',
            tab: 'dashboard' as const,
          },
        ]
      : []),
    {
      title: 'Make Relay your own',
      description: app
        ? 'Settings has timers, notifications and display preferences. Use Replay guide in its Guides whenever you need a refresher.'
        : 'Settings has illustrated Add to Home Screen steps, timers, phone alerts and display preferences. Use Replay guide here whenever you need a refresher.',
      target: 'installation',
      tab: 'settings',
    },
  ];
}

/** The tour's last page, after its steps. */
export const APP_GUIDE_THANKS = {
  kicker: 'YOU ARE READY',
  title: 'Thanks for trying Relay!',
  body: 'We hope it makes your next workout a little easier. What worked well, and what could be better?',
  contributeTitle: 'Want to help build Relay?',
  contributeBody:
    'Check existing issues, discuss bigger changes first, then work on a focused branch or fork. Use sample data, run the project checks and include screenshots for UI changes in your pull request.',
} as const;

export const PROJECT_URL = 'https://github.com/ejbolts/Relay';
export const CONTRIBUTING_URL = `${PROJECT_URL}/blob/main/CONTRIBUTING.md`;
