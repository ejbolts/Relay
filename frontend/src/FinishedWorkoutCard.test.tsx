// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinishedWorkoutCard } from './FinishedWorkoutCard';
import { api } from './api';
import type { FinishSummary } from './finishSummary';
import type { Routine, TrainingSplit, WeightMapping } from './types';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      getWeightMapping: vi.fn(),
      getTrainingSplit: vi.fn(),
      routines: { ...original.api.routines, list: vi.fn(), save: vi.fn() },
    },
  };
});

const summary: FinishSummary = {
  sessionId: 'session-1',
  finishedAt: 1000,
  name: 'Lower body workout',
  workoutDate: '2026-11-17',
  durationMinutes: 72,
  sets: 15,
  volumeKg: 9800,
  previous: { workoutDate: '2026-11-13', sets: 16, volumeKg: 9350 },
  machineChanges: [{ exerciseId: 'leg-press', exerciseName: 'Leg Press' }],
  plateaus: [{ exerciseId: 'extension', exerciseName: 'Leg Extension', weightKg: 72.5, reps: 12 }],
};
const mapping = (enabled: boolean, machines = 2) =>
  ({
    enabled,
    reference_machine_id: null,
    machines: Array.from({ length: machines }, (_, index) => ({ id: `machine-${index}` })),
  }) as unknown as WeightMapping;
const routine = {
  id: 'routine',
  name: 'Upper / Lower',
  shared: false,
  days: [
    {
      workout_type_id: 'lower',
      workout_type: null,
      movements: [{ exercise_id: 'extension', exercise: { id: 'extension' }, sets: [] }],
    },
  ],
} as unknown as Routine;
const actions = {
  onDismiss: vi.fn(),
  onOpenWorkout: vi.fn(),
  onCompareMachines: vi.fn(),
  onNotice: vi.fn(),
};
let root: Root;
let container: HTMLDivElement;

async function render(value: FinishSummary = summary) {
  await act(async () => root.render(<FinishedWorkoutCard summary={value} {...actions} />));
}
const steps = () =>
  [...container.querySelectorAll('.finished-workout-steps button')].map((item) =>
    item.textContent?.replace(/\s+/g, ' ').trim(),
  );
const byText = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  )!;
async function click(target: HTMLElement) {
  await act(async () => target.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.mocked(api.getWeightMapping).mockResolvedValue(mapping(false));
  vi.mocked(api.getTrainingSplit).mockResolvedValue({ routine_id: 'routine' } as TrainingSplit);
  vi.mocked(api.routines.list).mockResolvedValue([routine]);
  vi.mocked(api.routines.save).mockImplementation(async (saved) => saved);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows the workout with its time, sets and volume, and the change from last time', async () => {
  await render();
  expect(container.querySelector('h2')?.textContent).toBe('Lower body workout');
  expect(
    [...container.querySelectorAll('.weekly-review-stats > div')].map((item) =>
      item.textContent?.replace(/\s+/g, ' '),
    ),
  ).toEqual(['Time1 h 12 min', 'Sets15−1', 'Volume9,800 kg+450 kg']);
  await click(byText('View workout', container));
  expect(actions.onOpenWorkout).toHaveBeenCalledOnce();
  await click(
    container.querySelector<HTMLButtonElement>('[aria-label="Dismiss workout summary"]')!,
  );
  expect(actions.onDismiss).toHaveBeenCalledOnce();
});

it('offers to compare machines only while their weights are not yet compared', async () => {
  await render();
  expect(steps()[0]).toBe('Leg PressDifferent machine from last timeCompare machines');
  await click(container.querySelector<HTMLButtonElement>('.finished-workout-steps button')!);
  expect(actions.onCompareMachines).toHaveBeenCalledWith('leg-press');
});

it.each([
  ['weights are already compared', mapping(true)],
  ['only one machine is saved', mapping(false, 1)],
])('leaves machines out when %s', async (_reason, value) => {
  vi.mocked(api.getWeightMapping).mockResolvedValue(value);
  await render({ ...summary, plateaus: [] });
  expect(steps()).toEqual([]);
  expect(container.querySelector('.finished-workout-steps')).toBeNull();
});

it('sets a rep range on the split from the card, suggesting one with room above the reps', async () => {
  await render({ ...summary, machineChanges: [] });
  expect(steps()).toEqual(['Leg Extension72.5 kg × 12, three sessions runningSet rep range']);
  await click(container.querySelector<HTMLButtonElement>('.finished-workout-steps button')!);
  const dialog = document.querySelector('.rep-range-dialog')!;
  expect(dialog.querySelector('[aria-checked="true"]')?.textContent).toBe('10–15');
  await click(byText('12–15', dialog));
  await click(byText('Save', dialog));
  expect(vi.mocked(api.routines.save).mock.calls[0][0].days[0].movements[0].rep_range).toEqual({
    min: 12,
    max: 15,
  });
  expect(actions.onNotice).toHaveBeenCalledWith('Rep range saved.');
  // Done: the dialog closes and the step is gone.
  expect(document.querySelector('.rep-range-dialog')).toBeNull();
  expect(steps()).toEqual([]);
});

it('saves the range onto the split as it is now, not the copy the card loaded', async () => {
  await render({ ...summary, machineChanges: [] });
  await click(container.querySelector<HTMLButtonElement>('.finished-workout-steps button')!);
  // The split is edited elsewhere while the card sits on Home.
  const edited = {
    ...routine,
    name: 'Upper / Lower, edited',
    days: [
      {
        ...routine.days[0],
        movements: [
          ...routine.days[0].movements,
          { exercise_id: 'curl', exercise: { id: 'curl' }, sets: [] },
        ],
      },
    ],
  } as unknown as Routine;
  vi.mocked(api.routines.list).mockResolvedValue([edited]);
  await click(byText('Save', document.querySelector('.rep-range-dialog')!));
  const sent = vi.mocked(api.routines.save).mock.calls[0][0];
  expect(sent.name).toBe('Upper / Lower, edited');
  expect(sent.days[0].movements.map((item) => [item.exercise_id, item.rep_range])).toEqual([
    ['extension', { min: 10, max: 15 }],
    ['curl', undefined],
  ]);
});

it('saves nothing when the split no longer needs the range, and says so', async () => {
  await render({ ...summary, machineChanges: [] });
  await click(container.querySelector<HTMLButtonElement>('.finished-workout-steps button')!);
  vi.mocked(api.routines.list).mockResolvedValue([{ ...routine, days: [] }]);
  const dialog = document.querySelector('.rep-range-dialog')!;
  await click(byText('Save', dialog));
  expect(api.routines.save).not.toHaveBeenCalled();
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Your split has changed');
  expect(actions.onNotice).not.toHaveBeenCalled();
});

it('offers no rep range when the split does not plan the exercise, or already has a range', async () => {
  vi.mocked(api.routines.list).mockResolvedValue([
    {
      ...routine,
      days: [
        {
          ...routine.days[0],
          movements: [{ ...routine.days[0].movements[0], rep_range: { min: 8, max: 12 } }],
        },
      ],
    },
  ]);
  await render({ ...summary, machineChanges: [] });
  expect(steps()).toEqual([]);
  expect(api.getWeightMapping).not.toHaveBeenCalled();
});

it('stays quiet about a first workout: no comparison and no steps', async () => {
  await render({ ...summary, previous: null, machineChanges: [], plateaus: [], volumeKg: 0 });
  expect(container.querySelectorAll('.weekly-delta')).toHaveLength(0);
  expect(container.querySelector('.weekly-review-stats')?.textContent).toContain('Volume–');
  expect(api.getTrainingSplit).not.toHaveBeenCalled();
});

it('lists the records the workout set once they are known', async () => {
  await act(async () =>
    root.render(
      <FinishedWorkoutCard
        summary={{ ...summary, machineChanges: [], plateaus: [] }}
        records={[{ id: 'pr-1', exercise: 'Leg Press', detail: 'All-time Weight PR · 200 kg' }]}
        {...actions}
      />,
    ),
  );
  expect(
    [...container.querySelectorAll('.finished-workout-records li')].map((item) =>
      [item.querySelector('strong')?.textContent, item.querySelector('small')?.textContent].join(
        ' | ',
      ),
    ),
  ).toEqual(['Leg Press | All-time Weight PR · 200 kg']);
});
