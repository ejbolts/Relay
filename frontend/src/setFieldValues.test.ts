import { describe, expect, it } from 'vitest';
import { setKindOf, setKindUpdate, setNumberLabels } from './setFieldValues';

describe('set field values', () => {
  it('numbers working sets and marks warm-up, drop and attempted sets', () => {
    const sets = [
      { set_type: 'warmup' as const, warmup: true },
      { set_type: 'normal' as const, warmup: false },
      { set_type: 'normal' as const, warmup: false, failed: true },
      { set_type: 'normal' as const, warmup: false },
      { set_type: 'drop' as const, warmup: false },
      { set_type: undefined, warmup: true },
    ];
    expect(setNumberLabels(sets)).toEqual(['W', '1', 'A', '2', 'D', 'W']);
    expect(setKindOf({ set_type: undefined, warmup: false })).toBe('normal');
  });

  it('stores each picked type as one consistent set of fields', () => {
    expect(setKindUpdate('warmup')).toEqual({ set_type: 'warmup', warmup: true, failed: false });
    expect(setKindUpdate('drop')).toEqual({ set_type: 'drop', warmup: false, failed: false });
    expect(setKindUpdate('failure')).toEqual({ set_type: 'normal', warmup: false, failed: true });
    expect(setKindUpdate('normal')).toEqual({ set_type: 'normal', warmup: false, failed: false });
    expect(setKindOf(setKindUpdate('failure'))).toBe('failure');
  });
});
