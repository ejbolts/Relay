// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActivityCardSettingsForm } from './ActivityCardSettings';
import type { ActivityCardSettings } from './homeLayout';

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
  vi.unstubAllGlobals();
});

it('previews the latest 4, 8 and 12 weekly totals and their matching averages', async () => {
  await act(async () =>
    root.render(
      <ActivityCardSettingsForm
        values={[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]}
        value={{ weeks: 8 }}
        onChange={vi.fn()}
      />,
    ),
  );
  const choices = [...container.querySelectorAll('label')];
  expect(choices.map((label) => label.querySelectorAll('.pulse-sparkbars i').length)).toEqual([
    4, 8, 12,
  ]);
  expect(
    choices.map((label) => label.querySelector('.activity-card-average')?.textContent),
  ).toEqual(['2.5 / week', '4.5 / week', '6.5 / week']);
  expect(
    container.querySelector<HTMLInputElement>('input:checked')?.getAttribute('aria-label'),
  ).toBe('8 weeks');
});

it('changes the chosen window without changing a second customiser', async () => {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState<ActivityCardSettings>({ weeks: 8 });
    return (
      <>
        <ActivityCardSettingsForm
          values={Array(12).fill(2)}
          value={value}
          onChange={(change) => {
            changed(change);
            setValue({ ...value, ...change });
          }}
        />
        <ActivityCardSettingsForm
          values={Array(12).fill(1)}
          value={{ weeks: 8 }}
          onChange={vi.fn()}
        />
      </>
    );
  }
  await act(async () => root.render(<Harness />));
  const groups = container.querySelectorAll('fieldset');
  for (const weeks of [4, 12, 8]) {
    await act(async () =>
      groups[0].querySelector<HTMLInputElement>(`input[aria-label="${weeks} weeks"]`)!.click(),
    );
    expect(changed).toHaveBeenLastCalledWith({ weeks });
    expect(groups[0].querySelector('input:checked')?.getAttribute('aria-label')).toBe(
      `${weeks} weeks`,
    );
    expect(groups[1].querySelector('input:checked')?.getAttribute('aria-label')).toBe('8 weeks');
  }
});
