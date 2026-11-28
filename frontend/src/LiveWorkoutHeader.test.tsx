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
  onStartRest: vi.fn(),
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

const types = [
  { id: 'upper', name: 'Upper body', color: '#8b5cf6' },
  { id: 'cardio', name: 'Cardio', color: '#22c55e' },
  { id: 'push', name: 'Push', color: '#ef476f' },
];
async function renderWithTypes(
  onChooseType: (id: string) => void,
  { typesLoading = false }: { typesLoading?: boolean } = {},
) {
  await act(async () =>
    root.render(
      <LiveWorkoutHeader
        name="Cardio workout"
        durationLabel="Live 0:11"
        loggedSets={0}
        paused={false}
        menuButtonRef={menuButtonRef}
        workoutTypes={types}
        selectedTypeId="cardio"
        typesLoading={typesLoading}
        onChooseType={onChooseType}
        {...actions}
      />,
    ),
  );
}
const menuItems = () =>
  [...container.querySelectorAll('[role="menu"] button')].map((item) => item.textContent);

it('changes the workout type from a list opened in the menu', async () => {
  const onChooseType = vi.fn();
  await renderWithTypes(onChooseType);
  await click('Workout options');
  // The type sits with the workout's own details, showing the current one.
  expect(menuItems()).toEqual([
    'Rename workout',
    'Adjust workout time',
    'Workout typeCardio',
    'Add note',
    'Pause workout',
    'Discard workout',
  ]);
  await click('Workout type: Cardio');
  const menu = container.querySelector('[role="menu"]')!;
  expect(menu.getAttribute('aria-label')).toBe('Workout type');
  expect(menuItems()).toEqual(['Workout type', 'Upper body', 'Cardio', 'Push']);
  expect(
    [...menu.querySelectorAll('[role="menuitemradio"]')].map((item) =>
      item.getAttribute('aria-checked'),
    ),
  ).toEqual(['false', 'true', 'false']);
  expect(
    button('Push').querySelector<HTMLElement>('.live-workout-menu-swatch')!.style.backgroundColor,
  ).toBe('rgb(239, 71, 111)');
  expect(document.activeElement).toBe(button('Cardio'));
  await click('Push');
  expect(onChooseType).toHaveBeenCalledExactlyOnceWith('push');
  expect(container.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(menuButtonRef.current);
  // The menu opens on its actions again, not the list it was closed from.
  await click('Workout options');
  expect(menuItems()[0]).toBe('Rename workout');
});

it('goes back from the workout types and keeps the ticked type without choosing it again', async () => {
  const onChooseType = vi.fn();
  await renderWithTypes(onChooseType);
  await click('Workout options');
  await click('Workout type: Cardio');
  await click('Back from workout type');
  expect(menuItems()[0]).toBe('Rename workout');
  expect(document.activeElement).toBe(button('Workout type: Cardio'));
  await key(button('Workout type: Cardio'), 'ArrowDown');
  expect(document.activeElement).toBe(button('Add note'));
  await click('Workout type: Cardio');
  await key(button('Cardio'), 'ArrowDown');
  expect(document.activeElement).toBe(button('Push'));
  await click('Cardio');
  expect(onChooseType).not.toHaveBeenCalled();
  expect(container.querySelector('[role="menu"]')).toBeNull();
  await click('Workout options');
  await click('Workout type: Cardio');
  await key(button('Cardio'), 'Escape');
  expect(container.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(menuButtonRef.current);
});

it('holds the workout type item while the types load, and skips it with the arrow keys', async () => {
  await renderWithTypes(vi.fn(), { typesLoading: true });
  await click('Workout options');
  expect(button('Workout type: Cardio').disabled).toBe(true);
  await key(button('Rename workout'), 'ArrowDown');
  await key(button('Adjust workout time'), 'ArrowDown');
  expect(document.activeElement).toBe(button('Add note'));
});

it('leaves the workout type off the menu when it cannot be changed', async () => {
  await click('Workout options');
  expect(container.querySelector('.live-workout-menu-type')).toBeNull();
});

it('finishes from a labelled button and minimises from the handle', async () => {
  expect(container.querySelector('.live-workout-minimise')).toBeNull();
  // A word, so it cannot be mistaken for the ticks on sets and exercises.
  expect(button('Finish workout').querySelector('svg')).toBeNull();
  expect(button('Finish workout').firstChild?.textContent).toBe('Finish');
  await click('Finish workout');
  expect(actions.onFinish).toHaveBeenCalledOnce();
  await click('Minimise workout');
  expect(actions.onMinimise).toHaveBeenCalledOnce();
});

it('starts a rest from the same system menu of rest times as the rest pill between sets', async () => {
  expect(button('Add exercise')).toBeNull();
  const select = container.querySelector<HTMLSelectElement>(
    '.live-workout-rest select[aria-label="Rest timer"]',
  )!;
  expect(select.value).toBe('');
  expect([...select.options].map((option) => option.textContent)).toEqual([
    'Rest',
    '0:30',
    '1:00',
    '1:30',
    '2:00',
    '2:30',
    '3:00',
    '3:30',
    '4:00',
    'Custom...',
  ]);
  await act(async () => {
    select.value = '90';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(actions.onStartRest).toHaveBeenCalledWith(90);
  // It goes back to its icon, ready for the next rest.
  expect(select.value).toBe('');
  expect(container.querySelector('.live-workout-rest.is-running')).toBeNull();
  await act(async () =>
    root.render(
      <LiveWorkoutHeader
        name="Lower body workout"
        durationLabel="Live 12:48"
        loggedSets={2}
        paused={false}
        menuButtonRef={menuButtonRef}
        restRunning
        {...actions}
      />,
    ),
  );
  expect(container.querySelector('.live-workout-rest.is-running')).not.toBeNull();
});

it('leaves out the timer button when rest timers are turned off', async () => {
  await act(async () =>
    root.render(
      <LiveWorkoutHeader
        name="Lower body workout"
        durationLabel="Live 12:48"
        loggedSets={2}
        paused={false}
        menuButtonRef={menuButtonRef}
        {...actions}
        onStartRest={undefined}
      />,
    ),
  );
  expect(container.querySelector('.live-workout-rest')).toBeNull();
  expect(button('Workout options')).not.toBeNull();
});
