// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BodyFigure } from './BodyFigure';
import { LABEL_GAP, spreadLabels } from './bodyFigureLayout';
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
  it('labels every measurement on its side of the body, leaving unmeasured ones empty', async () => {
    await act(async () =>
      root.render(
        <BodyFigure
          kind="male"
          unit="cm"
          values={{ waist_cm: '84', left_arm_cm: '37.5', right_arm_cm: '38' }}
          onPick={() => undefined}
        />,
      ),
    );
    expect(host.querySelectorAll('[data-field]')).toHaveLength(12);
    expect(host.querySelector('[data-field="waist_cm"]')?.textContent).toBe('Waist84 cm');
    // A part not measured yet still has its band, leader and name, with no value.
    const neck = host.querySelector('[data-field="neck_cm"]')!;
    expect(neck.textContent).toBe('Neck');
    expect(neck.classList.contains('empty')).toBe(true);
    expect(neck.getAttribute('aria-label')).toBe('Add neck');
    expect(neck.querySelector('.body-figure-band')).not.toBeNull();
    // The figure faces the viewer, so its right arm is drawn on the left of the picture.
    const bandStart = (field: string) =>
      Number(host.querySelector(`[data-field="${field}"] line`)!.getAttribute('x1'));
    expect(bandStart('right_arm_cm')).toBeLessThan(0);
    expect(bandStart('left_arm_cm')).toBeGreaterThan(0);
    expect(host.querySelectorAll('.body-figure-leader')).toHaveLength(12);
  });

  it('types a measurement in a box over its label, saving on Enter or leaving and not on Escape', async () => {
    const commits: [string, string][] = [];
    let cancelled = 0;
    let accept = true;
    const figure = (editing: 'neck_cm' | 'chest_cm' | null, editValue = '') => (
      <BodyFigure
        kind="male"
        unit="cm"
        values={{ chest_cm: '102' }}
        onPick={() => undefined}
        editing={editing}
        editValue={editValue}
        onCommit={(field, text) => {
          commits.push([field, text]);
          return accept;
        }}
        onCancel={() => (cancelled += 1)}
      />
    );
    const type = (box: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, value);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => root.render(figure('neck_cm')));
    let box = host.querySelector<HTMLInputElement>('.body-figure-editor input')!;
    expect(box.getAttribute('aria-label')).toBe('Neck (cm)');
    expect(document.activeElement).toBe(box);
    expect(box.closest('.body-figure-editor')?.classList.contains('left')).toBe(true);
    await act(async () => type(box, '38'));
    await act(async () =>
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(commits).toEqual([['neck_cm', '38']]);
    // Focus goes back to the label, without a second save from the blur.
    expect(document.activeElement).toBe(host.querySelector('[data-field="neck_cm"]'));
    expect(commits).toHaveLength(1);

    // A value already there starts in the box, and its drawn value makes way for it.
    await act(async () => root.render(figure('chest_cm', '102')));
    box = host.querySelector<HTMLInputElement>('.body-figure-editor input')!;
    expect(box.value).toBe('102');
    expect(box.closest('.body-figure-editor')?.classList.contains('right')).toBe(true);
    expect(host.querySelector('[data-field="chest_cm"] .body-figure-value')).toBeNull();
    await act(async () =>
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(cancelled).toBe(1);
    expect(commits).toHaveLength(1);

    // A rejected value keeps the box open; leaving it tries to save what was typed.
    await act(async () => root.render(figure(null)));
    await act(async () => root.render(figure('neck_cm')));
    box = host.querySelector<HTMLInputElement>('.body-figure-editor input')!;
    accept = false;
    await act(async () => type(box, '0'));
    await act(async () =>
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(document.activeElement).toBe(box);
    accept = true;
    await act(async () => box.blur());
    expect(commits.slice(1)).toEqual([
      ['neck_cm', '0'],
      ['neck_cm', '0'],
    ]);
  });

  it('draws a different outline for each figure', async () => {
    const figure = (kind: 'male' | 'female') => (
      <BodyFigure kind={kind} unit="cm" values={{}} onPick={() => undefined} />
    );
    await act(async () => root.render(figure('male')));
    const male = host.querySelector('.body-figure-outline')!.getAttribute('d');
    expect(host.querySelector('.body-figure-hairline')).toBeNull();
    expect(host.querySelectorAll('.body-figure-edge')).toHaveLength(1);
    await act(async () => root.render(figure('female')));
    const female = host.querySelector('.body-figure-outline')!.getAttribute('d');
    expect(host.querySelector('svg')?.getAttribute('data-figure')).toBe('female');
    expect(female).not.toBe(male);
    expect(host.querySelector('.body-figure-hairline')).not.toBeNull();
    // The female outline has a bun joined on: each edge is masked inside the other shape.
    const edges = [...host.querySelectorAll('.body-figure-edge')];
    expect(edges).toHaveLength(2);
    expect(host.querySelectorAll('.body-figure-extra')).toHaveLength(1);
    for (const edge of edges) {
      const id = edge.getAttribute('mask')!.slice(5, -1);
      expect(host.querySelector(`mask[id="${id}"]`)).not.toBeNull();
    }
    const svg = host.querySelector('svg')!;
    const top = Number(svg.getAttribute('viewBox')!.split(' ')[1]);
    expect(top).toBeLessThan(-17);
  });
});

describe('BodyFigure labels', () => {
  it('makes each label a button that picks its measurement by tap or keyboard', async () => {
    const picked: string[] = [];
    await act(async () =>
      root.render(
        <BodyFigure
          kind="female"
          unit="in"
          values={{ waist_cm: '30', hips_cm: '38.5' }}
          onPick={(field) => picked.push(field)}
        />,
      ),
    );
    const waist = host.querySelector<SVGGElement>('[data-field="waist_cm"]')!;
    expect(waist.getAttribute('role')).toBe('button');
    expect(waist.getAttribute('aria-label')).toBe('Update waist, 30 in');
    await act(async () => waist.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const hips = host.querySelector<SVGGElement>('[data-field="hips_cm"]')!;
    await act(async () =>
      hips.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    await act(async () =>
      hips.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })),
    );
    expect(picked).toEqual(['waist_cm', 'hips_cm']);
  });

  it.each(['male', 'female'] as const)('gives every %s label its own tap area', async (kind) => {
    const all = Object.fromEntries(
      [
        'neck_cm',
        'shoulders_cm',
        'chest_cm',
        'waist_cm',
        'hips_cm',
        'left_arm_cm',
        'right_arm_cm',
        'left_thigh_cm',
        'right_thigh_cm',
        'left_calf_cm',
        'right_calf_cm',
        'wrist_cm',
      ].map((field) => [field, '50']),
    );
    await act(async () =>
      root.render(<BodyFigure kind={kind} unit="cm" values={all} onPick={() => undefined} />),
    );
    const areas = [...host.querySelectorAll('.body-figure-hit')].map((rect) => ({
      left: Number(rect.getAttribute('x')) < 0,
      top: Number(rect.getAttribute('y')),
      height: Number(rect.getAttribute('height')),
    }));
    expect(areas).toHaveLength(12);
    for (const left of [true, false]) {
      const column = areas.filter((area) => area.left === left).sort((a, b) => a.top - b.top);
      for (let i = 1; i < column.length; i += 1) {
        expect(column[i].top).toBeGreaterThanOrEqual(column[i - 1].top + column[i - 1].height);
      }
      // Nothing runs off the top or bottom of the picture.
      expect(column[0].top).toBeGreaterThanOrEqual(-26);
      const last = column[column.length - 1];
      expect(last.top + last.height).toBeLessThanOrEqual(826);
    }
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
      expect(placed[i] - placed[i - 1]).toBeGreaterThanOrEqual(LABEL_GAP);
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
    expect(low[1] - low[0]).toBeGreaterThanOrEqual(LABEL_GAP);
    const high = spreadLabels([0, 10, 400]);
    expect(high[0]).toBeGreaterThanOrEqual(26);
    expect(high[1] - high[0]).toBeGreaterThanOrEqual(LABEL_GAP);
    expect(high[2]).toBe(400);
  });
});
