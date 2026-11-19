// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProgressScreen } from './App';
import { api } from './api';
import { TrainingBlocksContext } from './trainingBlocksContext';
import { useExerciseLibrary } from './useExerciseLibrary';
import type {
  Exercise,
  ExerciseProgress,
  MachineProgressPoint,
  TrainingBlock,
  WeightMapping,
} from './types';

const press: Exercise = {
  id: 'press',
  name: 'Machine Chest Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Machine',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};

function session(id: string, day: number, machine: string | null, weight: number) {
  return {
    workout_id: id,
    workout_date: `2026-10-${String(day).padStart(2, '0')}`,
    best_weight_kg: weight,
    relative_strength: weight / (day === 1 ? 60 : 100),
    bodyweight_kg: day === 1 ? 60 : 100,
    best_reps: 8,
    estimated_1rm: weight,
    volume_kg: weight * 10,
    best_rpe: null,
    machine_photo_id: machine,
  } satisfies MachineProgressPoint;
}

const machinePoints = [
  session('w1', 1, 'hammer', 80),
  session('w2', 8, 'life', 66),
  session('w3', 15, 'hammer', 84),
  session('w4', 22, 'life', 69),
  session('w5', 29, 'hammer', 88),
];
const progress: ExerciseProgress = {
  exercise: press,
  points: machinePoints.map((item) => ({ ...item, machine_photo_id: undefined })),
  machine_points: machinePoints,
  personal_best_weight_kg: 88,
  personal_best_estimated_1rm: 88,
};
const machine = (id: string, caption: string, workouts: number) => ({
  id,
  caption,
  thumbnail_url: `/${id}.webp`,
  workout_count: workouts,
  last_used_date: null,
  machine_kg: null,
  reference_kg: null,
});
const unmapped: WeightMapping = {
  enabled: false,
  reference_machine_id: null,
  machines: [machine('hammer', 'Hammer', 3), machine('life', 'Life Fitness', 2)],
};

let root: Root, host: HTMLDivElement;
const button = (name: string) =>
  [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === name || item.getAttribute('aria-label') === name,
  )!;
const click = async (element: Element) => act(async () => (element as HTMLElement).click());
const hero = () => host.querySelector('.progress-hero-value')?.textContent;
async function type(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function Screen() {
  const exerciseLibrary = useExerciseLibrary([press], null);
  return (
    <ProgressScreen
      exerciseLibrary={exerciseLibrary}
      exercises={[press]}
      measurements={[]}
      personalRecords={[]}
      onOpenWorkout={() => {}}
      embedded
      initialExerciseId="press"
    />
  );
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api, 'exerciseLibrary').mockResolvedValue([]);
  vi.spyOn(api, 'exerciseProgress').mockResolvedValue(progress);
  vi.spyOn(api, 'getWeightMapping').mockResolvedValue(unmapped);
  vi.spyOn(api, 'saveWeightMapping').mockImplementation(async (_, mapping) => mapping);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Screen />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('filters progress by machine and normalises All machines once mapped', async () => {
  expect(hero()).toBe('88kg');
  expect(button('All machines').getAttribute('aria-pressed')).toBe('true');

  await click(button('Life Fitness'));
  expect(hero()).toBe('69kg');
  expect(host.querySelectorAll('.progress-sessions li')).toHaveLength(2);

  // Named for what it does, and filled in once weights are normalised.
  expect(button('Normalise').getAttribute('aria-label')).toBe('Normalise machine weights');
  await click(button('Normalise'));
  await click(document.querySelector('[role="switch"][aria-label="Normalise weights"]')!);
  // The most used machine becomes the reference and leads the tree, with an arrow to Life Fitness.
  const items = [...document.querySelectorAll('.machine-weights-list.is-tree > li')];
  expect(items.map((item) => item.className)).toEqual(['is-reference', 'is-spoke']);
  expect(items[0].textContent).toContain('Reference');
  expect(items[0].textContent).toContain('Hammer');
  // Two sessions on the Hammer trend suggest ×1.24, pre-filled from the latest Life Fitness weight.
  const field = (label: string) =>
    document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  const factor = () => document.querySelector('.machine-weights-slider b')?.textContent;
  const previewLine = () =>
    document.querySelector('.machine-weights-preview .pulse-chart-line')?.getAttribute('d');
  expect(document.querySelector('.machine-weights-suggestion')?.textContent).toContain(
    'Suggested ×1.24 · 2 sessions',
  );
  expect(field('Weight on Life Fitness').value).toBe('69');
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('85.6');
  expect(factor()).toBe('×1.24');
  expect(items[1].querySelector('.machine-weights-ratio')?.textContent).toBe('×1.24');
  // Each weight is named under its box, and the suggestion sits inside its likely range.
  expect(
    [...items[1].querySelectorAll('.machine-weights-side-name')].map((name) => name.textContent),
  ).toEqual(['This machineLife Fitness', '★ ReferenceHammer']);
  const fit = () => document.querySelector('.machine-weights-fit')?.textContent;
  expect(fit()).toBe('In range');
  expect(items[1].querySelector('.machine-weights-marker')).toBeTruthy();
  const suggestedLine = previewLine();
  expect(suggestedLine).toBeTruthy();

  // Dragging the slider rewrites the pair and redraws the preview straight away.
  const slider = field('Conversion for Life Fitness');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '1.5');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('103.5');
  expect(factor()).toBe('×1.50');
  expect(items[1].querySelector('.machine-weights-ratio')?.textContent).toBe('×1.50');
  expect(previewLine()).not.toBe(suggestedLine);
  expect(fit()).toBe('Outside range');
  await click(button('Use suggested ×1.24 for Life Fitness'));
  expect(factor()).toBe('×1.24');
  expect(fit()).toBe('In range');

  // Changing your weight keeps the conversion.
  await type('Weight on Life Fitness', '40');
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('49.6');
  expect(factor()).toBe('×1.24');
  await type('Matching weight on Hammer for Life Fitness', '');
  await click(button('Save'));
  expect(document.querySelector('.machine-weights-error')?.textContent).toBe(
    'Enter both weights, or leave both blank.',
  );
  expect(api.saveWeightMapping).not.toHaveBeenCalled();

  await type('Matching weight on Hammer for Life Fitness', '50');
  expect(factor()).toBe('×1.25');
  await click(button('Save'));
  expect(api.saveWeightMapping).toHaveBeenCalledWith('press', {
    enabled: true,
    reference_machine_id: 'hammer',
    machines: [unmapped.machines[0], { ...unmapped.machines[1], machine_kg: 40, reference_kg: 50 }],
  });
  expect(document.querySelector('.machine-weights-dialog')).toBeNull();
  expect(document.querySelector('.undo-toast')?.textContent).toContain('Machine weights saved');

  // The single-machine view still shows Life Fitness as logged.
  expect(hero()).toBe('69kg');
  await click(button('All machines ≈'));
  expect(hero()).toBe('≈ 88kg');
  const rows = [...host.querySelectorAll('.progress-sessions li')].map((row) => row.textContent);
  // The Life Fitness session keeps its logged set beside the converted value.
  expect(rows[3]).toContain('66 kg × 8');
  expect(rows[3]).toContain('≈ 82.5');
  expect(host.querySelector('.progress-hero-caption')?.textContent).toContain(
    'Est. 1RM in Hammer weights',
  );
});

/** A session on any date, with an est. 1RM equal to its weight. */
function on(id: string, date: string, machine: string, weight: number) {
  return { ...session(id, 2, machine, weight), workout_date: date };
}

// Hammer every week from August at an est. 1RM of 100; Life Fitness once in between at 80;
// Technogym five times at 80 at an old gym, three months before the first Hammer session.
const spread: MachineProgressPoint[] = [
  ...['04-06', '04-13', '04-20', '04-27', '05-04'].map((day, index) =>
    on(`t${index}`, `2026-${day}`, 'techno', 80),
  ),
  ...['08-03', '08-10', '08-17', '08-24', '08-31', '09-07', '09-14', '09-21', '09-28'].map(
    (day, index) => on(`h${index}`, `2026-${day}`, 'hammer', 100),
  ),
  on('l0', '2026-09-12', 'life', 80),
].sort((first, second) => first.workout_date.localeCompare(second.workout_date));
const spreadProgress = (points: MachineProgressPoint[]): ExerciseProgress => ({
  exercise: press,
  points: points.map((item) => ({ ...item, machine_photo_id: undefined })),
  machine_points: points,
  personal_best_weight_kg: 100,
  personal_best_estimated_1rm: 100,
});
const threeMachines: WeightMapping = {
  enabled: false,
  reference_machine_id: null,
  machines: [
    machine('hammer', 'Hammer', 9),
    machine('life', 'Life Fitness', 1),
    machine('techno', 'Technogym', 5),
  ],
};

async function remount(element: ReactElement) {
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(element));
}
const field = (label: string) =>
  document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const spoke = (caption: string) =>
  [...document.querySelectorAll('.machine-weights-list > li.is-spoke')].find(
    (item) => item.querySelector('.machine-weights-machine strong')?.textContent === caption,
  )!;
const previewLine = () =>
  document.querySelector('.machine-weights-preview .pulse-chart-line')?.getAttribute('d') ?? '';
/** The preview line's heights, one per session. */
const lineHeights = () => [...previewLine().matchAll(/[ML][\d.]+,([\d.]+)/g)].map(([, y]) => y);

async function switchOn() {
  await click(button('Normalise'));
  await click(document.querySelector('[role="switch"][aria-label="Normalise weights"]')!);
}

it('pre-fills a match from any history, and the slider reshapes the preview as it moves', async () => {
  vi.mocked(api.exerciseProgress).mockResolvedValue(spreadProgress(spread));
  vi.mocked(api.getWeightMapping).mockResolvedValue(threeMachines);
  await remount(<Screen />);
  await switchOn();

  // One session close to Hammer's: an estimate from your latest weight on Life Fitness.
  expect(field('Weight on Life Fitness').value).toBe('80');
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('100');
  expect(spoke('Life Fitness').querySelector('.machine-weights-suggestion')?.textContent).toContain(
    'Estimated ×1.25 · 1 session',
  );
  expect(spoke('Life Fitness').querySelector('.machine-weights-band')).toBeTruthy();
  // Sessions only before a long gap still get an estimate, from the weeks nearest Hammer's.
  expect(field('Weight on Technogym').value).toBe('80');
  expect(field('Matching weight on Hammer for Technogym').value).toBe('100');
  expect(spoke('Technogym').querySelector('.machine-weights-suggestion')?.textContent).toContain(
    'Estimated ×1.25 · 5 sessions',
  );
  // Every session now sits on Hammer's flat trend.
  expect(new Set(lineHeights()).size).toBe(1);

  // Dragging lifts the Life Fitness session off the trend straight away.
  const slider = field('Conversion for Life Fitness');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '1.5');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('120');
  expect(spoke('Life Fitness').querySelector('.machine-weights-slider b')?.textContent).toBe(
    '×1.50',
  );
  expect(new Set(lineHeights()).size).toBe(2);
  await click(button('Use estimated ×1.25 for Life Fitness'));
  expect(new Set(lineHeights()).size).toBe(1);

  await click(button('Save'));
  expect(api.saveWeightMapping).toHaveBeenCalledWith('press', {
    enabled: true,
    reference_machine_id: 'hammer',
    machines: [
      threeMachines.machines[0],
      { ...threeMachines.machines[1], machine_kg: 80, reference_kg: 100 },
      { ...threeMachines.machines[2], machine_kg: 80, reference_kg: 100 },
    ],
  });
});

it('keeps a saved match when Normalise is switched back on', async () => {
  vi.mocked(api.exerciseProgress).mockResolvedValue(spreadProgress(spread));
  vi.mocked(api.getWeightMapping).mockResolvedValue({
    ...threeMachines,
    reference_machine_id: 'hammer',
    machines: [
      threeMachines.machines[0],
      threeMachines.machines[1],
      { ...threeMachines.machines[2], machine_kg: 50, reference_kg: 60 },
    ],
  });
  await remount(<Screen />);
  await switchOn();
  expect(field('Weight on Technogym').value).toBe('50');
  expect(field('Matching weight on Hammer for Technogym').value).toBe('60');
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('100');
});

it('slides the preview down, and a swipe or tap on its handle minimises and restores it', async () => {
  // jsdom lays nothing out, so give the chart a height to drag against.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(160);
  vi.mocked(api.exerciseProgress).mockResolvedValue(spreadProgress(spread));
  vi.mocked(api.getWeightMapping).mockResolvedValue(threeMachines);
  await remount(<Screen />);
  await switchOn();
  const preview = () => document.querySelector<HTMLElement>('.machine-weights-preview')!;
  const body = () => preview().querySelector('.machine-weights-preview-body')!;
  const openness = () => preview().style.getPropertyValue('--open');
  // It starts shut and slides open on the next frames.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(openness()).toBe('1');
  expect(preview().style.getPropertyValue('--full')).toBe('160px');

  const handle = button('Minimise preview');
  expect(handle.getAttribute('aria-expanded')).toBe('true');
  await click(handle);
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  expect(handle.getAttribute('aria-label')).toBe('Show preview');
  expect(body().getAttribute('aria-hidden')).toBe('true');
  expect(openness()).toBe('0');
  await click(handle);
  expect(handle.getAttribute('aria-expanded')).toBe('true');

  const pointer = (type: string, clientY: number) =>
    act(async () => {
      handle.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY }));
    });
  // Swiping up follows the finger, then settles shut; the click after the drag is not a tap.
  await pointer('pointerdown', 300);
  await pointer('pointermove', 200);
  expect(preview().classList.contains('is-dragging')).toBe(true);
  expect(openness()).toBe('0.375');
  await pointer('pointerup', 200);
  await click(handle);
  expect(preview().classList.contains('is-dragging')).toBe(false);
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  // Swiping down brings it back.
  await pointer('pointerdown', 200);
  await pointer('pointermove', 330);
  await pointer('pointerup', 330);
  expect(handle.getAttribute('aria-expanded')).toBe('true');
  expect(openness()).toBe('1');
});

it('works matches out from the whole history while Progress shows one training block', async () => {
  const block: TrainingBlock = {
    id: 'b2',
    name: 'Block 2',
    start_date: '2026-09-01',
    end_date: null,
  };
  vi.mocked(api.exerciseProgress).mockImplementation(async (_, blockId) =>
    spreadProgress(blockId ? spread.filter((point) => point.workout_date >= '2026-09-01') : spread),
  );
  vi.mocked(api.getWeightMapping).mockResolvedValue(threeMachines);
  await remount(
    <TrainingBlocksContext.Provider
      value={{
        config: { blocks: [block] },
        block,
        select: () => {},
        changed: () => {},
        loading: false,
        error: null,
        retry: () => {},
      }}
    >
      <Screen />
    </TrainingBlocksContext.Provider>,
  );
  expect(api.exerciseProgress).toHaveBeenCalledWith('press', 'b2');
  await switchOn();
  expect(api.exerciseProgress).toHaveBeenLastCalledWith('press');
  // Technogym's sessions are all before the block.
  expect(field('Matching weight on Hammer for Technogym').value).toBe('100');
  expect(spoke('Technogym').querySelector('.machine-weights-suggestion')?.textContent).toContain(
    'Estimated ×1.25 · 5 sessions',
  );
});

it("shows the strongest lift-to-bodyweight ratio with that set's bodyweight", async () => {
  const relative = () =>
    [...host.querySelectorAll('[aria-label="Personal bests"] > div')].find((card) =>
      card.textContent?.includes('Relative strength'),
    )!;
  expect(relative().querySelector('b')?.textContent).toBe('1.33× BW');
  expect(relative().querySelector('small')?.textContent).toContain('at 60 kg BW');
  await click(button('Life Fitness'));
  expect(relative().querySelector('b')?.textContent).toBe('0.69× BW');
  expect(relative().querySelector('small')?.textContent).toContain('at 100 kg BW');
});
