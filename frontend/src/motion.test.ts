import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyReduceMotion,
  motionReduced,
  reduceMotionPreference,
  saveReduceMotionPreference,
} from './motion';

function stubBrowser({ systemReduced = false } = {}) {
  const storage = new Map<string, string>();
  const attributes = new Set<string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    matchMedia: (query: string) => ({
      matches: systemReduced && query.includes('prefers-reduced-motion: reduce'),
    }),
  });
  vi.stubGlobal('document', {
    documentElement: {
      hasAttribute: (name: string) => attributes.has(name),
      toggleAttribute: (name: string, force: boolean) => {
        if (force) attributes.add(name);
        else attributes.delete(name);
        return force;
      },
    },
  });
  return { storage, attributes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reduce animations preference', () => {
  it('defaults to full motion and persists the choice', () => {
    const { storage } = stubBrowser();

    expect(reduceMotionPreference()).toBe(false);
    saveReduceMotionPreference(true);
    expect(storage.get('gym-logger-reduce-motion')).toBe('reduced');
    expect(reduceMotionPreference()).toBe(true);
    saveReduceMotionPreference(false);
    expect(reduceMotionPreference()).toBe(false);
  });

  it('reduces motion when the app setting or the phone setting asks for it', () => {
    const { attributes } = stubBrowser();

    expect(motionReduced()).toBe(false);
    applyReduceMotion(true);
    expect(attributes.has('data-reduce-motion')).toBe(true);
    expect(motionReduced()).toBe(true);
    applyReduceMotion(false);
    expect(motionReduced()).toBe(false);

    vi.unstubAllGlobals();
    stubBrowser({ systemReduced: true });
    expect(motionReduced()).toBe(true);
  });
});
