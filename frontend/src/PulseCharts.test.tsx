// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goalLabelY } from './chartLayout';
import { TrendChart, type TrendPoint } from './PulseCharts';

describe('TrendChart goal path', () => {
  it('shows both maintenance boundaries and a shaded band within the dated goal', () => {
    const markup = renderToStaticMarkup(
      <TrendChart
        points={[{ date: '2026-11-08', value: 84 }]}
        label="Bodyweight"
        seriesLabel="Weight"
        unit="kg"
        goalPath={{
          startDate: '2026-11-08',
          endDate: '2026-12-31',
          startValue: 84,
          endValue: 84,
          minValue: 82,
          maxValue: 86,
          label: 'Goal 82–86 kg',
        }}
      />,
    );
    expect(markup).toContain('pulse-chart-goal-band');
    expect(markup).toContain('Goal 82–86 kg');
    const band = markup.match(/<rect class="pulse-chart-goal-band"[^>]*height="([\d.]+)"/);
    expect(Number(band?.[1])).toBeGreaterThan(0);
    expect(markup.match(/<line x1="40"/g)).toHaveLength(2);
  });
  it('extends the x-axis to a future goal date and draws the dotted goal line to it', () => {
    const markup = renderToStaticMarkup(
      <TrendChart
        points={[
          { date: '2026-08-01', value: 86.5 },
          { date: '2026-09-15', value: 83.5 },
          { date: '2026-11-01', value: 84 },
        ]}
        label="Bodyweight"
        seriesLabel="7-day average"
        unit="kg"
        goalPath={{
          startDate: '2026-10-20',
          startValue: 83.7,
          endDate: '2026-12-31',
          endValue: 85,
          label: 'Goal 85 kg',
        }}
      />,
    );

    // The axis now runs past the last check-in to the December target.
    expect(markup).toContain('>Dec</text>');
    // Fallback width 340 minus the 12px right padding: the line ends at the plot's right edge.
    expect(markup).toMatch(
      /<g class="pulse-chart-goal pulse-chart-goal-path"><line x1="[\d.]+" y1="[\d.]+" x2="328"/,
    );
    expect(markup).toContain('Goal 85 kg');
  });
});

describe('TrendChart day popup', () => {
  let root: Root;
  let host: HTMLDivElement;
  const points: TrendPoint[] = [
    { date: '2026-10-15', value: 84.9 },
    { date: '2026-10-16', value: 84.7 },
    { date: '2026-10-17', value: 84.5, detail: 'weighed 84.5 kg' },
  ];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = (onSelect?: (point: TrendPoint) => void) =>
    act(async () =>
      root.render(
        <TrendChart
          points={points}
          unit="kg"
          label="Bodyweight"
          seriesLabel="7-day average"
          onSelect={onSelect}
        />,
      ),
    );
  const chart = () => host.querySelector<SVGSVGElement>('svg')!;
  const tooltip = () => host.querySelector<HTMLElement>('.pulse-chart-tooltip');
  const press = (key: string) =>
    act(async () => {
      chart().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

  it('closes with its X, returns focus to the chart and reopens on the next day read', async () => {
    await render();
    await press('ArrowLeft');
    expect(tooltip()?.textContent).toContain('84.7 kg');
    const close = tooltip()!.querySelector<HTMLButtonElement>('.pulse-chart-tooltip-close')!;
    expect(close.getAttribute('aria-label')).toMatch(/^Close .*16.* details$/);

    await act(async () => close.click());
    expect(tooltip()).toBeNull();
    expect(host.querySelector('.pulse-chart-cursor')).toBeNull();
    expect(document.activeElement).toBe(chart());

    await press('ArrowRight');
    expect(tooltip()?.textContent).toContain('weighed 84.5 kg');
  });

  it('keeps Open workout alongside the close button', async () => {
    const onSelect = vi.fn();
    await render(onSelect);
    await press('ArrowLeft');
    const buttons = [...tooltip()!.querySelectorAll('button')].map((button) => button.className);
    expect(buttons).toEqual(['pulse-chart-tooltip-close', 'pulse-chart-tooltip-open']);
    await act(async () =>
      tooltip()!.querySelector<HTMLButtonElement>('.pulse-chart-tooltip-open')!.click(),
    );
    expect(onSelect).toHaveBeenCalledWith(points[1]);
  });
});

describe('goalLabelY', () => {
  const line = { x1: 40, y1: 40, x2: 330, y2: 120, label: 'Goal 80 kg' };

  it('keeps a falling goal label under the line end when there is room', () => {
    expect(goalLabelY(line, 180)).toBe(134);
  });

  it('moves the label above the line, clear of the dates, when the end meets the axis', () => {
    const y = goalLabelY({ ...line, y2: 174 }, 180);
    expect(y).toBeLessThan(174 - 14);
    // Where the label starts (64px left of its end), the line is lower than the text.
    const lineYAtLabelStart = 174 - (174 - 40) * (64 / 290);
    expect(y).toBeLessThan(lineYAtLabelStart);
  });

  it('places a rising goal label above its end', () => {
    expect(goalLabelY({ ...line, y1: 120, y2: 40 }, 180)).toBe(34);
  });
});
