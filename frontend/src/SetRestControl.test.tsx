// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetRestControl } from './SetRestControl';
import { createWorkoutSet } from './workoutSets';
import type { ExerciseHistoryEntry } from './exerciseHistory';

const set = {
  ...createWorkoutSet('strength'),
  warmup: true,
  set_type: 'warmup' as const,
  failed: false,
  target_reps: null,
  incline_percent: null,
  speed_kph: null,
};
const history: ExerciseHistoryEntry[] = [
  {
    workoutId: 'sample',
    workoutDate: '2026-11-01',
    workoutName: 'Sample session',
    movementNotes: null,
    sets: [
      {
        ...set,
        id: 'old',
        order_index: 0,
        bodyweight_kg: null,
        percentile: null,
        rest_seconds: 150,
        completed: true,
      },
    ],
  },
];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('compact rest controls', () => {
  it('shows a dim previous time beside REST and confirms an explicitly chosen time', async () => {
    const change = vi.fn();
    const render = (seconds: number, suggested: boolean) =>
      act(async () =>
        root.render(
          <SetRestControl
            seconds={seconds}
            setIndex={0}
            sets={[set]}
            history={history}
            suggested={suggested}
            onChange={change}
          />,
        ),
      );
    await render(150, true);
    expect(container.querySelector('.rest-is-suggested')).not.toBeNull();
    expect(container.querySelector('.rest-between-controls')?.textContent).toContain('rest');
    expect(container.querySelector('button')).toBeNull();
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = '180';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith(180);
    await render(180, false);
    expect(container.querySelector('.rest-is-suggested')).toBeNull();
    expect(container.querySelector('select')?.value).toBe('180');
    expect(container.querySelector('.rest-between-controls')?.textContent).toContain('rest');
    expect(container.querySelector('button')).toBeNull();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('never marks an unmatched current value as previous', async () => {
    await act(async () =>
      root.render(
        <SetRestControl
          seconds={180}
          setIndex={0}
          sets={[set]}
          history={[]}
          suggested
          onChange={vi.fn()}
        />,
      ),
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.rest-is-suggested')).toBeNull();
  });
});
