// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardioGoalCardSettingsForm } from './CardioGoalCardSettings';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const choose = (label: string) =>
  act(async () =>
    [...container.querySelectorAll('label')]
      .find((item) => item.textContent === label)!
      .querySelector('input')!
      .click(),
  );

it('offers every configured goal and design, and treats a removed goal as all goals', async () => {
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <CardioGoalCardSettingsForm
        goals={[
          { zone: 2, minutes: 150 },
          { zone: 4, minutes: 45 },
        ]}
        value={{ zone: 5, style: 'progress' }}
        onChange={onChange}
      />,
    ),
  );
  const checked = [...container.querySelectorAll<HTMLInputElement>('input:checked')].map(
    (input) => input.parentElement!.textContent,
  );
  expect(checked).toEqual(['All goals', 'Progress bar']);
  await choose('Zone 4 · 45 min');
  expect(onChange).toHaveBeenLastCalledWith({ zone: 4 });
  await choose('Ring');
  expect(onChange).toHaveBeenLastCalledWith({ style: 'ring' });
});
