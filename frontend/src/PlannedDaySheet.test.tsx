// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { PlannedDaySheet, type PlannedStart } from './PlannedDaySheet';
import type { Exercise, Routine, TrackedWorkout, TrainingSplit, WorkoutTypeColors } from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';

vi.mock('./api', () => ({ api: { routines: { list: vi.fn() } } }));

const exercise = (id: string, name: string): Exercise => ({
  id,
  name,
  category: 'upper',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
});
const plannedSet = {
  reps: 8,
  weight_kg: null,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: 120,
  set_type: 'normal' as const,
};
const upper = DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'upper')!;
const lower = DEFAULT_WORKOUT_TYPES.find((type) => type.id === 'lower')!;
const routine: Routine = {
  id: 'routine-1',
  name: 'Upper / Lower',
  shared: false,
  days: [
    {
      workout_type_id: 'upper',
      workout_type: upper,
      movements: [
        {
          exercise_id: 'bench',
          exercise: exercise('bench', 'Barbell Bench Press'),
          sets: [plannedSet],
        },
      ],
    },
    {
      workout_type_id: 'lower',
      workout_type: lower,
      movements: [
        {
          exercise_id: 'split-squat',
          exercise: exercise('split-squat', 'Bulgarian Split Squat'),
          sets: [plannedSet],
        },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};
const split: TrainingSplit = {
  name: 'Upper / Lower',
  enabled: true,
  start_date: '2026-11-01',
  progression: 'workouts',
  steps: [{ workout_type_id: 'upper' }, { workout_type_id: 'lower' }, { workout_type_id: null }],
  routine_id: 'routine-1',
  next_step: 0,
  next_date: '2026-11-19',
};
const colors = Object.fromEntries(
  DEFAULT_WORKOUT_TYPES.map((type) => [type.id, type.color]),
) as WorkoutTypeColors;

let root: Root;
let container: HTMLDivElement;

async function render(props: Partial<Parameters<typeof PlannedDaySheet>[0]> & { date: string }) {
  const onStart = vi.fn<(start: PlannedStart | null) => void>();
  const onResume = vi.fn();
  await act(async () =>
    root.render(
      <WorkoutTypesContext.Provider
        value={{
          types: DEFAULT_WORKOUT_TYPES,
          loading: false,
          error: null,
          reload: async () => undefined,
          applySaved: () => undefined,
          savedExercises: {},
          applySavedExercises: () => undefined,
        }}
      >
        <PlannedDaySheet
          today="2026-11-19"
          split={split}
          workouts={[] as TrackedWorkout[]}
          categoryColors={colors}
          activeWorkout={false}
          onStart={onStart}
          onResume={onResume}
          onEditSplit={vi.fn()}
          onClose={vi.fn()}
          {...props}
        />
      </WorkoutTypesContext.Provider>,
    ),
  );
  return { onStart, onResume };
}

const dialog = () => document.querySelector<HTMLElement>('dialog')!;
const button = (label: string) =>
  [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => (item.getAttribute('aria-label') ?? item.textContent) === label,
  );

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // The calendar sheets are PopupDialogs; jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('starting a planned split day from the calendar', () => {
  it("offers today's split day, pre-filled from its routine, or an empty workout", async () => {
    const { onStart } = await render({ date: '2026-11-19' });
    expect(dialog().querySelector('h2')?.textContent).toBe('Upper body day');
    expect(dialog().textContent).toContain('Barbell Bench Press');
    await act(async () => button('Start Upper body')!.click());
    const start = onStart.mock.calls[0][0]!;
    expect(start.type.id).toBe('upper');
    expect(start.category).toBe('upper');
    expect(start.template?.planned).toBe('routine');
    expect(start.template?.exercises.map((item) => item.exercise.name)).toEqual([
      'Barbell Bench Press',
    ]);
    await act(async () => button('Start empty workout')!.click());
    expect(onStart).toHaveBeenLastCalledWith(null);
  });

  it('shows a later day read-only with Start now, which starts that day today', async () => {
    const { onStart } = await render({ date: '2026-11-20' });
    expect(dialog().querySelector('h2')?.textContent).toBe('Lower body day');
    expect(dialog().textContent).toContain('Bulgarian Split Squat');
    expect(button('Start empty workout')).toBeUndefined();
    await act(async () => button('Start Lower body now')!.click());
    expect(onStart.mock.calls[0][0]!.type.id).toBe('lower');
    expect(onStart.mock.calls[0][0]!.template?.exercises[0].exercise.name).toBe(
      'Bulgarian Split Squat',
    );
  });

  it('offers the next training day and Empty on a rest day today', async () => {
    const { onStart } = await render({ date: '2026-11-19', split: { ...split, next_step: 2 } });
    expect(dialog().querySelector('h2')?.textContent).toBe('Rest day');
    await act(async () => button('Start Upper body')!.click());
    expect(onStart.mock.calls[0][0]!.type.id).toBe('upper');
    expect(button('Start empty workout')).toBeDefined();
  });

  it('never starts anything from a later rest day', async () => {
    await render({ date: '2026-11-21' });
    expect(dialog().querySelector('h2')?.textContent).toBe('Rest day');
    expect(dialog().querySelector('.planned-day-actions')).toBeNull();
    expect(button('Edit split')).toBeDefined();
  });

  it('resumes the live workout instead of starting another', async () => {
    const { onStart, onResume } = await render({ date: '2026-11-20', activeWorkout: true });
    expect(button('Start Lower body now')).toBeUndefined();
    await act(async () => button('Resume workout')!.click());
    expect(onResume).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('still starts the day from its type when the routine cannot load', async () => {
    vi.mocked(api.routines.list).mockRejectedValue(new Error('offline'));
    const { onStart } = await render({ date: '2026-11-19', split: { ...split } });
    await act(async () => button('Start Upper body')!.click());
    expect(onStart.mock.calls[0][0]!.type.id).toBe('upper');
  });
});
