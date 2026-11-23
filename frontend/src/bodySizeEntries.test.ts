import { describe, expect, it } from 'vitest';
import { bodyFigureCallouts, bodyFigureLabelName } from './bodyFigureLayout';
import {
  bodyFigureValues,
  bodySizeChangeText,
  bodySizeChanges,
  bodySizeDraft,
  bodySizeHistory,
  bodySizeLastValue,
  bodySizeSummary,
  bodySizeUnit,
  bodySizesPayload,
  emptyBodySizeLog,
  figureEntry,
  withBodySizeLog,
} from './bodySizeEntries';
import type { BodySizeLog } from './bodySizes';

const log = (date: string, values: Partial<BodySizeLog>): BodySizeLog => ({
  ...emptyBodySizeLog(date),
  ...values,
});
const cm = bodySizeUnit('kg');
const inches = bodySizeUnit('lb');
const logs = [
  log('2026-11-20', { waist_cm: 80 }),
  log('2026-11-10', { waist_cm: 81.5, neck_cm: 38 }),
];

describe('body measurement entries', () => {
  it('shows inches for pound accounts and fills a day’s boxes', () => {
    expect(inches).toEqual({ unit: 'in', factor: 2.54 });
    expect(bodySizeDraft(logs, '2026-11-10', cm)).toMatchObject({
      waist_cm: '81.5',
      neck_cm: '38',
    });
    expect(bodySizeDraft(logs, '2026-11-10', inches).neck_cm).toBe('14.96');
  });

  it('carries an earlier value onto the figure and lists changes', () => {
    const { values, carried } = bodyFigureValues(logs, 0);
    expect(values).toEqual({ waist_cm: 80, neck_cm: 38 });
    expect([...carried]).toEqual(['neck_cm']);
    expect(bodySizeChanges(logs[0], logs[1], cm)).toEqual([
      { key: 'waist_cm', label: 'Waist', change: -1.5 },
    ]);
  });

  it('builds the form’s entry and refuses empty or out-of-range values', () => {
    expect(bodySizesPayload(undefined, '2026-11-21', {}, cm).error).toBe(
      'Enter at least one body measurement.',
    );
    expect(bodySizesPayload(undefined, '2026-11-21', { chest_cm: '400' }, cm).error).toBe(
      'Chest must be above 0 and up to 300 cm.',
    );
    const stored = log('2026-11-10', { neck_cm: 38.123 });
    expect(bodySizesPayload(stored, '2026-11-10', { neck_cm: '38.12' }, cm).payload?.neck_cm).toBe(
      38.123,
    );
  });

  it('saves a figure entry into today, leaving an unchanged value alone', () => {
    expect(
      figureEntry({
        logs,
        day: '2026-11-20',
        field: 'waist_cm',
        typed: '80',
        shownCm: 80,
        size: cm,
      }),
    ).toEqual({ kind: 'unchanged' });
    const saved = figureEntry({
      logs,
      day: '2026-11-21',
      field: 'hips_cm',
      typed: '95,5',
      shownCm: undefined,
      size: cm,
    });
    expect(saved).toEqual({ kind: 'save', entry: log('2026-11-21', { hips_cm: 95.5 }) });
    if (saved.kind === 'save') {
      expect(withBodySizeLog(logs, saved.entry).map((row) => row.measurement_date)).toEqual([
        '2026-11-21',
        '2026-11-20',
        '2026-11-10',
      ]);
    }
  });

  it('words history rows', () => {
    const waist = bodySizeHistory(logs, 'waist_cm');
    expect(bodySizeChangeText(waist, 0, 'waist_cm', cm)).toBe('−1.5 cm');
    expect(bodySizeChangeText(waist, 1, 'waist_cm', cm)).toBe('First measurement');
    expect(bodySizeHistory(logs, 'neck_cm')).toHaveLength(1);
    expect(bodySizeSummary(logs[1], cm)).toBe('Neck 38 cm · Waist 81.5 cm');
    expect(bodySizeLastValue(logs, '2026-11-21', 'neck_cm', cm)).toBe('38');
  });
});

describe('body figure callouts', () => {
  it('places every label, spread down each side', () => {
    const callouts = bodyFigureCallouts('male', () => true);
    expect(callouts).toHaveLength(12);
    const left = callouts.filter((item) => item.column === -1);
    expect(left.map((item) => item.field)[0]).toBe('neck_cm');
    left.slice(1).forEach((item, index) => {
      expect(item.labelY - left[index].labelY).toBeGreaterThanOrEqual(100);
    });
    // The figure's right arm is drawn on the left of the picture.
    const rightArm = callouts.find((item) => item.field === 'right_arm_cm')!;
    expect(rightArm.to).toBeLessThan(0);
    expect(bodyFigureCallouts('female', (field) => field === 'waist_cm')).toHaveLength(1);
  });

  it('names what tapping a label does', () => {
    expect(bodyFigureLabelName('Waist', '80', false, 'cm')).toBe('Update waist, 80 cm');
    expect(bodyFigureLabelName('Waist', '80', true, 'cm')).toBe('Add waist, last 80 cm');
    expect(bodyFigureLabelName('Neck', undefined, false, 'cm')).toBe('Add neck');
  });
});
