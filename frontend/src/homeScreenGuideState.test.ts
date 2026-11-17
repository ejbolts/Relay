import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finishHomeScreenGuide,
  homeScreenGuideWaiting,
  queueHomeScreenGuide,
  runningAsInstalledApp,
} from './homeScreenGuideState';

afterEach(() => vi.unstubAllGlobals());

function browser({ installed = false } = {}) {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    matchMedia: () => ({ matches: installed }),
  });
  vi.stubGlobal('navigator', {});
  return values;
}

describe('home screen guide', () => {
  it('waits only for a newly created account until that account dismisses it', () => {
    const values = browser();
    expect(homeScreenGuideWaiting('new-lifter')).toBe(false);
    queueHomeScreenGuide('new-lifter');
    expect(homeScreenGuideWaiting('new-lifter')).toBe(true);
    expect(homeScreenGuideWaiting('existing-lifter')).toBe(false);
    finishHomeScreenGuide('new-lifter');
    expect(homeScreenGuideWaiting('new-lifter')).toBe(false);
    expect(values.get('gym-logger-home-screen-guide:new-lifter')).toBe('done');
    // Creating the account again on this browser does not bring a dismissed guide back.
    queueHomeScreenGuide('new-lifter');
    expect(homeScreenGuideWaiting('new-lifter')).toBe(false);
  });

  it('remembers a guide queued in an earlier page load', () => {
    const values = browser();
    values.set('gym-logger-home-screen-guide:returning', 'waiting');
    expect(homeScreenGuideWaiting('returning')).toBe(true);
  });

  it('skips the guide when the app is already opened from the Home Screen', () => {
    browser({ installed: true });
    queueHomeScreenGuide('installed-lifter');
    expect(runningAsInstalledApp()).toBe(true);
    expect(homeScreenGuideWaiting('installed-lifter')).toBe(false);

    browser();
    vi.stubGlobal('navigator', { standalone: true });
    expect(runningAsInstalledApp()).toBe(true);
  });

  it('still follows the guide for the current session when browser storage is denied', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage denied');
      },
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('navigator', {});
    queueHomeScreenGuide('private-lifter');
    expect(homeScreenGuideWaiting('private-lifter')).toBe(true);
    expect(() => finishHomeScreenGuide('private-lifter')).not.toThrow();
    expect(homeScreenGuideWaiting('private-lifter')).toBe(false);
  });
});
