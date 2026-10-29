import { describe, expect, it } from 'vitest';
import {
  defaultHomeLayout,
  HOME_SECTIONS,
  fillHomeSectionGap,
  homeSectionGaps,
  homeSectionSpans,
  moveHomeSection,
  toggleHomeSection,
  toggleHomeSectionWidth,
  homeSectionSettings,
  updateHomeSectionSettings,
} from './homeLayout';

describe('Home layout edits', () => {
  it('unhides and fits a section to a third-width gap while retaining other preferences', () => {
    const saved = {
      ...defaultHomeLayout(),
      hidden: ['friends' as const],
      widths: {
        friends: 'full' as const,
        workouts: 'compact' as const,
        'cardio-sessions': 'compact' as const,
      },
    };
    const added = fillHomeSectionGap(saved, 'friends', 'cardio-sessions', 2);
    expect(added.hidden).toEqual([]);
    expect(added.widths?.friends).toBe('third');
    expect(homeSectionSpans(['workouts', 'cardio-sessions', 'friends'], added.widths)).toEqual([
      2, 2, 2,
    ]);
    expect(saved.hidden).toEqual(['friends']);
    expect(saved.widths.friends).toBe('full');
  });
  it('fills unusable strips in mixed-size rows without removing usable drop spaces', () => {
    const widths = {
      consistency: 'compact',
      'weekly-bodyweight': 'compact',
      workouts: 'compact',
      'cardio-sessions': 'compact',
    } as const;
    expect(
      homeSectionSpans(['consistency', 'weekly-bodyweight', 'workouts', 'cardio-sessions'], widths),
    ).toEqual([3, 3, 2, 2]);
    expect(homeSectionSpans(['weekly-bodyweight', 'consistency'], widths)).toEqual([3, 3]);
    expect(homeSectionSpans(['consistency'], widths)).toEqual([3]);
    expect(homeSectionSpans(['workouts', 'cardio-sessions'], widths)).toEqual([2, 2]);
  });
  it('finds empty space beside a compact card before a full row and at the end', () => {
    expect([...homeSectionGaps(['consistency', 'friends', 'zone2'], [3, 6, 3])]).toEqual([
      ['consistency', 3],
      ['zone2', 3],
    ]);
    expect([...homeSectionGaps(['workouts', 'cardio-sessions', 'zone2'], [2, 2, 3])]).toEqual([
      ['cardio-sessions', 2],
      ['zone2', 3],
    ]);
    expect([...homeSectionGaps(['zone2', 'bodyweight-trend'], [3, 3])]).toEqual([]);
    expect([...homeSectionGaps([], [])]).toEqual([]);
    expect([...homeSectionGaps(['workouts', 'consistency', 'friends'], [2, 3, 6])]).toEqual([]);
  });

  it('fills a gap from either direction and keeps the source compact after saving', () => {
    const saved = { ...defaultHomeLayout(), widths: { consistency: 'compact' as const } };
    const moved = fillHomeSectionGap(saved, 'zone2', 'consistency');
    expect(moved.order[moved.order.indexOf('consistency') + 1]).toBe('zone2');
    expect(moved.widths).toEqual({ consistency: 'compact', zone2: 'compact' });
    expect(homeSectionSpans(['consistency', 'zone2', 'friends'], moved.widths)).toEqual([3, 3, 6]);
    const forward = fillHomeSectionGap(saved, 'zone2', 'friends');
    expect(forward.order[forward.order.indexOf('friends') + 1]).toBe('zone2');
    expect(new Set(forward.order).size).toBe(HOME_SECTIONS.length);
    expect(moved.hidden).toEqual(saved.hidden);
    expect(saved.widths).toEqual({ consistency: 'compact' });
    expect(fillHomeSectionGap(saved, 'zone2', 'zone2')).toBe(saved);
  });
  it('fills rows after hiding or moving small cards without changing their order', () => {
    expect(homeSectionSpans(['workouts', 'cardio-sessions', 'weekly-bodyweight'])).toEqual([
      2, 2, 2,
    ]);
    expect(homeSectionSpans(['workouts', 'weekly-bodyweight'])).toEqual([3, 3]);
    expect(homeSectionSpans(['workouts', 'consistency', 'zone2', 'bodyweight-trend'])).toEqual([
      6, 6, 3, 3,
    ]);
    expect(homeSectionSpans(['zone2', 'records', 'bodyweight-trend'])).toEqual([6, 6, 6]);
  });
  it('moves in either direction while retaining hidden sections and not mutating the saved layout', () => {
    const saved = { ...defaultHomeLayout(), hidden: ['records' as const] };
    const reordered = moveHomeSection(saved, 'consistency', 'profile');
    expect(reordered.order[0]).toBe('consistency');
    expect(reordered.order).toHaveLength(HOME_SECTIONS.length);
    expect(new Set(reordered.order).size).toBe(HOME_SECTIONS.length);
    expect(reordered.hidden).toEqual(['records']);
    expect(saved.order[0]).toBe('profile');
    expect(moveHomeSection(reordered, 'consistency', 'friends').order.at(-1)).toBe('consistency');
    expect(moveHomeSection(saved, 'records', 'records')).toBe(saved);
  });

  it('restores hidden sections at their saved position', () => {
    const saved = defaultHomeLayout();
    const hidden = toggleHomeSection(saved, 'workouts');
    expect(hidden.hidden).toEqual([...saved.hidden, 'workouts']);
    expect(saved.hidden).toEqual(defaultHomeLayout().hidden);
    expect(toggleHomeSection(hidden, 'workouts')).toEqual(saved);
  });

  it('keeps explicitly resized cards at their chosen width and preserves default packing', () => {
    expect(
      homeSectionSpans(['workouts', 'cardio-sessions', 'weekly-bodyweight'], {
        workouts: 'full',
      }),
    ).toEqual([6, 3, 3]);
    expect(
      homeSectionSpans(['combined-check-in', 'records'], {
        'combined-check-in': 'compact',
        records: 'compact',
      }),
    ).toEqual([3, 3]);
    expect(homeSectionSpans(['combined-check-in'], { 'combined-check-in': 'compact' })).toEqual([
      3,
    ]);
    expect(homeSectionSpans(['workouts'], { workouts: 'compact' })).toEqual([2]);
  });

  it('resizes without mutating saved widths, order or visibility and resets overrides', () => {
    const saved = { ...defaultHomeLayout(), widths: { records: 'compact' as const } };
    const compact = toggleHomeSectionWidth(saved, 'combined-check-in', 6);
    expect(compact.widths).toEqual({ records: 'compact', 'combined-check-in': 'compact' });
    expect(compact.order).toEqual(saved.order);
    expect(compact.hidden).toEqual(saved.hidden);
    expect(saved.widths).toEqual({ records: 'compact' });
    expect(toggleHomeSectionWidth(compact, 'combined-check-in', 3).widths).toEqual({
      records: 'compact',
      'combined-check-in': 'full',
    });
    expect(moveHomeSection(compact, 'records', 'workouts').widths).toEqual(compact.widths);
    expect(toggleHomeSection(compact, 'records').widths).toEqual(compact.widths);
    expect(defaultHomeLayout().widths).toEqual({});
  });

  it('returns expanded stats to their shared row when shrinking and fills remaining space', () => {
    const stats = ['workouts', 'cardio-sessions', 'weekly-bodyweight'] as const;
    const expanded = toggleHomeSectionWidth(defaultHomeLayout(), 'workouts', 2);
    expect(homeSectionSpans([...stats], expanded.widths)).toEqual([6, 3, 3]);
    const shrunk = toggleHomeSectionWidth(expanded, 'workouts', 6);
    expect(homeSectionSpans([...stats], shrunk.widths)).toEqual([2, 2, 2]);
    expect(homeSectionSpans(['workouts', 'cardio-sessions'], shrunk.widths)).toEqual([2, 4]);
    expect(homeSectionSpans(['cardio-sessions', 'workouts'], shrunk.widths)).toEqual([4, 2]);
    expect(homeSectionSpans(['workouts', 'consistency'], shrunk.widths)).toEqual([2, 6]);
  });
});

describe('Home section settings', () => {
  it('defaults older layouts and updates one option without losing the others', () => {
    const older = { order: defaultHomeLayout().order, hidden: [] };
    expect(homeSectionSettings(older, 'zone2')).toEqual({ zone: null, style: 'progress' });
    const ring = updateHomeSectionSettings(older, 'zone2', { style: 'ring' });
    const zone4 = updateHomeSectionSettings(ring, 'zone2', { zone: 4 });
    expect(zone4.settings?.zone2).toEqual({ zone: 4, style: 'ring' });
    expect(zone4.order).toBe(older.order);
    expect(older).not.toHaveProperty('settings');
  });
});
