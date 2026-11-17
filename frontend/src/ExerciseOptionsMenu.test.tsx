// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExerciseOptionsMenu } from './ExerciseOptionsMenu';

let host: HTMLDivElement, root: Root;
const merge = vi.fn();
const trigger = () => host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
const item = () => host.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
const click = async (element: HTMLElement) => act(async () => element.click());
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  merge.mockReset();
  await act(async () =>
    root.render(
      <>
        <ExerciseOptionsMenu exerciseName="My bench press" onMerge={merge} />
        <button id="outside">Outside</button>
      </>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('opens the menu with focus and closes it after choosing merge', async () => {
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(item()).toBeNull();
  await click(trigger());
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(item());
  expect(item().textContent).toBe('Merge with another exercise');
  await click(item());
  expect(merge).toHaveBeenCalledExactlyOnceWith(trigger());
  expect(item()).toBeNull();
});
it('supports arrow-key opening and Escape restores focus to the trigger', async () => {
  await act(async () =>
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(document.activeElement).toBe(item());
  await act(async () =>
    item().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(item()).toBeNull();
  expect(document.activeElement).toBe(trigger());
  expect(merge).not.toHaveBeenCalled();
});
it('dismisses on outside pointer or keyboard focus without stealing focus', async () => {
  const outside = host.querySelector<HTMLButtonElement>('#outside')!;
  await click(trigger());
  await act(async () => outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(item()).toBeNull();
  await click(trigger());
  await act(async () => outside.focus());
  expect(item()).toBeNull();
  expect(document.activeElement).toBe(outside);
  expect(merge).not.toHaveBeenCalled();
});

it('offers rename and hide, moves between items with the arrow keys and shows hidden state', async () => {
  const rename = vi.fn();
  const toggle = vi.fn();
  await act(async () =>
    root.render(
      <ExerciseOptionsMenu
        exerciseName="My bench press"
        hidden
        onRename={rename}
        onMerge={merge}
        onToggleHidden={toggle}
      />,
    ),
  );
  await click(trigger());
  const items = () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  expect(items().map((entry) => entry.textContent)).toEqual([
    'Rename',
    'Merge with another exercise',
    'Show in exercise lists',
  ]);
  expect(document.activeElement).toBe(items()[0]);
  for (const [name, index] of [
    ['ArrowDown', 1],
    ['End', 2],
    ['ArrowDown', 0],
    ['ArrowUp', 2],
  ] as const) {
    await act(async () =>
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(items()[index]);
  }
  await click(items()[2]);
  expect(toggle).toHaveBeenCalledOnce();
  await click(trigger());
  await click(items()[0]);
  expect(rename).toHaveBeenCalledExactlyOnceWith(trigger());
});
it('renders nothing when no option applies', async () => {
  await act(async () => root.render(<ExerciseOptionsMenu exerciseName="Bench press" />));
  expect(host.querySelector('.exercise-options')).toBeNull();
});
