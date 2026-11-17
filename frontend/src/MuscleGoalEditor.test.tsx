// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MuscleGoalEditor } from './MuscleGoalEditor';
import type { MuscleSetGoals } from './muscleSetGoals';
import type { Exercise } from './types';

it('edits primary, assistance and saved custom targets, and resets to the changing default', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const exercise: Exercise = {
    id: 'bench',
    name: 'Bench press',
    category: 'push',
    kind: 'strength',
    muscle_group: 'Chest',
    equipment: null,
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
    muscle_set_credits: [
      { muscle_name: 'Chest', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ],
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let saved: MuscleSetGoals = {};
  function Editor({ defaultGoal }: { defaultGoal: number }) {
    const [goals, setGoals] = useState<MuscleSetGoals>({ 'Custom muscle': 8 });
    saved = goals;
    return (
      <MuscleGoalEditor
        exercises={[exercise]}
        defaultGoal={defaultGoal}
        goals={goals}
        onChange={setGoals}
      />
    );
  }
  try {
    await act(async () => root.render(<Editor defaultGoal={10} />));
    expect(host.querySelectorAll('input')).toHaveLength(3);
    const chest = host.querySelector<HTMLInputElement>('[aria-label="Chest weekly set goal"]')!;
    expect(chest.placeholder).toBe('10');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(chest, '18');
      chest.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(saved).toEqual({ 'Custom muscle': 8, Chest: 18 });
    await act(async () => root.render(<Editor defaultGoal={6} />));
    expect(chest.value).toBe('18');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Use default goal for Chest"]')!.click(),
    );
    expect(saved).toEqual({ 'Custom muscle': 8 });
    expect(chest.value).toBe('');
    expect(chest.placeholder).toBe('6');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
