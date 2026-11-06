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
    // The bar's end is the goal: 6 of 10 sets before, plus one more.
    expect(cells[0].querySelector<HTMLElement>('.weekly-shelf-bar-before')?.style.width).toBe(
      '60%',
    );
    expect(cells[0].querySelector<HTMLElement>('.weekly-shelf-bar-gain')?.style.width).toBe('10%');
    expect(cells[1].querySelector<HTMLElement>('.weekly-shelf-bar-gain')?.style.left).toBe('95%');
    expect(cells[1].querySelector<HTMLElement>('.weekly-shelf-bar-gain')?.style.width).toBe('5%');
    expect(host.querySelector('.weekly-shelf-bar-goal')).toBeNull();
    expect(shelf()?.classList.contains('is-pill')).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Lower back 7 of 10 weekly sets, up 1. Glutes 10 of 10 weekly sets, up 0.5. Hamstrings 10 of 10 weekly sets, up 0.5',
    );
  });

  it('keeps the bar full past the goal', async () => {
    await act(async () =>
      root.render(
        <WeeklySetsShelf
          update={{ id: 1, gains: [{ muscle: 'Glutes', before: 12, gain: 1, after: 13 }] }}
          goal={10}
          placement="pill"
          onDismiss={vi.fn()}
        />,
      ),
    );
    expect(host.querySelector<HTMLElement>('.weekly-shelf-bar-before')?.style.width).toBe('100%');
    expect(host.querySelector<HTMLElement>('.weekly-shelf-bar-gain')?.style.width).toBe('0%');
  });

  it('replaces the shown set when another is logged while it is up', async () => {
    const render = (next: WeeklySetsUpdate) =>
      act(async () =>
        root.render(
          <WeeklySetsShelf update={next} goal={10} placement="pill" onDismiss={vi.fn()} />,
        ),
      );
    await render(update);
    await render({
      id: 2,
      gains: [{ muscle: 'Quadriceps', before: 9, gain: 1, after: 10 }],
    });
    expect(host.querySelectorAll('.weekly-shelf-cells')).toHaveLength(1);
    expect([...host.querySelectorAll('.weekly-shelf-name')].map((n) => n.textContent)).toEqual([
      'Quadriceps',
    ]);
    expect(host.querySelectorAll('.weekly-shelf-countdown')).toHaveLength(1);
  });

  it('keeps a carried-over muscle and its gain badge in place, rolling only its total again', async () => {
    const render = (next: WeeklySetsUpdate) =>
      act(async () =>
        root.render(
          <WeeklySetsShelf update={next} goal={10} placement="pill" onDismiss={vi.fn()} />,
        ),
      );
    await render(update);
    const cell = () =>
      [...host.querySelectorAll('.weekly-shelf-cell')].find(
        (item) => item.querySelector('.weekly-shelf-name')?.textContent === 'Lower back',
      )!;
    const badge = cell().querySelector('.weekly-shelf-gain');
    const roll = cell().querySelector('.weekly-shelf-roll > span');
    const gainBar = cell().querySelector('.weekly-shelf-bar-gain');
    expect(shelf()?.classList.contains('is-follow-up')).toBe(false);

    await render({
      id: 2,
      gains: [
        { muscle: 'Lower back', before: 7, gain: 1, after: 8 },
        { muscle: 'Quadriceps', before: 2, gain: 0.5, after: 2.5 },
      ],
    });
    expect(shelf()?.classList.contains('is-follow-up')).toBe(true);
    expect(cell().querySelector('.weekly-shelf-gain')).toBe(badge);
    expect(badge?.textContent).toBe('+1');
    // The total and the bar's new chunk are fresh, so they roll and grow from 7 to 8.
    expect(cell().querySelector('.weekly-shelf-roll > span')).not.toBe(roll);
    expect(cell().querySelector('.weekly-shelf-roll')?.textContent).toBe('78');
    expect(cell().querySelector('.weekly-shelf-bar-gain')).not.toBe(gainBar);
    expect(cell().querySelector<HTMLElement>('.weekly-shelf-bar-before')?.style.width).toBe('70%');
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
