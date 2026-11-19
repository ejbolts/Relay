// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExerciseMergeNudge } from './ExerciseMergeNudge';
import type { Exercise } from './types';

const official: Exercise = {
  id: 'official',
  name: 'Lateral Raise',
  category: 'push',
  kind: 'strength',
  muscle_group: 'Shoulders',
  equipment: 'Dumbbell',
  is_custom: false,
  is_favorite: false,
  muscle_contributions: [],
};
const custom: Exercise = { ...official, id: 'custom', name: 'Lateral raises', is_custom: true };
const unrelated: Exercise = { ...custom, id: 'unrelated', name: 'Neck harness' };
let root: Root, host: HTMLDivElement;
const merge = vi.fn();
const render = (exercise: Exercise) =>
  act(async () =>
    root.render(
      <ExerciseMergeNudge
        exercise={exercise}
        exercises={[official, custom, unrelated]}
        onMerge={merge}
      />,
    ),
  );
const button = (name: string) =>
  [...host.querySelectorAll('button')].find((item) => item.textContent === name)!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  merge.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('points out a close standard exercise and opens the merge for it', async () => {
  await render(custom);
  expect(host.textContent).toContain('Looks like Lateral Raise');
  expect(host.textContent).toContain('Official · Shoulders · Dumbbell');
  await act(async () => button('Merge').click());
  expect(merge).toHaveBeenCalledExactlyOnceWith('official', button('Merge'));
});

it('stays hidden after "Not the same", including next time', async () => {
  await render(custom);
  await act(async () => button('Not the same').click());
  expect(host.textContent).toBe('');
  await act(async () => root.unmount());
  root = createRoot(host);
  await render(custom);
  expect(host.textContent).toBe('');
});

it('shows nothing without a close match', async () => {
  await render(unrelated);
  expect(host.textContent).toBe('');
});
