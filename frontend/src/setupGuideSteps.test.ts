import { describe, expect, it } from 'vitest';
import { appGuideProgress } from './appGuideProgress';
import { appGuideSteps } from './appGuideSteps';
import { blocksGuideSteps, guideDone, splitGuideSteps } from './setupGuideSteps';
import { parseTips } from './tipsState';
import { parseWorkoutShareReminder, storedWorkoutShareReminder } from './workoutShareReminder';

describe('shared guide rules', () => {
  it('personalises the blocks and split guides with your own training', () => {
    const lift = { name: 'Bench press', sessions: 4, latestTopKg: 80, bestKg: 85 };
    expect(blocksGuideSteps(lift)[3].body).toContain('Bench press records start fresh');
    expect(blocksGuideSteps(null)[3].body).toContain('and records start fresh');
    const split = splitGuideSteps({ lift, rotation: ['Push', 'Pull', 'Legs'] }, (kg) => `${kg} kg`);
    expect(split).toHaveLength(6);
    expect(split[0].body).toContain('went Push, Pull, Legs');
    expect(split[2].body).toContain('stay at 80 kg on Bench press');
  });

  it('counts a guide as done once its feature is in use', () => {
    expect(guideDone('blocks', {}, true)).toBe(true);
    expect(guideDone('split', { split: 'learned' }, false)).toBe(false);
    expect(guideDone('split', { split: 'learned', repRange: 'learned' }, false)).toBe(true);
  });

  it('keeps guide progress in any storage, and in memory when storage fails', () => {
    const stored = new Map<string, string>();
    const progress = appGuideProgress(() => ({
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
    }));
    progress.queueAppGuide('new');
    expect(progress.appGuideWaiting('new')).toBe(true);
    const broken = appGuideProgress(() => {
      throw new Error('blocked');
    });
    broken.queueAppGuide('new');
    expect(broken.appGuideWaiting('new')).toBe(true);
  });

  it('words the tour for the app without Add to Home Screen', () => {
    const last = appGuideSteps(false, { app: true }).at(-1)!;
    expect(last.description).not.toContain('Add to Home Screen');
    expect(appGuideSteps(false).at(-1)!.description).toContain('Add to Home Screen');
  });

  it('reads stored tips and the share reminder safely', () => {
    expect(parseTips('not json').enabled).toBe(true);
    expect(
      parseTips(JSON.stringify({ enabled: false, seen: { swap: 'seen', x: 'seen' } })),
    ).toMatchObject({ enabled: false, seen: { swap: 'seen' } });
    expect(parseWorkoutShareReminder(null)).toBe(true);
    expect(parseWorkoutShareReminder(storedWorkoutShareReminder(false))).toBe(false);
  });
});
