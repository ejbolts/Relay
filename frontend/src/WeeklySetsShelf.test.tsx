// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEEKLY_SETS_SHELF_MS, WeeklySetsShelf, type WeeklySetsUpdate } from './WeeklySetsShelf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const update: WeeklySetsUpdate = {
  id: 1,
  gains: [
    { muscle: 'Lower back', before: 6, gain: 1, after: 7 },
    { muscle: 'Glutes', before: 9.5, gain: 0.5, after: 10 },
    { muscle: 'Hamstrings', before: 9.5, gain: 0.5, after: 10 },
  ],
};

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const shelf = () => host.querySelector<HTMLButtonElement>('.weekly-sets-shelf');

describe('weekly sets shelf', () => {
  it('shows each muscle total, its gain and the goal tick, marking a newly met goal', async () => {
    await act(async () =>
      root.render(
        <WeeklySetsShelf update={update} goal={10} placement="pill" onDismiss={vi.fn()} />,
      ),
    );
    const cells = [...host.querySelectorAll('.weekly-shelf-cell')];
    expect(cells.map((cell) => cell.querySelector('.weekly-shelf-name')?.textContent)).toEqual([
      'Lower back',
      'Glutes',
      'Hamstrings',
    ]);
    expect(cells.map((cell) => cell.querySelector('.weekly-shelf-gain')?.textContent)).toEqual([
      '+1',
      '+0.5',
      '+0.5',
    ]);
    expect(cells[0].querySelector('.weekly-shelf-roll')?.textContent).toBe('67');
    expect(cells[0].querySelector('small')?.textContent).toBe('/10');
    expect(cells[0].classList.contains('is-met')).toBe(false);
    expect(cells[1].classList.contains('just-met')).toBe(true);
    expect(cells[1].querySelector('.weekly-shelf-met')).not.toBeNull();
    // The goal tick sits at 10 of a 12.5-set scale.
    expect(cells[0].querySelector<HTMLElement>('.weekly-shelf-bar-goal')?.style.left).toBe('80%');
    expect(cells[0].querySelector<HTMLElement>('.weekly-shelf-bar-gain')?.style.width).toBe('8%');
    expect(shelf()?.classList.contains('is-pill')).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Lower back 7 of 10 weekly sets, up 1. Glutes 10 of 10 weekly sets, up 0.5. Hamstrings 10 of 10 weekly sets, up 0.5',
    );
  });

  it('folds away by itself, unless touched to keep it open until touched again', async () => {
    const onDismiss = vi.fn();
    await act(async () =>
      root.render(
        <WeeklySetsShelf update={update} goal={10} placement="alone" onDismiss={onDismiss} />,
      ),
    );
    await act(async () => shelf()!.click());
    expect(shelf()?.getAttribute('aria-label')).toBe('Close weekly sets');
    expect(host.querySelector('.weekly-shelf-countdown')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(WEEKLY_SETS_SHELF_MS * 2));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => shelf()!.click());
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(onDismiss).toHaveBeenCalledOnce();

    // A newly logged set restarts the countdown, which then closes the shelf on its own.
    onDismiss.mockClear();
    await act(async () =>
      root.render(
        <WeeklySetsShelf
          update={{ ...update, id: 2 }}
          goal={10}
          placement="alone"
          onDismiss={onDismiss}
        />,
      ),
    );
    expect(shelf()?.classList.contains('is-leaving')).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(WEEKLY_SETS_SHELF_MS - 100));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(shelf()?.classList.contains('is-leaving')).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
