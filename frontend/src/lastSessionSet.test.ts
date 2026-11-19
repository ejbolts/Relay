import { describe, expect, it } from 'vitest';
import { matchingLastSessionSet } from './lastSessionSet';

const warmup = { set_type: 'warmup' as const, warmup: true, failed: false };
const working = { set_type: 'normal' as const, warmup: false, failed: false };
const attempted = { set_type: 'normal' as const, warmup: false, failed: true };
const drop = { set_type: 'drop' as const, warmup: false, failed: false };

describe('matchingLastSessionSet', () => {
  const last = [
    { ...warmup, id: 'w1' },
    { ...working, id: 'n1' },
    { ...working, id: 'n2' },
    { ...attempted, id: 'n3' },
    { ...drop, id: 'd1' },
  ];

  it('lines each row up with the same kind of set in the same position', () => {
    const today = [warmup, working, working, working, drop];
    expect(today.map((_, index) => matchingLastSessionSet(today, index, last)?.id)).toEqual([
      'w1',
      'n1',
      'n2',
      'n3',
      'd1',
    ]);
  });

  it('matches planned rows without a warm-up to the working sets', () => {
    const planned = [working, working];
    expect(matchingLastSessionSet(planned, 0, last)?.id).toBe('n1');
    expect(matchingLastSessionSet(planned, 1, last)?.id).toBe('n2');
  });

  it('has nothing for rows beyond last time or without a row', () => {
    const today = [working, working, working, working];
    expect(matchingLastSessionSet(today, 3, last)).toBeUndefined();
    expect(matchingLastSessionSet(today, 9, last)).toBeUndefined();
  });
});
