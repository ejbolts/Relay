// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { addDays } from './trainingSummary';
import { localDate } from './utils';
import { readActiveWorkoutDraft } from './workoutDraft';
import type {
  DashboardData,
  Exercise,
  HeatmapDay,
  Routine,
  TrackedWorkout,
  TrainingSplit,
  WorkoutCategory,
} from './types';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      workoutRevision: vi.fn().mockResolvedValue({ revision: 'initial' }),
      dashboard: vi.fn(),
      listExercises: vi.fn(),
      listWorkouts: vi.fn(),
      listBodyMeasurements: vi.fn().mockResolvedValue([]),
      listPersonalRecords: vi.fn().mockResolvedValue([]),
      getWorkoutTypeColors: vi.fn(),
      exerciseLibrary: vi.fn().mockResolvedValue([]),
      routines: { ...original.api.routines, list: vi.fn() },
    },
  };
});
vi.mock('./workoutCache', () => ({
  readDashboardCache: vi.fn().mockResolvedValue(null),
  writeDashboardCache: vi.fn().mockResolvedValue(undefined),
  readWorkoutCache: vi.fn().mockResolvedValue(null),
  writeWorkoutCache: vi.fn().mockResolvedValue(undefined),
}));

const squat: Exercise = {
  id: 'squat',
  name: 'Back Squat',
  category: 'lower',
  kind: 'strength',
  muscle_group: 'Quads',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const ride: Exercise = {
  ...squat,
  id: 'ride',
  name: 'Cycling',
  category: 'cardio',
  kind: 'cardio',
};

const today = localDate();
const yesterday = addDays(today, -1);
const twoDaysAgo = addDays(today, -2);
const tomorrow = addDays(today, 1);

function workout(
  id: string,
  name: string,
  date: string,
  category: WorkoutCategory,
  exercise: Exercise,
): TrackedWorkout {
  return {
    id,
    name,
    workout_date: date,
    category,
    notes: null,
    duration_minutes: 45,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    movements: [
      {
        id: `${id}-movement`,
        order_index: 0,
        notes: null,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        exercise,
        sets: [
          {
            id: `${id}-set`,
            order_index: 0,
            weight_kg: category === 'cardio' ? null : 100,
            reps: category === 'cardio' ? null : 5,
            rpe: null,
            rest_seconds: null,
            duration_seconds: category === 'cardio' ? 1800 : null,
            distance_km: category === 'cardio' ? 10 : null,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: false,
            set_type: 'normal',
            failed: false,
            target_reps: null,
            notes: null,
            completed: true,
          },
        ],
      },
    ],
  };
}

const legDay = workout('legs', 'Leg day', twoDaysAgo, 'lower', squat);
const bikeRide = workout('ride', 'Bike ride', yesterday, 'cardio', ride);
const workouts = [bikeRide, legDay];

function heatmapDay(item: TrackedWorkout): HeatmapDay {
  return {
    workout_date: item.workout_date,
    categories: [item.category],
    workout_count: 1,
    set_count: 1,
    workouts: [
      {
        id: item.id,
        name: item.name,
        category: item.category,
        duration_minutes: item.duration_minutes,
        exercises: [
          { exercise_name: item.movements[0].exercise.name, set_count: 1, bodyweight_kg: null },
        ],
      },
    ],
  };
}

// Upper today, then Lower tomorrow, following logged workouts.
const split: TrainingSplit = {
  name: 'Upper / Lower',
  enabled: true,
  start_date: addDays(today, -30),
  progression: 'workouts',
  steps: [{ workout_type_id: 'upper' }, { workout_type_id: 'lower' }, { workout_type_id: null }],
  routine_id: 'routine',
  next_step: 0,
  next_date: today,
};
const routine: Routine = {
  id: 'routine',
  name: 'Upper / Lower',
  shared: false,
  days: [
    { workout_type_id: 'upper', workout_type: null, movements: [] },
    {
      workout_type_id: 'lower',
      workout_type: null,
      movements: [
        {
          exercise_id: squat.id,
          exercise: squat,
          sets: [
            {
              reps: 5,
              weight_kg: 100,
              duration_seconds: null,
              distance_km: null,
              rest_seconds: 180,
              set_type: 'normal',
            },
          ],
        },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};

let root: Root;
let container: HTMLDivElement;

const visible = <T extends Element>(selector: string) =>
  [...container.querySelectorAll<T>(selector)].filter((item) => !item.closest('[hidden]'));
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const match = [...scope.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  if (!match) throw new Error(`No button labelled ${label}`);
  return match as HTMLButtonElement;
}
const click = (target: HTMLElement) => act(async () => target.click());

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  Element.prototype.scrollIntoView = vi.fn();
  window.localStorage.clear();
  window.localStorage.setItem('gym-logger-reduce-motion', 'reduced');
  window.history.replaceState(null, '', '#history');
  vi.mocked(api.dashboard).mockResolvedValue({
    recommendation: null,
    heatmap: workouts.map(heatmapDay),
    training_split: split,
  } as unknown as DashboardData);
  vi.mocked(api.listExercises).mockResolvedValue([squat, ride]);
  vi.mocked(api.listWorkouts).mockResolvedValue(workouts);
  vi.mocked(api.getWorkoutTypeColors).mockResolvedValue({
    upper: '#8b5cf6',
    lower: '#f59e0b',
    push: '#ef476f',
    pull: '#3b82f6',
    full_body: '#14b8a6',
    cardio: '#22c55e',
    other: '#94a3b8',
  });
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the Training calendar', () => {
  it("opens a logged day's workout as its session card, with editing as the second choice", async () => {
    await act(async () => root.render(<App />));
    await click(visible<HTMLButtonElement>(`.calendar-day[data-date="${twoDaysAgo}"]`)[0]);
    expect(button('Edit workout', dialog()!)).toBeDefined();
    await click(button('Open Leg day', dialog()!));
    expect(dialog()).toBeNull();
    const open = visible('.history-card.open');
    expect(open).toHaveLength(1);
    expect(open[0].textContent).toContain('Leg day');
    expect(location.hash).not.toBe('#log');
  });

  it('hides the types switched off in the legend from the session list and its totals', async () => {
    await act(async () => root.render(<App />));
    const titles = () => visible('.history-card-copy strong').map((item) => item.textContent);
    expect(titles()).toEqual(['Bike ride', 'Leg day']);
    await click(button('Cardio', visible('.category-legend')[0]));
    expect(titles()).toEqual(['Leg day']);
    expect(visible('.history-week-header')[0].textContent).toContain('1 workout ·');
    await click(button('Cardio', visible('.category-legend')[0]));
    expect(titles()).toEqual(['Bike ride', 'Leg day']);
  });

  it("shows a later planned day and starts it today, never on that day's date", async () => {
    await act(async () => root.render(<App />));
    await click(visible<HTMLButtonElement>(`.calendar-day[data-date="${tomorrow}"]`)[0]);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Lower body day');
    expect(dialog()?.textContent).toContain('Back Squat');
    await click(button('Start Lower body now', dialog()!));
    const draft = readActiveWorkoutDraft();
    expect(draft?.workoutDate).toBe(today);
    expect(draft?.category).toBe('lower');
    expect(draft?.movements.map((item) => item.exerciseId)).toEqual([squat.id]);
  });
});
