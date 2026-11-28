// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHART_YEAR_LINES_KEY } from './chartYears';
import { LandscapeChartFrame } from './LandscapeChartFrame';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const render = (yearLines: boolean) =>
  act(async () =>
    root.render(
      <LandscapeChartFrame title="Bodyweight trend" controls={null} yearLines={yearLines}>
        {(expanded, _close, showYearLines) => (
          <p data-testid="chart">
            {expanded ? 'expanded' : 'compact'} {showYearLines ? 'years' : 'no years'}
          </p>
        )}
      </LandscapeChartFrame>,
    ),
  );
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const yearLinesButton = () =>
  document.querySelector<HTMLButtonElement>('.landscape-chart-year-lines');
const chart = () => document.querySelector('[data-testid="chart"]')?.textContent;
const click = (element: HTMLElement | null) => act(async () => element!.click());

it('offers Year lines in full screen only, and remembers the choice on the device', async () => {
  await render(true);
  expect(yearLinesButton()).toBeNull();
  expect(chart()).toBe('compact no years');

  await click(button('View Bodyweight trend full screen in landscape'));
  expect(yearLinesButton()?.textContent).toBe('Year lines');
  expect(yearLinesButton()?.getAttribute('aria-pressed')).toBe('false');
  expect(chart()).toBe('expanded no years');

  await click(yearLinesButton());
  expect(yearLinesButton()?.getAttribute('aria-pressed')).toBe('true');
  expect(chart()).toBe('expanded years');
  expect(window.localStorage.getItem(CHART_YEAR_LINES_KEY)).toBe('on');

  // The compact chart never draws them; the next full screen opens with them on.
  await click(button('Exit full-screen Bodyweight trend'));
  expect(chart()).toBe('compact no years');
  await click(button('View Bodyweight trend full screen in landscape'));
  expect(chart()).toBe('expanded years');

  await click(yearLinesButton());
  expect(chart()).toBe('expanded no years');
  expect(window.localStorage.getItem(CHART_YEAR_LINES_KEY)).toBe('off');
});

it('picks up a choice made on another chart since this one was first shown', async () => {
  await render(true);
  window.localStorage.setItem(CHART_YEAR_LINES_KEY, 'on');
  await click(button('View Bodyweight trend full screen in landscape'));
  expect(yearLinesButton()?.getAttribute('aria-pressed')).toBe('true');
  expect(chart()).toBe('expanded years');
});

it('leaves the button out when the chart stays inside one year', async () => {
  window.localStorage.setItem(CHART_YEAR_LINES_KEY, 'on');
  await render(false);
  await click(button('View Bodyweight trend full screen in landscape'));
  expect(yearLinesButton()).toBeNull();
  expect(chart()).toBe('expanded no years');
});
