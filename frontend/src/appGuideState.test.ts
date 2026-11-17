import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appGuideWaiting,
  finishAppGuide,
  finishAppTour,
  importStepWaiting,
  nextOnboardingPrompt,
  queueAppGuide,
} from './appGuideState';
import { appGuideSteps } from './appGuideSteps';

afterEach(() => vi.unstubAllGlobals());

describe('feature onboarding', () => {
  it('queues only a new account and remembers dismissal per account and reload', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    expect(appGuideWaiting('tour-new')).toBe(false);
    queueAppGuide('tour-new');
    expect(appGuideWaiting('tour-new')).toBe(true);
    expect(appGuideWaiting('tour-existing')).toBe(false);
    finishAppGuide('tour-new');
    queueAppGuide('tour-new');
    expect(appGuideWaiting('tour-new')).toBe(false);
    expect(stored.get('gym-logger-app-guide:tour-new')).toBe('done');
    stored.set('gym-logger-app-guide:tour-reload', 'waiting');
    expect(appGuideWaiting('tour-reload')).toBe(true);
  });

  it('follows a first tour with the import step, including after a reload', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    queueAppGuide('import-new');
    finishAppTour('import-new');
    expect(appGuideWaiting('import-new')).toBe(false);
    expect(importStepWaiting('import-new')).toBe(true);
    expect(stored.get('gym-logger-app-guide:import-new')).toBe('import');
    queueAppGuide('import-new');
    expect(importStepWaiting('import-new')).toBe(true);
    finishAppGuide('import-new');
    expect(importStepWaiting('import-new')).toBe(false);
    // Replaying a finished tour from Settings does not bring the import step back.
    finishAppTour('import-new');
    expect(importStepWaiting('import-new')).toBe(false);
    stored.set('gym-logger-app-guide:import-reload', 'import');
    expect(importStepWaiting('import-reload')).toBe(true);
  });

  it('shows the tour, then the import step, then What is new', () => {
    const order = { tour: true, importStep: true, release: true, releaseHeld: false };
    expect(nextOnboardingPrompt(order)).toBe('tour');
    expect(nextOnboardingPrompt({ ...order, tour: false })).toBe('import');
    expect(nextOnboardingPrompt({ ...order, tour: false, importStep: false })).toBe('release');
    // Choosing to import holds What's new until the person leaves the import screen.
    expect(
      nextOnboardingPrompt({ tour: false, importStep: false, release: true, releaseHeld: true }),
    ).toBeNull();
    expect(
      nextOnboardingPrompt({ tour: false, importStep: false, release: false, releaseHeld: false }),
    ).toBeNull();
  });

  it('works when storage is blocked, including in an installed app', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked');
      },
      matchMedia: () => ({ matches: true }),
    });
    queueAppGuide('tour-private');
    expect(appGuideWaiting('tour-private')).toBe(true);
    finishAppGuide('tour-private');
    expect(appGuideWaiting('tour-private')).toBe(false);
  });

  it('covers core features without starting a workout and respects video permissions', () => {
    expect(appGuideSteps(false).map((step) => step.target)).toEqual([
      'today',
      'start',
      'training',
      'progress',
      'social',
      'body',
      'cardio',
      'installation',
    ]);
    expect(appGuideSteps(true).map((step) => step.target)).toContain('videos');
    expect(appGuideSteps(true).some((step) => step.tab === 'log' || step.tab === 'videos')).toBe(
      false,
    );
  });
});
