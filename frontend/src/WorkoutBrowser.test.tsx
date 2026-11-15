// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { WorkoutBrowser, WorkoutNavigationArrows, type WorkoutNavigation } from './WorkoutBrowser';
import type { TrackedWorkout } from './types';

vi.mock('./api', () => ({ api: { listWorkouts: vi.fn() } }));
let root: Root;
let container: HTMLDivElement;
const workout = (id: string, date: string, time = '10:00'): TrackedWorkout => ({
  id,
  name: id,
  workout_date: date,
  created_at: `${date}T${time}:00Z`,
  updated_at: `${date}T${time}:00Z`,
  category: 'upper',
  notes: `${id} notes`,
  duration_minutes: 30,
  start_time: null,
  end_time: null,
  is_sample: true,
  movements: [],
});
function Session({
  navigation,
  viewed,
}: {
  navigation: WorkoutNavigation;
  viewed: TrackedWorkout | null;
}) {
  const [notes, setNotes] = useState('Unsaved original notes');
  return (
    <section aria-label={viewed?.name ?? 'Original session'}>
      <div className="workout-summary-fields">
        <textarea
          aria-label="Session notes"
          value={viewed ? (viewed.notes ?? '') : notes}
          readOnly={Boolean(viewed)}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <WorkoutNavigationArrows navigation={navigation} />
    </section>
  );
}
function active() {
  return container.querySelector<HTMLElement>('[data-workout-session]:not([hidden])')!;
}
async function click(direction: 'previous' | 'next') {
  await act(async () =>
    active().querySelector<HTMLButtonElement>(`.workout-navigation-${direction}`)!.click(),
  );
}
async function mount(
  workouts: TrackedWorkout[],
  options: {
    initial?: TrackedWorkout;
    resumed?: string;
    older?: boolean;
    resumeRequest?: number;
  } = {},
) {
  await act(async () =>
    root.render(
      <WorkoutBrowser
        resumeRequest={options.resumeRequest}
        workouts={workouts}
        initialWorkout={options.initial ?? null}
        resumedWorkoutId={options.resumed ?? null}
        hasOlder={options.older ?? false}
      >
        {(navigation, viewed) => <Session navigation={navigation} viewed={viewed} />}
      </WorkoutBrowser>,
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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

describe('workout browsing', () => {
  it('returns to the same live logger on a resume request after browsing an older workout', async () => {
    const workouts = [workout('Earlier', '2026-10-19')];
    await mount(workouts);
    const original = active().querySelector('textarea')!;
    await click('previous');
    expect(active().textContent).not.toContain('Original session');
    expect(active().querySelector('textarea')).not.toBe(original);
    await mount(workouts, { resumeRequest: 1 });
    expect(active().querySelector('textarea')).toBe(original);
    expect(original.value).toBe('Unsaved original notes');
  });

  it('orders same-day sessions, stops at both ends, and preserves the mounted original', async () => {
    await mount([
      workout('Later', '2026-10-19', '18:00'),
      workout('Older', '2026-10-18'),
      workout('Earlier', '2026-10-19', '09:00'),
    ]);
    const original = active().querySelector('textarea')!;
    expect(active().querySelector<HTMLButtonElement>('.workout-navigation-next')!.disabled).toBe(
      true,
    );
    await click('previous');
    expect(active().textContent).not.toContain('Original session');
    expect(active().querySelector('section')?.getAttribute('aria-label')).toBe('Later');
    expect(active().querySelector('textarea')!.readOnly).toBe(true);
    await click('previous');
    expect(active().querySelector('section')?.getAttribute('aria-label')).toBe('Earlier');
    await click('previous');
    expect(active().querySelector('section')?.getAttribute('aria-label')).toBe('Older');
    expect(
      active().querySelector<HTMLButtonElement>('.workout-navigation-previous')!.disabled,
    ).toBe(true);
    await click('next');
    await click('next');
    await click('next');
    expect(active().querySelector('textarea')).toBe(original);
    expect(original.value).toBe('Unsaved original notes');
    expect(api.listWorkouts).not.toHaveBeenCalled();
  });
  it('leaves both arrows disabled without previous workouts and excludes a resumed source', async () => {
    await mount([workout('Resumed source', '2026-10-19')], { resumed: 'Resumed source' });
    expect([...active().querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  });
  it('retains an edited original at its chronological position', async () => {
    const edited = workout('Editing', '2026-10-18');
    await mount([workout('Newest', '2026-10-19'), edited], { initial: edited });
    const original = active().querySelector('textarea');
    await click('next');
    expect(active().querySelector('section')?.getAttribute('aria-label')).toBe('Newest');
    expect(active().querySelector<HTMLButtonElement>('.workout-navigation-next')!.disabled).toBe(
      true,
    );
    await click('previous');
    expect(active().querySelector('textarea')).toBe(original);
  });
  it('loads history only at the boundary and allows retry after a failed request', async () => {
    const recent = workout('Recent', '2026-10-19');
    vi.mocked(api.listWorkouts)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce([recent, workout('Oldest', '2025-01-01')]);
    await mount([recent], { older: true });
    await click('previous');
    expect(api.listWorkouts).not.toHaveBeenCalled();
    await click('previous');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Offline');
    expect(active().querySelector('section')?.getAttribute('aria-label')).toBe('Recent');
    await click('previous');
    expect(api.listWorkouts).toHaveBeenLastCalledWith('0001-01-01');
    expect(active().querySelector('section')?.getAttribute('aria-label')).toBe('Oldest');
    expect(
      active().querySelector<HTMLButtonElement>('.workout-navigation-previous')!.disabled,
    ).toBe(true);
  });
  it('locks navigation while the older history request is pending', async () => {
    let resolve!: (workouts: TrackedWorkout[]) => void;
    vi.mocked(api.listWorkouts).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await mount([], { older: true });
    await click('previous');
    expect([...active().querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    await act(async () => resolve([]));
    expect(
      active().querySelector<HTMLButtonElement>('.workout-navigation-previous')!.disabled,
    ).toBe(true);
    expect(active().querySelector('textarea')!.value).toBe('Unsaved original notes');
  });
});
