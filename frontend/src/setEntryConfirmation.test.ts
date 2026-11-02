import { describe, expect, it } from 'vitest';
import { isUnusuallyHighWeight, unusualSetEntryWarning } from './setEntryConfirmation';

describe('set entry confirmation', () => {
  it('suppresses rep warnings only, retaining an independent high-weight warning', () => {
    expect(
      unusualSetEntryWarning({
        reps: 30,
        weightKg: 80,
        referenceWeightKg: 80,
        skipHighRepWarning: true,
      }),
    ).toBeNull();
    const warning = unusualSetEntryWarning({
      reps: 30,
      weightKg: 300,
      referenceWeightKg: 80,
      skipHighRepWarning: true,
    });
    expect(warning?.title).toBe('Is 300 kg intended?');
    expect(warning?.highReps).toBe(false);
    expect(warning?.message).not.toContain('reps');
  });

  it('offers the rep preference on rep-only and combined warnings, but not weight-only warnings', () => {
    expect(
      unusualSetEntryWarning({ reps: 25, weightKg: 80, referenceWeightKg: 80 })?.highReps,
    ).toBe(true);
    expect(
      unusualSetEntryWarning({ reps: 25, weightKg: 300, referenceWeightKg: 80 })?.highReps,
    ).toBe(true);
    expect(
      unusualSetEntryWarning({ reps: 5, weightKg: 300, referenceWeightKg: 80 })?.highReps,
    ).toBe(false);
  });

  it('warns when a newly logged set is over 20 reps', () => {
    expect(unusualSetEntryWarning({ reps: 21, weightKg: 80, referenceWeightKg: 80 })?.title).toBe(
      'Add high rep set?',
    );
  });

  it('does not warn when editing another field on an existing high-rep set', () => {
    expect(
      unusualSetEntryWarning({
        reps: 25,
        originalReps: 25,
        weightKg: 80,
        referenceWeightKg: 80,
      }),
    ).toBeNull();
  });

  it('detects doubled loads, 100 kg jumps, and high values without a reference', () => {
    expect(isUnusuallyHighWeight(120, 60)).toBe(true);
    expect(isUnusuallyHighWeight(280, 180)).toBe(true);
    expect(isUnusuallyHighWeight(300, null)).toBe(true);
    expect(isUnusuallyHighWeight(180, 100)).toBe(false);
  });

  it('combines both warnings when reps and weight are unusually high', () => {
    expect(unusualSetEntryWarning({ reps: 30, weightKg: 300, referenceWeightKg: 100 })?.title).toBe(
      'Add high rep and weight set?',
    );
  });

  it('keeps warning thresholds in kg and describes the entered and reference loads in pounds', () => {
    const warning = unusualSetEntryWarning({ reps: 5, weightKg: 120, referenceWeightKg: 60 }, 'lb');
    expect(warning?.title).toBe('Is 264.55 lb intended?');
    expect(warning?.message).toContain('132.28 lb');
    expect(warning?.message).not.toContain('kg');
    expect(
      unusualSetEntryWarning({ reps: 5, weightKg: 100, referenceWeightKg: 80 }, 'lb'),
    ).toBeNull();
  });
});
