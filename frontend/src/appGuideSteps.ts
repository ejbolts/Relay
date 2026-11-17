import type { AppTab } from './appNavigation';
import type { IconName } from './Icon';

export interface AppGuideStep {
  title: string;
  description: string;
  target: string;
  tab: AppTab;
  icon: IconName;
}

export function appGuideSteps(videosAllowed: boolean): AppGuideStep[] {
  return [
    {
      title: 'Your training, at a glance',
      description:
        'Home brings together your week, training calendar and suggested next session. Come back here to see how you are doing.',
      target: 'today',
      tab: 'dashboard',
      icon: 'home',
    },
    {
      title: 'Start a workout',
      description:
        'Tap Start to choose exercises and log sets, reps, weight and effort. Rest timers keep you moving. If a workout is already running, this button resumes it.',
      target: 'start',
      tab: 'dashboard',
      icon: 'plus',
    },
    {
      title: 'Your training in one place',
      description:
        'Training keeps your calendar and saved workouts in Sessions. Review notes, machine photos and older workouts here, or switch to Cardio.',
      target: 'training',
      tab: 'training',
      icon: 'calendar',
    },
    {
      title: 'Watch your progress',
      description:
        'Open Exercises in Training and choose a lift to explore its existing charts, records and previous sessions.',
      target: 'progress',
      tab: 'progress',
      icon: 'trend',
    },
    {
      title: 'Train alongside friends',
      description:
        'Social shows each friend’s latest session and lets you react. Use Find to search for people and answer friend requests. Your sharing choices still apply.',
      target: 'social',
      tab: 'social',
      icon: 'people',
    },
    {
      title: 'Track your body',
      description:
        'Log body weight and optional body-fat measurements, follow trends and set a weight goal. A single check-in is enough to get started.',
      target: 'body',
      tab: 'body',
      icon: 'body',
    },
    {
      title: 'Keep cardio in the picture',
      description:
        'Open Cardio from this Home card. Log sessions and machine metrics, and compare your time, distance and energy across date ranges.',
      target: 'cardio',
      tab: 'dashboard',
      icon: 'heart',
    },
    ...(videosAllowed
      ? [
          {
            title: 'Save your workout videos',
            description:
              'The video logger batches set clips into one workout video. Follow its upload steps to keep a record of your technique.',
            target: 'videos',
            tab: 'dashboard' as const,
            icon: 'video' as const,
          },
        ]
      : []),
    {
      title: 'Make Relay your own',
      description:
        'Settings has illustrated Add to Home Screen steps, timers, phone alerts and display preferences. Use Replay guide here whenever you need a refresher.',
      target: 'installation',
      tab: 'settings',
      icon: 'settings',
    },
  ];
}

export const PROJECT_URL = 'https://github.com/ejbolts/Relay';
export const CONTRIBUTING_URL = `${PROJECT_URL}/blob/main/CONTRIBUTING.md`;
