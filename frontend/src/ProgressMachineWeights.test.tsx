// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProgressScreen } from './App';
import { api } from './api';
import { useExerciseLibrary } from './useExerciseLibrary';
import type { Exercise, ExerciseProgress, MachineProgressPoint, WeightMapping } from './types';

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

  await click(button('Machine weights'));
  await click(document.querySelector('[role="switch"][aria-label="Normalise weights"]')!);
  // The most used machine becomes the reference.
  expect(document.querySelector('.machine-weights-list .is-reference')?.textContent).toContain(
    'Hammer',
  );
  // Two switches between Hammer and Life Fitness suggest ×1.24 and pre-fill its pair.
  const field = (label: string) =>
    document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  const factor = () => document.querySelector('.machine-weights-slider b')?.textContent;
  const previewLine = () =>
    document.querySelector('.machine-weights-preview .pulse-chart-line')?.getAttribute('d');
  expect(document.querySelector('.machine-weights-suggestion')?.textContent).toContain(
    'Suggested ×1.24 · 2 sessions',
  );
  expect(field('Weight on Life Fitness').value).toBe('50');
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('62');
  expect(factor()).toBe('×1.24');
  const zone = () => document.querySelector('.machine-weights-zone-badge')?.textContent;
  expect(zone()).toBe('Within 3%');
  expect(document.querySelector('.machine-weights-zone')).not.toBeNull();
  const suggestedLine = previewLine();
  expect(suggestedLine).toBeTruthy();

  // Dragging the slider rewrites the pair and redraws the preview straight away.
  const slider = field('Conversion for Life Fitness');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '1.5');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(field('Matching weight on Hammer for Life Fitness').value).toBe('75');
  expect(factor()).toBe('×1.50');
  expect(zone()).toBe('21% high');
  expect(previewLine()).not.toBe(suggestedLine);
  await click(button('Use suggested ×1.24 for Life Fitness'));
  expect(factor()).toBe('×1.24');
  expect(zone()).toBe('Within 3%');

  await type('Weight on Life Fitness', '40');
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
