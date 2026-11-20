// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiveWorkoutHeader } from './LiveWorkoutHeader';

let container: HTMLDivElement;
let root: Root;
const actions = {
  onMinimise: vi.fn(),
  onRename: vi.fn(),
  onAdjustTime: vi.fn(),
  onAddNote: vi.fn(),
  onTogglePause: vi.fn(),
  onAddExercise: vi.fn(),
  onDiscard: vi.fn(),
  onFinish: vi.fn(),
};
const menuButtonRef = createRef<HTMLButtonElement>();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(paused = false) {
  await act(async () =>
    root.render(
      <LiveWorkoutHeader
        name="Lower body workout"
        durationLabel={paused ? '12:48' : 'Live 12:48'}
        loggedSets={2}
        paused={paused}
        menuButtonRef={menuButtonRef}
        {...actions}
      />,
    ),
  );
}
const header = () => container.querySelector('header')!;
const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
async function click(label: string) {
  await act(async () => button(label).click());
}
async function key(element: HTMLElement, key: string) {
  await act(async () =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
  );
}
it('shows a compact title, live time and set count with secondary actions in the menu', async () => {
  expect(header().textContent).toContain('Lower body workout');
  expect(header().textContent).toContain('Live 12:48');
  expect(header().textContent).toContain('2 sets');
  expect(container.querySelector('.workout-header-pause')).toBeNull();
  expect(container.querySelector('.overlay-header-title-button')).toBeNull();
  expect(container.querySelector('[role="menu"]')).toBeNull();
  await click('Workout options');
  expect(
    [...container.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
  ).toEqual([
    'Rename workout',
    'Adjust workout time',
    'Add note',
    'Pause workout',
    'Discard workout',
  ]);
});

it("shows the day of a workout from an earlier day, such as last night's resumed session", async () => {
  expect(container.querySelector('.live-workout-date')).toBeNull();
  await act(async () =>
    root.render(
      <LiveWorkoutHeader
        name="Upper A"
        dateLabel="Wed 18 Nov"
        durationLabel="Live 1:13:02"
        loggedSets={19}
        paused={false}
        menuButtonRef={menuButtonRef}
        {...actions}
      />,
    ),
  );
  expect(container.querySelector('.live-workout-meta')?.textContent).toBe(
    'Wed 18 Nov·Live 1:13:02·19 sets',
  );
});

it.each([
  ['Rename workout', 'onRename'],
  ['Adjust workout time', 'onAdjustTime'],
  ['Add note', 'onAddNote'],
  ['Pause workout', 'onTogglePause'],
  ['Discard workout', 'onDiscard'],
] as const)('runs %s and dismisses the menu', async (label, action) => {
  await click('Workout options');
  await click(label);
  expect(actions[action]).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(menuButtonRef.current);
});

it('keeps the menu open when Safari moves tap focus to the sheet around it', async () => {
  // Safari does not focus a tapped button; focus lands on the nearest focusable ancestor.
  container.tabIndex = -1;
  await click('Workout options');
  await act(async () => container.focus());
  expect(container.querySelector('[role="menu"]')).not.toBeNull();
  await click('Rename workout');
  expect(actions.onRename).toHaveBeenCalledOnce();
  await click('Workout options');
  const elsewhere = document.createElement('button');
  document.body.append(elsewhere);
  await act(async () => elsewhere.focus());
  expect(container.querySelector('[role="menu"]')).toBeNull();
  elsewhere.remove();
});

it('offers Resume from the menu when the workout is paused', async () => {
  await render(true);
  await click('Workout options');
  expect(button('Resume workout')).not.toBeNull();
  await click('Resume workout');
  expect(actions.onTogglePause).toHaveBeenCalledOnce();
});

it('supports keyboard menu navigation, Escape and outside dismissal', async () => {
  await key(menuButtonRef.current!, 'ArrowDown');
  expect(document.activeElement).toBe(button('Rename workout'));
  await key(button('Rename workout'), 'ArrowDown');
  expect(document.activeElement).toBe(button('Adjust workout time'));
  await key(button('Adjust workout time'), 'End');
  expect(document.activeElement).toBe(button('Discard workout'));
  await key(button('Discard workout'), 'Escape');
  expect(menuButtonRef.current?.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(menuButtonRef.current);
  await click('Workout options');
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(container.querySelector('[role="menu"]')).toBeNull();
});

it('finishes from a labelled button, adds an exercise and minimises from the handle', async () => {
  expect(container.querySelector('.live-workout-minimise')).toBeNull();
  // A word, so it cannot be mistaken for the ticks on sets and exercises.
  expect(button('Finish workout').querySelector('svg')).toBeNull();
  expect(button('Finish workout').firstChild?.textContent).toBe('Finish');
  await click('Finish workout');
  expect(actions.onFinish).toHaveBeenCalledOnce();
  await click('Add exercise');
  expect(actions.onAddExercise).toHaveBeenCalledOnce();
  await click('Minimise workout');
  expect(actions.onMinimise).toHaveBeenCalledOnce();
});
