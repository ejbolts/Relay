import { describe, expect, it } from 'vitest';
import { PARTNER_SET_MAX, partnerRepsInput, partnerWeightInput } from './trainTogetherInput';

describe("reading a partner's set input", () => {
  it('takes whole, non-negative reps up to the limit; empty clears', () => {
    expect(partnerRepsInput('8')).toEqual({ kind: 'value', value: 8 });
    expect(partnerRepsInput(' 0 ')).toEqual({ kind: 'value', value: 0 });
    expect(partnerRepsInput('')).toEqual({ kind: 'empty' });
    for (const text of ['6.5', '-1', 'abc', '1e3', String(PARTNER_SET_MAX + 1)])
      expect(partnerRepsInput(text)).toEqual({ kind: 'invalid' });
  });

  it('reads weights in the viewer’s unit as kilograms, keeping the stored precise value', () => {
    expect(partnerWeightInput('82,5', 'kg', null)).toEqual({ kind: 'value', value: 82.5 });
    const lb = partnerWeightInput('200', 'lb', null);
    expect(lb.kind === 'value' && lb.value).toBeCloseTo(90.718, 2);
    // 80 kg shows as 176.37 lb; leaving it as shown keeps exactly 80 kg.
    expect(partnerWeightInput('176.37', 'lb', 80)).toEqual({ kind: 'value', value: 80 });
    expect(partnerWeightInput('', 'kg', 80)).toEqual({ kind: 'empty' });
    for (const text of ['-5', 'heavy', '10001'])
      expect(partnerWeightInput(text, 'kg', null)).toEqual({ kind: 'invalid' });
  });
});
