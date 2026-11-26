import { describe, expect, it } from 'vitest';
import {
  PAIR_ERROR,
  liveMapping,
  machineWeightsLayout,
  pairForFactor,
  pairSettled,
  pairWithMachineWeight,
  pairWithReferenceWeight,
  parsedMapping,
  toggledNormalise,
  typedFactor,
  type PairText,
} from './machineWeightsForm';
import type { MachineWeight, WeightMapping } from './types';

const machine = (id: string, extra: Partial<MachineWeight> = {}): MachineWeight => ({
  id,
  caption: id,
  thumbnail_url: '',
  workout_count: 1,
  last_used_date: null,
  machine_kg: null,
  reference_kg: null,
  ...extra,
});
const mapping: WeightMapping = {
  enabled: true,
  reference_machine_id: 'b',
  machines: [machine('a'), machine('b'), machine('c')],
};

describe('machine weights form', () => {
  it('saves typed pairs, and asks for both weights or neither', () => {
    const texts = { a: { machine: '40', reference: '50' }, c: { machine: '30', reference: '' } };
    expect(parsedMapping(mapping, texts, 'kg')).toEqual({
      mapping: null,
      errors: { c: PAIR_ERROR },
    });
    const done = parsedMapping(mapping, { ...texts, c: { machine: '', reference: '' } }, 'kg');
    expect(done.errors).toEqual({});
    expect(done.mapping?.machines).toEqual([
      machine('a', { machine_kg: 40, reference_kg: 50 }),
      machine('b'),
      machine('c'),
    ]);
  });

  it('previews only finished pairs', () => {
    const live = liveMapping(mapping, { a: { machine: '40', reference: '' } }, 'kg');
    expect(live.machines[0]).toMatchObject({ machine_kg: null, reference_kg: null });
  });

  it('keeps the conversion when your weight on the machine changes', () => {
    const pair = { machine: '40', reference: '50' };
    expect(typedFactor(pair)).toBe(1.25);
    expect(pairWithMachineWeight(pair, '60')).toMatchObject({ machine: '60', reference: '75' });
    expect(pairWithMachineWeight({ machine: '', reference: '' }, '60')).toMatchObject({
      machine: '60',
      reference: '',
    });
  });

  /** The weight box's value after each keystroke, as the form applies them. */
  const typed = (pair: PairText, ...values: string[]) => values.reduce(pairWithMachineWeight, pair);

  it('keeps the conversion through an emptied weight box', () => {
    const pair = { machine: '150', reference: '120' };
    // Select all, delete, then type 150 again: each digit used to set a conversion of its own.
    expect(typed(pair, '', '1', '15', '150')).toMatchObject({ machine: '150', reference: '120' });
    // Backspace to nothing, then a different weight.
    expect(typed(pair, '15', '1', '', '2', '20', '200')).toMatchObject({
      machine: '200',
      reference: '160',
    });
    // An emptied box is unfinished, so it still cannot be saved or previewed as a conversion.
    expect(typedFactor(typed(pair, ''))).toBeNull();
  });

  it('keeps the exact conversion while a weight is half typed', () => {
    // x0.83: one digit's match rounds to 0.8, which used to become the conversion.
    const pair = { machine: '150', reference: '124.5' };
    expect(typed(pair, '15', '1', '16', '160')).toMatchObject({
      machine: '160',
      reference: '132.8',
    });
  });

  it('leaves the other weight alone when the pair showed no conversion', () => {
    // The matching weight was typed first; this weight is being typed for the first time.
    expect(typed({ machine: '', reference: '100' }, '1', '15', '150')).toMatchObject({
      machine: '150',
      reference: '100',
    });
    // Once that edit is over, the finished pair's conversion is the one kept.
    const settled = pairSettled(typed({ machine: '', reference: '100' }, '1', '15', '150'));
    expect(settled).toEqual({ machine: '150', reference: '100' });
    expect(typed(settled, '15', '3', '30', '300')).toMatchObject({
      machine: '300',
      reference: '200',
    });
  });

  it('keeps holding the conversion when the emptied weight box is left', () => {
    const emptied = typed({ machine: '150', reference: '120' }, '');
    expect(pairSettled(emptied)).toBe(emptied);
    expect(typed(pairSettled(emptied), '2', '20', '200')).toMatchObject({
      machine: '200',
      reference: '160',
    });
    // A pair that was never edited is returned as it is.
    const untouched = { machine: '150', reference: '120' };
    expect(pairSettled(untouched)).toBe(untouched);
  });

  it('takes a new conversion from the matching weight, the slider or a suggestion', () => {
    const edited = typed({ machine: '150', reference: '120' }, '');
    // Typing the matching weight: the pair is now 100 for whatever is typed next.
    const matched = pairWithReferenceWeight(edited, '100');
    expect(matched).toEqual({ machine: '', reference: '100' });
    expect(typed(matched, '2', '20', '200')).toMatchObject({ machine: '200', reference: '100' });
    // A complete pair with a new matching weight: that conversion is kept from then on.
    const rematched = pairWithReferenceWeight(
      typed({ machine: '150', reference: '120' }, '100'),
      '90',
    );
    expect(typed(rematched, '10', '1', '', '2', '20', '200')).toMatchObject({
      machine: '200',
      reference: '180',
    });
    // The slider and "Use" replace the pair, and with it the conversion being held.
    const slid = pairForFactor(typed({ machine: '150', reference: '120' }, '100'), 0.5, 50);
    expect(slid).toEqual({ machine: '100', reference: '50' });
    expect(typed(slid, '', '8', '80')).toMatchObject({ machine: '80', reference: '40' });
  });

  it('switches on with the recommended reference, which then leads the list', () => {
    const off = { ...mapping, enabled: false, reference_machine_id: null };
    const on = toggledNormalise(off, 'c');
    expect(on).toMatchObject({ enabled: true, reference_machine_id: 'c' });
    expect(machineWeightsLayout(on).ordered.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(machineWeightsLayout(off)).toMatchObject({ tree: false, reference: undefined });
  });
});
