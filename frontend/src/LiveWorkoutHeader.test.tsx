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
  onDiscard: vi.fn(),
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
async function pointer(type: string, x: number, y: number, target: Element = header(), extra = {}) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    ...extra,
  });
  await act(async () => target.dispatchEvent(event));
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

it('minimises from a downward header drag and from the accessible button', async () => {
  await pointer('pointerdown', 100, 10);
  await pointer('pointermove', 102, 55);
  expect(header().style.transform).not.toBe('');
  await pointer('pointerup', 103, 95);
  expect(actions.onMinimise).toHaveBeenCalledOnce();
  await click('Minimise live workout');
  expect(actions.onMinimise).toHaveBeenCalledTimes(2);
});

it('keeps tracking when implicit touch capture moves from the handle to the header', async () => {
  const handle = button('Minimise workout');
  await pointer('pointerdown', 100, 10, handle);
  await pointer('pointermove', 100, 30);
  await pointer('lostpointercapture', 100, 30, handle);
  await pointer('pointerup', 100, 100);
  expect(actions.onMinimise).toHaveBeenCalledOnce();
});

it.each([
  ['short', 100, 35],
  ['upward', 100, -80],
  ['horizontal', 200, 20],
] as const)('ignores a %s drag', async (_name, x, y) => {
  await pointer('pointerdown', 100, 10);
  await pointer('pointermove', x, y);
  await pointer('pointerup', x, y);
  expect(actions.onMinimise).not.toHaveBeenCalled();
  expect(header().style.transform).toBe('');
});

it('ignores controls and cancelled/multitouch gestures', async () => {
  await pointer('pointerdown', 100, 10, button('Workout options'));
  await pointer('pointerup', 100, 110);
  await pointer('pointerdown', 100, 10, header(), { isPrimary: false });
  await pointer('pointerup', 100, 110);
  await pointer('pointerdown', 100, 10);
  await pointer('pointermove', 100, 90);
  await pointer('pointercancel', 100, 90);
  await pointer('pointerup', 100, 110);
  expect(actions.onMinimise).not.toHaveBeenCalled();
});
