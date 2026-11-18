// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupGuideHost, SetupGuidesSettings } from './SetupGuide';
import {
  favouriteLift,
  latestWorkoutPlan,
  machineComparison,
  openSetupGuide,
  recentRotation,
} from './setupGuides';
import { onTipTarget, type TipAction } from './tipActions';
import { TipsProvider } from './Tips';
import { TrainingBlocksContext } from './trainingBlocksContext';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import { freshTips, loadTips, saveTips } from './tipsState';
import type { TrackedWorkout, TrainingPreferences } from './types';

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

describe('guide data', () => {
  it('compares the machines one exercise was logged on, most used first', () => {
    expect(machineComparison(history, 'leg-press')).toEqual({
      exerciseId: 'leg-press',
      exerciseName: 'Leg press',
      machines: [
        { id: 'Hammer', caption: 'Hammer', sessions: 2, topKg: 150 },
        { id: 'Cybex', caption: 'Cybex', sessions: 1, topKg: 90 },
      ],
    });
    expect(machineComparison(history, 'bench-press')).toBeNull();
  });

  it('picks the most-logged weighted lift, ignoring warm-ups, cardio and samples', () => {
    const sample = { ...history[0], id: 's', is_sample: true };
    expect(favouriteLift([...history, sample, sample])).toEqual({
      name: 'Leg press',
      sessions: 3,
      latestTopKg: 150,
      bestKg: 150,
    });
  });

  it('lists recent workouts in the order they were trained and the latest planned day', () => {
    expect(recentRotation([history[2], history[0], history[1]])).toEqual(['Push', 'Pull', 'Legs']);
    expect(latestWorkoutPlan(history)).toEqual({
      name: 'Legs',
      exercises: [
        { name: 'Leg press', sets: 1 },
        { name: 'Bench press', sets: 2 },
      ],
    });
  });
});

describe('setup guides', () => {
  let root: Root;
  let container: HTMLDivElement;
  let unit: 'kg' | 'lb';
  let blocks: number;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    localStorage.clear();
    unit = 'kg';
    blocks = 0;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(children: React.ReactNode) {
    await act(async () =>
      root.render(
        <TrainingPreferencesContext.Provider
          value={{
            preferences: { preferred_weight_unit: unit } as TrainingPreferences,
            error: null,
            applySaved: () => undefined,
          }}
        >
          <TrainingBlocksContext.Provider
            value={{
              config: {
                blocks: Array.from({ length: blocks }, (_, index) => ({
                  id: `b${index}`,
                  name: 'Strength',
                  start_date: '2026-09-01',
                  end_date: null,
                })),
              },
              block: null,
              select: () => undefined,
              changed: () => undefined,
              loading: false,
              error: null,
              retry: () => undefined,
            }}
          >
            <TipsProvider account="alice">{children}</TipsProvider>
          </TrainingBlocksContext.Provider>
        </TrainingPreferencesContext.Provider>,
      ),
    );
  }

  const guide = () => document.querySelector('.setup-guide');
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  async function finish(steps: number) {
    for (let step = 1; step < steps; step += 1) await act(async () => button('Next →')!.click());
  }

  it('explains training blocks with your own best lift and starts one', async () => {
    const opened: TipAction[] = [];
    const stop = onTipTarget((action) => opened.push(action));
    await render(<SetupGuideHost workouts={history} />);
    await act(async () => openSetupGuide('blocks'));
    expect(guide()?.textContent).toContain('SETUP GUIDE · 1 OF 4');
    await act(async () => button('Next →')!.click());
    expect(guide()?.textContent).toContain('Your best Leg press is 150 kg.');
    await act(async () => button('Back')!.click());
    expect(guide()?.textContent).toContain('A phase with its own start');
    await finish(4);
    await act(async () => button('Start a block')!.click());
    expect(opened).toEqual([{ target: 'training-blocks' }]);
    expect(guide()).toBeNull();
    expect(loadTips('alice').seen.blocks).toBe('seen');
    stop();
  });

  it('shows when to add weight using the same rule as logging, in pounds too', async () => {
    unit = 'lb';
    await render(<SetupGuideHost workouts={history} />);
    await act(async () => openSetupGuide('split'));
    expect(guide()?.textContent).toContain('Your recent workouts went Push, Pull, Legs.');
    await finish(3);
    const rows = [...guide()!.querySelectorAll('.setup-guide-progression tbody tr')].map(
      (row) => row.lastElementChild?.textContent,
    );
    expect(rows).toEqual(['Stay at 330 lb', 'Stay at 330 lb', 'Go up to 335 lb']);
    expect(button('Set up your split')).toBeDefined();
  });

  it('opens an existing split once one is saved, and stops when put away', async () => {
    saveTips('alice', { ...freshTips(), seen: { split: 'learned' } });
    const opened: TipAction[] = [];
    const stop = onTipTarget((action) => opened.push(action));
    await render(<SetupGuideHost workouts={[]} />);
    await act(async () => openSetupGuide('split'));
    // With no history the guide still explains the feature, with a template example.
    expect(guide()?.querySelector('.setup-guide-rotation')?.textContent).toContain('Upper');
    await act(async () => button('Not now')!.click());
    expect(guide()).toBeNull();
    expect(opened).toEqual([]);
    await act(async () => openSetupGuide('split'));
    await finish(3);
    await act(async () => button('Open your split')!.click());
    expect(opened).toEqual([{ target: 'split' }]);
    stop();
  });

  it('points to Exercises when no exercise has used two machines yet', async () => {
    const opened: TipAction[] = [];
    const stop = onTipTarget((action) => opened.push(action));
    await render(<SetupGuideHost workouts={history.slice(0, 1)} />);
    await act(async () => openSetupGuide('normalise'));
    expect(guide()?.querySelector('.setup-guide-machines')).toBeNull();
    await finish(4);
    expect(guide()?.textContent).toContain('choose Normalise');
    await act(async () => button('Open Exercises')!.click());
    expect(opened).toEqual([{ target: 'machine-weights' }]);
    stop();
  });

  it('lists every guide in Settings, marking features already set up', async () => {
    blocks = 1;
    saveTips('alice', { ...freshTips(), seen: { split: 'learned', normalise: 'seen' } });
    await render(
      <>
        <SetupGuidesSettings />
        <SetupGuideHost workouts={history} />
      </>,
    );
    const rows = [...document.querySelectorAll('.setup-guide-list button')];
    expect(rows.map((row) => row.textContent)).toEqual([
      'Compare machines',
      'Training blocksSet up',
      // Rep ranges are part of this guide, so a split alone does not finish it.
      'Splits and rep ranges',
    ]);
    await act(async () => (rows[0] as HTMLButtonElement).click());
    expect(guide()?.textContent).toContain('You’ve logged Leg press on 2 machines.');
  });
});
