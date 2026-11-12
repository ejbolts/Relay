// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { WorkoutTypesProvider } from './WorkoutTypesProvider';
import { WorkoutTypesSettings } from './WorkoutTypesSettings';
import { WorkoutTypeExercisesEditor } from './WorkoutTypeExercisesEditor';
import { useWorkoutTypes } from './workoutTypesContext';
import type { Exercise, RoutineMovement, WorkoutType } from './types';

const upper: WorkoutType = {
  id: 'upper',
  name: 'Upper body',
  color: '#8b5cf6',
  is_custom: false,
  archived: false,
};
const arms: WorkoutType = {
  id: 'custom-arms',
  name: 'Arms',
  color: '#22c55e',
  is_custom: true,
  archived: false,
};
const bench: Exercise = {
  id: 'bench',
  name: 'Barbell Bench Press',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const curl: Exercise = { ...bench, id: 'curl', name: 'Band Biceps Curl', muscle_group: 'Biceps' };
const set = {
  reps: 8,
  weight_kg: 60,
  duration_seconds: null,
  distance_km: null,
  rest_seconds: 120,
  set_type: 'normal' as const,
};

let root: Root;
let host: HTMLDivElement;

function Settings() {
  const workoutTypes = useWorkoutTypes();
  return (
    <WorkoutTypesSettings types={workoutTypes.types} onTypesChange={workoutTypes.applySaved} />
  );
}

const byLabel = <T extends Element>(label: string) =>
  document.querySelector<T>(`[aria-label="${label}"]`);

/** The saved-exercise count badge on a type's Exercises button. */
const count = (name: string) =>
  byLabel(`${name} exercises`)!.querySelector('.workout-types-count')?.textContent ?? null;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.spyOn(api, 'getWorkoutTypes').mockResolvedValue([upper, arms]);
  vi.spyOn(api, 'getWorkoutTypeExercises').mockResolvedValue([
    {
      workout_type_id: 'upper',
      movements: [{ exercise_id: 'bench', exercise: bench, sets: [set] }],
    },
  ]);
  vi.spyOn(api, 'listExercises').mockResolvedValue([bench, curl]);
  vi.spyOn(api, 'saveWorkoutTypeExercises').mockImplementation(
    async (typeId: string, movements: RoutineMovement[]) => ({
      workout_type_id: typeId,
      movements,
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <WorkoutTypesProvider>
        <Settings />
      </WorkoutTypesProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('saves exercises to a workout type without a split', async () => {
  expect(count('Upper body')).toBe('1');
  expect(count('Arms')).toBeNull();

  await act(async () => byLabel<HTMLButtonElement>('Arms exercises')!.click());
  expect(document.querySelector('dialog h2')!.textContent).toBe('Arms exercises');
  await act(async () => byLabel<HTMLButtonElement>('Add exercise to Arms')!.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes('Band Biceps Curl'),
  )!;
  await act(async () => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    option.click();
  });
  await act(async () =>
    byLabel<HTMLButtonElement>('Edit sets for Band Biceps Curl on Arms')!.click(),
  );
  await act(async () =>
    byLabel<HTMLButtonElement>('One more set of Band Biceps Curl on Arms')!.click(),
  );
  expect(byLabel('Arms exercise 1')).not.toBeNull();

  await act(async () =>
    document
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(api.saveWorkoutTypeExercises).toHaveBeenCalledTimes(1);
  const [typeId, movements] = vi.mocked(api.saveWorkoutTypeExercises).mock.calls[0];
  expect(typeId).toBe('custom-arms');
  expect(movements.map((item) => [item.exercise_id, item.sets.length])).toEqual([['curl', 4]]);
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.querySelector('.top-toast')!.textContent).toContain('Arms exercises saved');
  expect(count('Arms')).toBe('1');
});

it('keeps the edits open when saving fails', async () => {
  vi.mocked(api.saveWorkoutTypeExercises).mockRejectedValueOnce(new Error('Server unavailable.'));
  await act(async () => byLabel<HTMLButtonElement>('Upper body exercises')!.click());
  await act(async () =>
    byLabel<HTMLButtonElement>('Edit sets for Barbell Bench Press on Upper body')!.click(),
  );
  await act(async () =>
    byLabel<HTMLButtonElement>('Remove Barbell Bench Press from Upper body')!.click(),
  );
  await act(async () =>
    document
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(document.querySelector('dialog [role="alert"]')!.textContent).toBe('Server unavailable.');
  expect(byLabel('Upper body exercise 1')).toBeNull();
  expect(count('Upper body')).toBe('1');
});

it('applies a card preset, preserves set details and returns focus to the count', async () => {
  await act(async () => byLabel<HTMLButtonElement>('Upper body exercises')!.click());
  const toggle = byLabel<HTMLButtonElement>('Edit sets for Barbell Bench Press on Upper body')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(byLabel('One more set of Barbell Bench Press on Upper body')).toBeNull();
  await act(async () => toggle.click());
  const presets = byLabel('Set count for Barbell Bench Press')!;
  await act(async () =>
    [...presets.querySelectorAll('button')].find((b) => b.textContent === '5 sets')!.click(),
  );
  expect(toggle.textContent).toContain('5 sets');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
  await act(async () => toggle.click());
  await act(async () =>
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('dialog')).not.toBeNull();
  expect(document.querySelector('.type-exercises-summary')!.textContent).toContain(
    '1 exercise · 5 sets',
  );
  await act(async () =>
    document
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  const saved = vi.mocked(api.saveWorkoutTypeExercises).mock.calls[0][1];
  expect(saved[0].sets).toEqual(Array.from({ length: 5 }, () => set));
});

it('keeps cardio minute controls and closes the card with Escape', async () => {
  const bike: Exercise = {
    ...bench,
    id: 'bike',
    name: 'Stationary Bike',
    category: 'cardio',
    kind: 'cardio',
  };
  const saved = vi.fn();
  await act(async () =>
    root.render(
      <WorkoutTypeExercisesEditor
        type={arms}
        movements={[
          { exercise_id: bike.id, exercise: bike, sets: [{ ...set, duration_seconds: 1800 }] },
        ]}
        onSaved={saved}
        onClose={vi.fn()}
      />,
    ),
  );
  const toggle = byLabel<HTMLButtonElement>('Edit minutes for Stationary Bike on Arms')!;
  expect(toggle.textContent).toContain('30 min');
  await act(async () => toggle.click());
  expect(byLabel('Set count for Stationary Bike')).toBeNull();
  const plus = byLabel<HTMLButtonElement>('5 more minutes of Stationary Bike on Arms')!;
  await act(async () => plus.click());
  expect(toggle.textContent).toContain('35 min');
  await act(async () =>
    plus.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
  await act(async () =>
    document
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(saved.mock.calls[0][0][0].sets[0].duration_seconds).toBe(2100);
});

it('limits strength counts to 1–50 and removes a card explicitly', async () => {
  const saved = vi.fn();
  await act(async () =>
    root.render(
      <WorkoutTypeExercisesEditor
        type={arms}
        movements={[
          { exercise_id: bench.id, exercise: bench, sets: Array.from({ length: 50 }, () => set) },
        ]}
        onSaved={saved}
        onClose={vi.fn()}
      />,
    ),
  );
  const toggle = byLabel<HTMLButtonElement>('Edit sets for Barbell Bench Press on Arms')!;
  await act(async () => toggle.click());
  expect(byLabel<HTMLButtonElement>('One more set of Barbell Bench Press on Arms')!.disabled).toBe(
    true,
  );
  await act(async () =>
    [...byLabel('Set count for Barbell Bench Press')!.querySelectorAll('button')]
      .find((b) => b.textContent === '2 sets')!
      .click(),
  );
  await act(async () => toggle.click());
  await act(async () =>
    byLabel<HTMLButtonElement>('One fewer set of Barbell Bench Press on Arms')!.click(),
  );
  expect(toggle.textContent).toContain('1 set');
  expect(byLabel<HTMLButtonElement>('One fewer set of Barbell Bench Press on Arms')!.disabled).toBe(
    true,
  );
  await act(async () =>
    byLabel<HTMLButtonElement>('Remove Barbell Bench Press from Arms')!.click(),
  );
  expect(document.querySelector('.routine-exercise-card')).toBeNull();
  expect(document.querySelector('.type-exercises-summary')!.textContent).toContain('0 exercises');
  expect(byLabel<HTMLButtonElement>('Add exercise to Arms')!.disabled).toBe(false);
});
