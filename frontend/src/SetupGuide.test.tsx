// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { MachineWeightsDialog } from './MachineWeightsDialog';
import { RoutinePanel } from './RoutinePanel';
import { SetupGuideHost, SetupGuidesSettings } from './SetupGuide';
import {
  activeGuide,
  exitGuide,
  favouriteLift,
  onGuideFinished,
  openSetupGuide,
  recentRotation,
  startGuide,
} from './setupGuides';
import { onTipTarget, type TipAction } from './tipActions';
import { TipsProvider, useTips } from './Tips';
import { TrainingBlockDialog } from './TrainingBlockDialog';
import { TrainingBlocksContext } from './trainingBlocksContext';
import { freshTips } from './tipsState';
import { loadTips, saveTips } from './tipsStorage';
import type {
  Exercise,
  ExerciseProgress,
  MachineProgressPoint,
  Routine,
  TrackedWorkout,
  TrainingBlocks,
  WeightMapping,
} from './types';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';

type SetSpec = { kg: number | null; reps?: number; warmup?: boolean; machine?: string };

function workout(
  id: string,
  date: string,
  name: string,
  movements: { exercise: string; kind?: string; machines?: string[]; sets: SetSpec[] }[],
): TrackedWorkout {
  return {
    id,
    name,
    workout_date: date,
    created_at: `${date}T09:00:00Z`,
    is_sample: false,
    movements: movements.map((movement, index) => ({
      id: `${id}-${index}`,
      order_index: index,
      exercise: {
        id: movement.exercise.toLowerCase().replace(/ /g, '-'),
        name: movement.exercise,
        kind: movement.kind ?? 'strength',
      },
      machine_photos: (movement.machines ?? []).map((machine) => ({
        id: machine,
        caption: machine,
      })),
      sets: movement.sets.map((set, setIndex) => ({
        id: `${id}-${index}-${setIndex}`,
        reps: set.reps ?? 10,
        weight_kg: set.kg,
        warmup: set.warmup ?? false,
        machine_photo_id: set.machine ?? null,
      })),
    })),
  } as unknown as TrackedWorkout;
}

const history = [
  workout('a', '2026-10-01', 'Push', [
    { exercise: 'Leg press', machines: ['Hammer'], sets: [{ kg: 20, warmup: true }, { kg: 140 }] },
    { exercise: 'Bench press', sets: [{ kg: 70 }, { kg: 72.5 }] },
  ]),
  workout('b', '2026-10-03', 'Pull', [
    { exercise: 'Leg press', machines: ['Cybex'], sets: [{ kg: 90 }] },
    { exercise: 'Bench press', sets: [{ kg: 75 }] },
  ]),
  workout('c', '2026-10-05', 'Legs', [
    { exercise: 'Leg press', machines: ['Hammer'], sets: [{ kg: 150 }] },
    { exercise: 'Bench press', sets: [{ kg: 72.5 }, { kg: 72.5 }] },
    { exercise: 'Bike', kind: 'cardio', sets: [{ kg: null }] },
  ]),
];

describe('guide facts', () => {
  it('picks the most-logged weighted lift, ignoring warm-ups, cardio and samples', () => {
    const sample = { ...history[0], id: 's', is_sample: true };
    expect(favouriteLift([...history, sample, sample])).toEqual({
      name: 'Leg press',
      sessions: 3,
      latestTopKg: 150,
      bestKg: 150,
    });
  });

  it('lists recent workouts in the order they were trained', () => {
    expect(recentRotation([history[2], history[0], history[1]])).toEqual(['Push', 'Pull', 'Legs']);
  });
});

let root: Root;
let container: HTMLDivElement;
let blocks: TrainingBlocks;
let finished: string[];
let stopFinished: () => void;
let opened: TipAction[];
let stopTargets: () => void;
let setPage: (page: string) => void;

function PageControl() {
  const { configure } = useTips();
  useEffect(() => {
    setPage = (page) => configure({ page, ready: true, resting: false, workoutCount: 5 });
  }, [configure]);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  localStorage.clear();
  blocks = { blocks: [] };
  finished = [];
  stopFinished = onGuideFinished((id) => finished.push(id));
  opened = [];
  stopTargets = onTipTarget((action) => opened.push(action));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  exitGuide();
  stopFinished();
  stopTargets();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(children: ReactNode) {
  await act(async () =>
    root.render(
      <TrainingBlocksContext.Provider
        value={{
          config: blocks,
          block: null,
          select: () => undefined,
          changed: (next) => {
            blocks = next;
          },
          loading: false,
          error: null,
          retry: () => undefined,
        }}
      >
        <TipsProvider account="alice">
          <PageControl />
          {children}
        </TipsProvider>
      </TrainingBlocksContext.Provider>,
    ),
  );
}

const coach = () => document.querySelector('.setup-coach');
const back = () => coach()?.querySelector<HTMLButtonElement>('.guide-card-back') ?? null;
const coachTitle = () => coach()?.querySelector('.guide-card-title')?.textContent;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  )!;
const click = async (label: string) => act(async () => button(label).click());
async function type(selector: string, value: string) {
  await act(async () => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function submit(selector: string) {
  await act(async () =>
    document
      .querySelector(selector)!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

describe('starting guides', () => {
  it('opens each feature with its guide running, and marks it set up when finished', async () => {
    await render(<SetupGuideHost workouts={history} />);
    await act(async () => openSetupGuide('normalise'));
    expect(opened).toEqual([{ target: 'machine-weights', exerciseId: 'leg-press' }]);
    expect(activeGuide()).toMatchObject({
      id: 'normalise',
      facts: { lift: { name: 'Leg press' }, rotation: ['Push', 'Pull', 'Legs'] },
    });
    await act(async () => openSetupGuide('blocks'));
    expect(opened.at(-1)).toEqual({ target: 'training-blocks' });
    expect(activeGuide()?.id).toBe('blocks');
    const { finishGuide } = await import('./setupGuides');
    await act(async () => finishGuide('blocks'));
    expect(activeGuide()).toBeNull();
    expect(loadTips('alice').seen.blocks).toBe('learned');
  });

  it('explains what comparing machines needs before any exercise has used two', async () => {
    await render(<SetupGuideHost workouts={history.slice(0, 1)} />);
    await act(async () => openSetupGuide('normalise'));
    expect(opened).toEqual([]);
    expect(activeGuide()).toBeNull();
    expect(document.querySelector('.setup-guide-wait')?.textContent).toContain(
      'two saved machines',
    );
    await click('OK');
    expect(document.querySelector('.setup-guide-wait')).toBeNull();
  });

  it('ends the splits guide when you leave the splits page', async () => {
    await render(<SetupGuideHost workouts={history} />);
    await act(async () => openSetupGuide('split'));
    expect(opened).toEqual([{ target: 'split' }]);
    // Still on Home while the splits page opens: the guide keeps running.
    await act(async () => setPage('dashboard'));
    expect(activeGuide()?.id).toBe('split');
    await act(async () => setPage('split'));
    await act(async () => setPage('dashboard'));
    expect(activeGuide()).toBeNull();
  });

  it('lists every guide in Settings, marking features already set up', async () => {
    blocks = {
      blocks: [{ id: 'b', name: 'Strength', start_date: '2026-09-01', end_date: null }],
    };
    saveTips('alice', { ...freshTips(), seen: { split: 'learned', normalise: 'seen' } });
    await render(<SetupGuidesSettings />);
    expect(
      [...document.querySelectorAll('.setup-guide-list button')].map((row) => row.textContent),
    ).toEqual([
      'Compare machines',
      'Training blocksSet up',
      // Rep ranges are part of this guide, so a split alone does not finish it.
      'Splits and rep ranges',
    ]);
  });
});

const press = {
  id: 'press',
  name: 'Chest press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
} as Exercise;
const point = (id: string, day: number, machine: string, weight: number) =>
  ({
    workout_id: id,
    workout_date: `2026-10-${String(day).padStart(2, '0')}`,
    best_weight_kg: weight,
    best_reps: 8,
    estimated_1rm: weight,
    volume_kg: weight * 10,
    best_rpe: null,
    machine_photo_id: machine,
  }) as MachineProgressPoint;
const points = [point('w1', 1, 'hammer', 80), point('w2', 8, 'life', 66)];
const progress = {
  exercise: press,
  points,
  machine_points: points,
  personal_best_weight_kg: 80,
  personal_best_estimated_1rm: 80,
} as ExerciseProgress;
const machine = (id: string, caption: string, workouts: number) => ({
  id,
  caption,
  thumbnail_url: `/${id}.webp`,
  workout_count: workouts,
  last_used_date: null,
  machine_kg: null,
  reference_kg: null,
});
const mapping: WeightMapping = {
  enabled: false,
  reference_machine_id: null,
  machines: [machine('hammer', 'Hammer', 3), machine('life', 'Life Fitness', 2)],
};

describe('guides inside the real screens', () => {
  it('walks through Machine weights and finishes when the normalised weights are saved', async () => {
    vi.spyOn(api, 'saveWeightMapping').mockImplementation(async (_id, next) => next);
    const onSaved = vi.fn();
    startGuide('normalise', history);
    await render(
      <MachineWeightsDialog
        exerciseId="press"
        exerciseName="Chest press"
        mapping={mapping}
        progress={progress}
        weightUnit="kg"
        onClose={() => undefined}
        onSaved={onSaved}
      />,
    );
    expect(coachTitle()).toBe('Switch on Normalise weights');
    expect(back()).toBeNull();
    expect(button('Next').disabled).toBe(true);
    expect(coach()?.textContent).toContain('Your Chest press machines weigh differently');
    // The step points at the real switch, which is what moves the guide on.
    const toggle = document.querySelector('[role="switch"][aria-label="Normalise weights"]')!;
    expect(toggle.classList.contains('guide-target')).toBe(true);
    await act(async () => (toggle as HTMLElement).click());
    expect(coachTitle()).toBe('Check the reference machine');
    await click('Next');
    expect(coachTitle()).toBe('Match the weights');
    await act(async () => back()!.click());
    expect(coachTitle()).toBe('Check the reference machine');
    await act(async () => back()!.click());
    // Back on the switch step while it is on: Next moves on again without touching the switch.
    expect(coachTitle()).toBe('Switch on Normalise weights');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await click('Next');
    await click('Next');
    expect(coachTitle()).toBe('Match the weights');
    await type('[aria-label="Weight on Life Fitness"]', '50');
    await type('[aria-label="Matching weight on Hammer for Life Fitness"]', '60');
    await click('Next');
    expect(coachTitle()).toBe('Save it');
    expect(
      document.querySelector('.machine-weights-save')?.classList.contains('guide-target'),
    ).toBe(true);
    expect(finished).toEqual([]);
    await submit('.machine-weights-form');
    expect(api.saveWeightMapping).toHaveBeenCalled();
    expect(finished).toEqual(['normalise']);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('leaves the guide when Machine weights closes without saving', async () => {
    startGuide('normalise', history);
    await render(
      <MachineWeightsDialog
        exerciseId="press"
        exerciseName="Chest press"
        mapping={mapping}
        progress={progress}
        weightUnit="kg"
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    await click('Close Machine weights');
    expect(activeGuide()).toBeNull();
    expect(finished).toEqual([]);
  });

  it('starts a training block step by step, using your own lift', async () => {
    vi.spyOn(api.trainingBlocks, 'create').mockImplementation(async (block) => ({
      blocks: [{ id: 'new', end_date: null, ...block }],
    }));
    const onNotice = vi.fn();
    startGuide('blocks', history);
    await render(<TrainingBlockDialog start="new" onClose={() => undefined} onNotice={onNotice} />);
    expect(coachTitle()).toBe('Name this phase');
    expect(button('Next').disabled).toBe(true);
    await type('.training-block-form input[maxlength="80"]', 'Strength');
    await click('Next');
    expect(coachTitle()).toBe('Pick a start');
    await act(async () => back()!.click());
    expect(coachTitle()).toBe('Name this phase');
    expect(
      document.querySelector<HTMLInputElement>('.training-block-form input[maxlength="80"]')!.value,
    ).toBe('Strength');
    await click('Next');
    expect(
      document
        .querySelector('.training-block-starts:not(.plan)')
        ?.classList.contains('guide-target'),
    ).toBe(true);
    await click('Next');
    expect(coachTitle()).toBe('Plan an end, if you like');
    await click('Next');
    expect(coachTitle()).toBe('Start the block');
    expect(coach()?.textContent).toContain('Leg press records start fresh');
    await submit('.training-block-form');
    expect(api.trainingBlocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Strength' }),
    );
    expect(finished).toEqual(['blocks']);
    expect(onNotice).toHaveBeenCalledWith('Training block started');
  });
});

const bench = { ...press, id: 'bench', name: 'Bench press', equipment: 'Barbell' } as Exercise;
const plan: Routine = {
  id: 'plan',
  name: 'Upper / Rest',
  shared: false,
  days: [
    {
      workout_type_id: 'upper',
      workout_type: DEFAULT_WORKOUT_TYPES[0],
      movements: [
        {
          exercise_id: bench.id,
          exercise: bench,
          sets: [
            {
              reps: 8,
              weight_kg: 50,
              duration_seconds: null,
              distance_km: null,
              rest_seconds: 120,
              set_type: 'normal',
            },
          ],
        },
      ],
    },
    { workout_type_id: null, workout_type: null, movements: [] },
  ],
};

describe('splits guide', () => {
  beforeEach(() => {
    vi.spyOn(api.routines, 'list').mockResolvedValue([structuredClone(plan)]);
    vi.spyOn(api.routines, 'save').mockImplementation(async (routine) => routine);
    vi.spyOn(api.routines, 'create').mockImplementation(async (routine) => ({
      ...routine,
      id: 'new',
    }));
    vi.spyOn(api.routines, 'use').mockResolvedValue({
      name: 'Upper / Lower',
      enabled: true,
      start_date: '2026-11-18',
      steps: [],
    });
    vi.spyOn(api, 'listExercises').mockResolvedValue([bench]);
    vi.spyOn(api, 'getCardioPreferences').mockResolvedValue({
      heart_rate_zones: [],
      goals: [],
    });
  });

  async function openFirstDay() {
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.routine-day-toggle')!.click(),
    );
  }

  it('adds a rep range to the active split and finishes on save', async () => {
    startGuide('split', history);
    await render(<RoutinePanel ownerId="me" own embedded activeId="plan" />);
    expect(coachTitle()).toBe('Open your split');
    expect(coach()?.classList.contains('is-floating')).toBe(true);
    await click('Edit split');
    // The split already has exercises, so the guide goes straight to rep ranges.
    expect(coachTitle()).toBe('Give an exercise a rep range');
    await act(async () => back()!.click());
    expect(document.querySelector('.routine-editor')).toBeNull();
    expect(coachTitle()).toBe('Open your split');
    await click('Edit split');
    expect(coachTitle()).toBe('Give an exercise a rep range');
    expect(coach()?.textContent).toContain('stay at 150 kg on Leg press');
    expect(button('Next').disabled).toBe(true);
    if (!document.querySelector('.routine-day.is-open')) await openFirstDay();
    await type('[aria-label="Rep range for Bench press on day 1"]', '8-12');
    // Going back now would throw the new range away, so Back is not offered.
    expect(back()).toBeNull();
    await click('Next');
    expect(coachTitle()).toBe('Save your split');
    await act(async () => back()!.click());
    expect(coachTitle()).toBe('Give an exercise a rep range');
    await click('Next');
    await submit('.routine-editor');
    expect(api.routines.save).toHaveBeenCalledWith(
      expect.objectContaining({
        days: expect.arrayContaining([
          expect.objectContaining({
            movements: [expect.objectContaining({ rep_range: { min: 8, max: 12 } })],
          }),
        ]),
      }),
    );
    expect(finished).toEqual(['split']);
  });

  it('builds a new split from a template, then makes it the active split', async () => {
    vi.spyOn(api.routines, 'list').mockResolvedValue([]);
    startGuide('split', history);
    await render(<RoutinePanel ownerId="me" own embedded activeId={null} />);
    expect(coachTitle()).toBe('Start from a template');
    expect(coach()?.textContent).toContain('Your recent workouts went Push, Pull, Legs.');
    await click('New split');
    expect(coachTitle()).toBe('Plan your days');
    expect(button('Next').disabled).toBe(true);
    await click('Add exercise to day 1');
    await type('[aria-label="Search exercises to add to day 1"]', 'Bench');
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (item) => item.querySelector('strong')?.textContent === 'Bench press',
    )!;
    await act(async () => option.click());
    await click('Next');
    expect(coachTitle()).toBe('Give an exercise a rep range');
    await type('[aria-label="Rep range for Bench press on day 1"]', '8-12');
    await click('Next');
    await submit('.routine-editor');
    // Saved, but not yet the split Up next follows.
    expect(finished).toEqual([]);
    await click('Dismiss notification');
    expect(coachTitle()).toBe('Make it your split');
    await click('Use split');
    expect(coachTitle()).toBe('Pick a start date');
    await act(async () => back()!.click());
    expect(document.querySelector('.routine-use')).toBeNull();
    expect(coachTitle()).toBe('Make it your split');
    await click('Use split');
    await submit('.routine-use');
    expect(api.routines.use).toHaveBeenCalledWith('new', expect.any(String));
    expect(finished).toEqual(['split']);
  });
});
