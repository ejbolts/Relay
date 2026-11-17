// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BodyFigure } from './BodyFigure';
import { spreadLabels } from './bodyFigureLayout';
import { BODY_FIGURES, bodyFigurePath } from './bodyFigureShapes';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('BodyFigure', () => {
  it('labels only the measurements it is given, on the side of the body they belong to', async () => {
    await act(async () =>
      root.render(
        <BodyFigure
          kind="male"
          unit="cm"
          values={{ waist_cm: '84', left_arm_cm: '37.5', right_arm_cm: '38' }}
        />,
      ),
    );
    const fields = [...host.querySelectorAll('[data-field]')];
    expect(fields.map((item) => item.getAttribute('data-field')).sort()).toEqual([
      'left_arm_cm',
      'right_arm_cm',
      'waist_cm',
    ]);
    expect(host.querySelector('[data-field="waist_cm"]')?.textContent).toBe('Waist84 cm');
    // The figure faces the viewer, so its right arm is drawn on the left of the picture.
    const bandStart = (field: string) =>
      Number(host.querySelector(`[data-field="${field}"] line`)!.getAttribute('x1'));
    expect(bandStart('right_arm_cm')).toBeLessThan(0);
    expect(bandStart('left_arm_cm')).toBeGreaterThan(0);
    expect(host.querySelectorAll('.body-figure-leader')).toHaveLength(3);
  });

  it('draws a different outline for each figure', async () => {
    await act(async () => root.render(<BodyFigure kind="male" unit="cm" values={{}} />));
    const male = host.querySelector('.body-figure-outline')!.getAttribute('d');
    await act(async () => root.render(<BodyFigure kind="female" unit="cm" values={{}} />));
    const female = host.querySelector('.body-figure-outline')!.getAttribute('d');
    expect(host.querySelector('svg')?.getAttribute('data-figure')).toBe('female');
    expect(female).not.toBe(male);
  });
});

describe('body figure shapes', () => {
  it.each(['male', 'female'] as const)('keeps every %s measurement inside the outline', (kind) => {
    const { half, bands } = BODY_FIGURES[kind];
    const widest = Math.max(...half.filter((_, index) => index % 2 === 0));
    for (const [x1, x2, y] of Object.values(bands)) {
      expect(x1).toBeLessThan(x2);
      expect(Math.abs(x1)).toBeLessThanOrEqual(widest);
      expect(x2).toBeLessThanOrEqual(widest);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(810);
    }
    // The outline starts and ends on the centre line, so the two halves join cleanly.
    expect(half[0]).toBe(0);
    expect(half[half.length - 2]).toBe(0);
  });

  it('builds a closed, left-right symmetric path', () => {
    const path = bodyFigurePath([0, 0, 10, 5, 10, 20, 0, 30]);
    expect(path.startsWith('M0,0C')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    // Four points on one side become six around the loop: the two on the centre line are shared.
    expect(path.match(/C/g)).toHaveLength(6);
    expect(path).toContain(' -10,20');
    expect(path).toContain(' -10,5');
  });
});

describe('spreadLabels', () => {
  it('leaves labels beside their measurement when they do not collide', () => {
    expect(spreadLabels([100, 300, 600])).toEqual([100, 300, 600]);
  });

  it('moves crowded labels apart as a group around where they wanted to be', () => {
    const wanted = [255, 315, 404, 445];
    const placed = spreadLabels(wanted);
    for (let i = 1; i < placed.length; i += 1) {
      expect(placed[i] - placed[i - 1]).toBeGreaterThanOrEqual(76);
    }
    // Shared out, not all pushed downwards: the first moves up and the last moves down.
    expect(placed[0]).toBeLessThan(255);
    expect(placed[3]).toBeGreaterThan(445);
    const average = (list: readonly number[]) => list.reduce((sum, y) => sum + y, 0) / list.length;
    expect(average(placed)).toBeCloseTo(average(wanted), 5);
  });

  it('keeps labels inside the picture at both ends', () => {
    const low = spreadLabels([700, 760, 790]);
    expect(low[2]).toBeLessThanOrEqual(790);
    expect(low[1] - low[0]).toBeGreaterThanOrEqual(76);
    const high = spreadLabels([0, 10, 400]);
    expect(high[0]).toBeGreaterThanOrEqual(26);
    expect(high[1] - high[0]).toBeGreaterThanOrEqual(76);
    expect(high[2]).toBe(400);
  });
});
