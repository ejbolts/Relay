import { describe, expect, it } from 'vitest';
import { homeTipCopy, homeTipCount, homeTipFacts, homeTipList } from './homeTipList';
import { freshTips } from './tipsState';
import type { TrackedWorkout } from './types';

const workout = (date: string, extra: Partial<TrackedWorkout> = {}) =>
  ({ id: date, workout_date: date, name: 'Push', movements: [], ...extra }) as TrackedWorkout;

const facts = (overrides: Partial<ReturnType<typeof homeTipFacts>> = {}) => ({
  ...homeTipFacts({
    workouts: [],
    today: '2026-03-01',
    blockCount: 0,
    hasSplit: false,
    goalReached: false,
  }),
  ...overrides,
});

describe('Home tips', () => {
  it('counts weeks and workouts without the sample workout, and ages the account', () => {
    const result = homeTipFacts({
      workouts: [
        workout('2026-02-02'),
        workout('2026-02-04'),
        workout('2026-02-10'),
        workout('2026-02-20', { is_sample: true }),
      ],
      createdAt: '2026-02-20T09:00:00Z',
      today: '2026-03-01',
      blockCount: null,
      hasSplit: false,
      goalReached: false,
    });
    expect(result).toMatchObject({ weeks: 2, workouts: 3, oldEnough: true, blockCount: null });
  });

  it('lists the most useful tips first and only once they apply', () => {
    expect(homeTipList(facts(), freshTips())).toEqual(['friends', 'appearance']);
    expect(
      homeTipList(
        facts({ weeks: 4, workouts: 5, oldEnough: true, goalReached: true }),
        freshTips(),
      ),
    ).toEqual(['blocks', 'split', 'maintenance', 'home', 'friends', 'appearance']);
    // Blocks that are still loading never suggest starting one.
    expect(homeTipList(facts({ weeks: 4, blockCount: null }), freshTips())).not.toContain('blocks');
    expect(homeTipList(facts({ hasSplit: true, weeks: 3 }), freshTips())).toContain('repRange');
  });

  it('leaves out tips learned, dismissed or put away', () => {
    const state = {
      ...freshTips(),
      seen: { friends: 'dismissed' as const },
      homeDone: ['appearance' as const],
    };
    expect(homeTipList(facts({ oldEnough: true }), state)).toEqual(['home']);
  });

  it('words each tip for Home and counts up to 9+', () => {
    expect(homeTipCopy('friends').title).toBe('Train alongside a friend');
    expect(homeTipCopy('swap').body).toContain('keeps your planned sets');
    expect(homeTipCopy(undefined).title).toBe("You're all caught up");
    expect(homeTipCount(3)).toBe('3');
    expect(homeTipCount(12)).toBe('9+');
  });
});
