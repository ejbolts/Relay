// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { StartChooser, type ChosenStart } from './StartChooser';
import { recentDistinctWorkouts } from './startChoices';
import { sessionTemplateFromWorkout } from './trainingSummary';
import { createWorkoutSet } from './workoutSets';
import type { Exercise, Routine, TrackedWorkout, TrainingSplit, WorkoutType } from './types';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      getTrainingSplit: vi.fn(),
      routines: { ...original.api.routines, list: vi.fn() },
    },
  };
});

const exercise = (id: string, name: string): Exercise =>
  ({
    id,
    name,
    category: 'upper',
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: 'Barbell',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
  }) as Exercise;
const bench = exercise('bench', 'Bench Press');
const row = exercise('row', 'Barbell Row');
const squat = exercise('squat', 'Back Squat');
const upper: WorkoutType = {
  id: 'upper',
  name: 'Upper body',
  color: '#8b5cf6',
  is_custom: false,
  archived: false,
};
const lower: WorkoutType = { ...upper, id: 'lower', name: 'Lower body', color: '#f59e0b' };
const planned = {
  reps: 8,
  weight_kg: 60,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: 120,
  set_type: 'normal' as const,
};
const routine = {
  id: 'routine',
  name: 'Upper / Lower',
  shared: false,
  days: [
    {
      workout_type_id: 'upper',
      workout_type: upper,
      movements: [
        { exercise_id: 'bench', exercise: bench, sets: [planned] },
        { exercise_id: 'row', exercise: row, sets: [planned] },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
    {
      workout_type_id: 'lower',
      workout_type: lower,
      movements: [{ exercise_id: 'squat', exercise: squat, sets: [planned] }],
    },
  ],
} as unknown as Routine;

function saved(id: string, name: string, date: string, exercises: Exercise[]): TrackedWorkout {
  return {
    id,
    name,
    workout_date: date,
    category: 'upper',
    notes: null,
    duration_minutes: 50,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
    movements: exercises.map((item, index) => ({
      id: `${id}-${index}`,
      order_index: index,
      exercise: item,
      notes: null,
      machine_photos: [],
      superset_group_id: null,
      superset_name: null,
      sets: [
        {
          ...createWorkoutSet('strength', undefined, false),
          id: `${id}-${index}-set`,
          order_index: 0,
          reps: 8,
          weight_kg: 80,
          completed: true,
        },
      ],
    })),
  } as unknown as TrackedWorkout;
}
const workouts = [
  saved('a', 'Upper A', '2026-11-16', [bench, row]),
  saved('b', 'Lower A', '2026-11-14', [squat]),
  saved('c', 'Upper A', '2026-11-09', [bench]),
];

let root: Root;
let container: HTMLDivElement;
const started: ChosenStart[] = [];
const onClose = vi.fn();

async function render(list: TrackedWorkout[] = workouts) {
  await act(async () =>
    root.render(
      <StartChooser
        workouts={list}
        today="2026-11-17"
        onStart={(choice) => started.push(choice)}
        onClose={onClose}
      />,
    ),
  );
}
const rows = (heading: string) =>
  [...document.querySelectorAll('.start-chooser-body section')]
    .find((section) => section.querySelector('h3')?.textContent === heading)
    ?.querySelectorAll<HTMLButtonElement>('li > button');
const text = (button: Element) => [
  button.querySelector('strong')?.textContent,
  button.querySelector('small')?.textContent,
];

beforeEach(() => {
  vi.clearAllMocks();
  started.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(api.getTrainingSplit).mockResolvedValue({ routine_id: 'routine' } as TrainingSplit);
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('lists the split’s training days, skipping rest days, with their exercises', async () => {
  await render();
  expect([...rows('Upper / Lower')!].map(text)).toEqual([
    ['Day 1 · Upper body', 'Bench Press, Barbell Row'],
    ['Day 3 · Lower body', 'Back Squat'],
  ]);
});

it('starts the chosen day from its plan, as Up next would', async () => {
  await render();
  await act(async () => rows('Upper / Lower')![1].click());
  expect(started).toHaveLength(1);
  expect(started[0]).toMatchObject({ category: 'lower', type: lower });
  expect(started[0].template?.planned).toBe('routine');
  expect(started[0].template?.exercises.map((item) => item.exercise.name)).toEqual(['Back Squat']);
});

it('offers the latest workout of each name to do again', async () => {
  await render();
  expect([...rows('Do again')!].map(text)).toEqual([
    ['Upper A', 'Mon 16 Nov · Bench Press, Barbell Row'],
    ['Lower A', 'Sat 14 Nov · Back Squat'],
  ]);
  await act(async () => rows('Do again')![0].click());
  expect(started[0].template?.sourceWorkout.id).toBe('a');
  expect(started[0].template?.planned).toBeUndefined();
  expect(started[0].template?.exercises.map((item) => item.exercise.name)).toEqual([
    'Bench Press',
    'Barbell Row',
  ]);
});

it('still offers past workouts when there is no split', async () => {
  vi.mocked(api.getTrainingSplit).mockResolvedValue(null);
  await render();
  expect(rows('Upper / Lower')).toBeUndefined();
  expect(rows('Do again')).toHaveLength(2);
});

it('picks recent workouts newest first, one per name, without samples or empty ones', () => {
  const sample = { ...saved('s', 'Sample day', '2026-11-17', [bench]), is_sample: true };
  const empty = saved('e', 'Empty day', '2026-11-17', []);
  expect(recentDistinctWorkouts([...workouts, sample, empty]).map((item) => item.id)).toEqual([
    'a',
    'b',
  ]);
  expect(recentDistinctWorkouts(workouts, 1).map((item) => item.id)).toEqual(['a']);
});

it('builds a template from one saved workout, keeping its exercise order', () => {
  const template = sessionTemplateFromWorkout(workouts[0]);
  expect(template.category).toBe('upper');
  expect(template.exercises.map((item) => [item.exercise.name, item.summary])).toEqual([
    ['Bench Press', '80 kg × 8'],
    ['Barbell Row', '80 kg × 8'],
  ]);
});
