import { describe, expect, it } from 'vitest';
import {
  appTabFromHash,
  createAppHistoryState,
  historySectionForTab,
  isAppHistoryState,
  isAppTab,
  mainTabFor,
} from './appNavigation';

describe('app navigation history', () => {
  it('recognises app tabs and falls back to the dashboard for unknown hashes', () => {
    expect(isAppTab('history')).toBe(true);
    expect(isAppTab('unknown')).toBe(false);
    expect(appTabFromHash('#progress')).toBe('progress');
    expect(appTabFromHash('#training')).toBe('training');
    expect(appTabFromHash('#social')).toBe('social');
    expect(appTabFromHash('#shared')).toBe('social');
    expect(appTabFromHash('#cardio')).toBe('cardio');
    expect(appTabFromHash('#log')).toBe('log');
    expect(appTabFromHash('#split')).toBe('split');
    expect(appTabFromHash('#admin')).toBe('admin');
    expect(appTabFromHash('#missing')).toBe('dashboard');
  });

  it('creates and validates app-owned history entries', () => {
    const state = createAppHistoryState('body', 3);

    expect(state).toEqual({ gymLogger: true, index: 3, tab: 'body' });
    expect(isAppHistoryState(state)).toBe(true);
    expect(isAppHistoryState(createAppHistoryState('progress', 1))).toBe(true);
    expect(isAppHistoryState({ gymLogger: true, index: -1, tab: 'body' })).toBe(false);
    expect(isAppHistoryState({ gymLogger: true, index: 2, tab: 'missing' })).toBe(false);
  });

  it('maps every screen to its history section and highlighted tab-bar item', () => {
    expect(historySectionForTab('history')).toBe('history');
    expect(historySectionForTab('training')).toBe('history');
    expect(historySectionForTab('progress')).toBe('progress');
    expect(historySectionForTab('cardio')).toBe('cardio');
    expect(historySectionForTab('body')).toBeNull();

    expect(mainTabFor('dashboard')).toBe('dashboard');
    expect(mainTabFor('cardio')).toBe('training');
    expect(mainTabFor('history')).toBe('training');
    expect(mainTabFor('progress')).toBe('training');
    expect(mainTabFor('social')).toBe('social');
    expect(mainTabFor('shared-profile')).toBe('social');
    expect(mainTabFor('body')).toBe('body');
    expect(mainTabFor('settings')).toBeNull();
    expect(mainTabFor('log')).toBeNull();
  });
});
