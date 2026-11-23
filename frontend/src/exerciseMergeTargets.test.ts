import { describe, expect, it } from 'vitest';
import {
  matchedNameParts,
  mergeNudgeTarget,
  mergeSources,
  mergeTargetDetail,
  mergeTargets,
  parseDismissedMergeSuggestions,
} from './exerciseMergeTargets';
import type { Exercise } from './types';

const exercise = (
  id: string,
  name: string,
  muscle_group: string,
  equipment: string | null,
  extra: Partial<Exercise> = {},
): Exercise => ({
  id,
  name,
  category: 'push',
  kind: 'strength',
  muscle_group,
  equipment,
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
  ...extra,
});

const raises = exercise('mine', 'Lateral raises', 'Shoulders', 'Dumbbell', { is_custom: true });
const lateral = exercise('lateral', 'Lateral Raise', 'Shoulders', 'Dumbbell');
const cable = exercise('cable', 'Cable Lateral Raise', 'Shoulders', 'Cable');
const bench = exercise('bench', 'Bench Press', 'Chest', 'Barbell');
const running = exercise('run', 'Running', 'Cardio', null, { kind: 'cardio', category: 'cardio' });
const all = [raises, lateral, cable, bench, running];

describe('mergeTargets', () => {
  it('lists nothing without a custom exercise to merge', () => {
    expect(mergeTargets(all, undefined, '')).toEqual({ candidates: [], suggested: [], listed: [] });
    expect(mergeSources(all)).toEqual([raises]);
  });

  it('puts the likeliest standard exercise under Suggested, ready ones first', () => {
    const { candidates, suggested, listed } = mergeTargets(all, raises, '');
    expect(suggested[0].exercise).toBe(lateral);
    expect(listed.map((entry) => entry.item.id)).not.toContain('lateral');
    // Cardio can never take a strength exercise's history.
    expect(candidates.map((entry) => entry.item.id)).not.toContain('run');
    expect(candidates[0]).toMatchObject({ item: lateral, ready: true });
    expect(candidates.find((entry) => entry.item === cable)).toMatchObject({
      ready: false,
      changes: { equipment: { from: 'Dumbbell', to: 'Cable' } },
    });
  });

  it('searches every exercise of the kind, without the Suggested heading', () => {
    const { candidates, suggested, listed } = mergeTargets(all, raises, 'bench');
    expect(suggested).toEqual([]);
    expect(candidates.map((entry) => entry.item)).toEqual([bench]);
    expect(listed).toEqual(candidates);
  });
});

describe('the merge nudge', () => {
  it('suggests a strong match until it is marked as not the same', () => {
    expect(mergeNudgeTarget(raises, all, {})).toBe(lateral);
    expect(mergeNudgeTarget(raises, all, { mine: 'lateral' })).toBeNull();
    expect(mergeNudgeTarget(raises, all, { mine: 'something-else' })).toBe(lateral);
    expect(mergeNudgeTarget(lateral, all, {})).toBeNull();
  });

  it('reads only custom-to-standard pairs from what a device saved', () => {
    expect(parseDismissedMergeSuggestions({ mine: 'lateral', other: 3 })).toEqual({
      mine: 'lateral',
    });
    expect(parseDismissedMergeSuggestions(['lateral'])).toEqual({});
    expect(parseDismissedMergeSuggestions(null)).toEqual({});
  });

  it('describes a destination and marks the words that matched', () => {
    expect(mergeTargetDetail(lateral)).toBe('Official · Shoulders · Dumbbell');
    expect(mergeTargetDetail(raises)).toBe('Custom · Shoulders · Dumbbell');
    expect(matchedNameParts('Cable Lateral Raise', ['lateral', 'raise'])).toEqual([
      { text: 'Cable', matched: false },
      { text: ' ', matched: false },
      { text: 'Lateral', matched: true },
      { text: ' ', matched: false },
      { text: 'Raise', matched: true },
    ]);
    expect(matchedNameParts('Bench Press', undefined)).toEqual([
      { text: 'Bench Press', matched: false },
    ]);
  });
});
