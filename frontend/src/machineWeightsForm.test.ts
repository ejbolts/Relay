import { describe, expect, it } from 'vitest';
import {
  PAIR_ERROR,
  liveMapping,
  machineWeightsLayout,
  pairWithMachineWeight,
  parsedMapping,
  toggledNormalise,
  typedFactor,
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
    expect(pairWithMachineWeight(pair, '60')).toEqual({ machine: '60', reference: '75' });
    expect(pairWithMachineWeight({ machine: '', reference: '' }, '60')).toEqual({
      machine: '60',
      reference: '',
    });
  });

  it('switches on with the recommended reference, which then leads the list', () => {
    const off = { ...mapping, enabled: false, reference_machine_id: null };
    const on = toggledNormalise(off, 'c');
    expect(on).toMatchObject({ enabled: true, reference_machine_id: 'c' });
    expect(machineWeightsLayout(on).ordered.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(machineWeightsLayout(off)).toMatchObject({ tree: false, reference: undefined });
  });
});
