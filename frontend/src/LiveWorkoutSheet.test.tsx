// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiveWorkoutSheet } from './LiveWorkoutSheet';
import { LiveWorkoutHeader } from './LiveWorkoutHeader';

let container: HTMLDivElement;
let root: Root;
const minimise = vi.fn();
const noop = () => {};
const menuRef = createRef<HTMLButtonElement>();
const sheet = () => container.querySelector<HTMLElement>('.live-workout-sheet')!;
const handle = () => container.querySelector<HTMLButtonElement>('.workout-sheet-grab')!;
const header = () => container.querySelector('header')!;
const cancel = () => container.querySelector<HTMLButtonElement>('[data-test="cancel"]')!;

async function render(active = true) {
  await act(async () =>
    root.render(
      <LiveWorkoutSheet active={active} enabled onMinimise={minimise}>
        <LiveWorkoutHeader
          name="Lower body"
          durationLabel="Live 12:48"
          loggedSets={2}
          paused={false}
          menuButtonRef={menuRef}
          onMinimise={noop}
          onRename={noop}
          onAddNote={noop}
          onTogglePause={noop}
          onAddExercise={noop}
          onDiscard={noop}
          onFinish={noop}
        />
        <div data-test="content">Exercise rows</div>
        <button data-test="cancel">Cancel workout</button>
      </LiveWorkoutSheet>,
    ),
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

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.useFakeTimers();
  minimise.mockClear();
  localStorage.clear();
  document.documentElement.removeAttribute('data-reduce-motion');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-reduce-motion');
});

it('moves the whole sheet with the finger and completes dismissal after the slide', async () => {
  await pointer('pointerdown', 100, 10);
  await pointer('pointermove', 102, 90);
  expect(sheet().style.transform).toBe('translate3d(0, 80px, 0)');
  expect(header().style.transform).toBe('');
  expect(sheet().classList.contains('is-dragging')).toBe(true);
  await pointer('pointerup', 103, 220);
  expect(sheet().style.transform).toBe(`translate3d(0, ${window.innerHeight}px, 0)`);
  expect(minimise).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(320));
  expect(minimise).toHaveBeenCalledOnce();
});

it.each([
  ['short', 100, 40],
  ['upward', 100, -80],
  ['horizontal', 220, 20],
] as const)('snaps back after a %s drag', async (_name, x, y) => {
  await pointer('pointerdown', 100, 10);
  await pointer('pointermove', x, y);
  await pointer('pointerup', x, y);
  await act(async () => vi.advanceTimersByTime(400));
  expect(minimise).not.toHaveBeenCalled();
  expect(sheet().style.transform).toBe('translate3d(0, 0px, 0)');
});

it('minimises on a quick flick, but not on a slow short pull or a sideways flick', async () => {
  const wait = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
  // A slow 40px pull springs back: it is short of the distance and has no speed when let go.
  await pointer('pointerdown', 100, 10);
  await wait(200);
  await pointer('pointermove', 100, 30);
  await wait(200);
  await pointer('pointermove', 100, 50);
  await wait(200);
  await pointer('pointerup', 100, 50);
  await wait(400);
  // A fast flick that is mostly sideways is not a minimise either.
  await pointer('pointerdown', 100, 10);
  await wait(20);
  await pointer('pointermove', 135, 55);
  await wait(20);
  await pointer('pointerup', 135, 55);
  await wait(400);
  expect(minimise).not.toHaveBeenCalled();
  expect(sheet().style.transform).toBe('translate3d(0, 0px, 0)');
  // A quick 45px flick down minimises, well short of the distance a slow drag needs.
  await pointer('pointerdown', 100, 10);
  await wait(20);
  await pointer('pointermove', 102, 35);
  expect(sheet().classList.contains('sheet-dragging')).toBe(true);
  await wait(20);
  await pointer('pointerup', 102, 55);
  await wait(320);
  expect(minimise).toHaveBeenCalledOnce();
});

it('ignores body scrolling, controls and cancelled/multitouch input', async () => {
  for (const target of [container.querySelector('[data-test="content"]')!, menuRef.current!]) {
    await pointer('pointerdown', 100, 10, target);
    await pointer('pointerup', 100, 250);
  }
  await pointer('pointerdown', 100, 10);
  await pointer('pointermove', 100, 90);
  await pointer('pointercancel', 100, 90);
  await pointer('pointerup', 100, 250);
  await pointer('pointerdown', 100, 10, header(), { isPrimary: false });
  await pointer('pointerup', 100, 250);
  expect(minimise).not.toHaveBeenCalled();
});

it('keeps tracking when implicit capture moves from the handle to the sheet', async () => {
  await pointer('pointerdown', 100, 10, handle());
  await pointer('pointermove', 100, 40);
  await pointer('lostpointercapture', 100, 40, handle());
  await pointer('pointerup', 100, 250);
  await act(async () => vi.advanceTimersByTime(320));
  expect(minimise).toHaveBeenCalledOnce();
});

it('minimises from the handle and respects reduced motion', async () => {
  document.documentElement.setAttribute('data-reduce-motion', '');
  await act(async () => handle().click());
  expect(minimise).toHaveBeenCalledOnce();
});

it('preserves its scroll container and restores body scrolling when minimised', async () => {
  const scroll = container.querySelector<HTMLElement>('.live-workout-sheet-scroll')!;
  scroll.scrollTop = 240;
  expect(document.body.classList.contains('live-workout-sheet-open')).toBe(true);
  await render(false);
  expect(document.body.style.overflow).toBe('');
  expect(document.body.classList.contains('live-workout-sheet-open')).toBe(false);
  await render(true);
  expect(container.querySelector('.live-workout-sheet-scroll')).toBe(scroll);
  expect(scroll.scrollTop).toBe(240);
});

it('traps keyboard focus inside the sheet', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  cancel().focus();
  await act(async () =>
    cancel().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    ),
  );
  expect(document.activeElement).toBe(handle());
  await act(async () =>
    handle().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    ),
  );
  expect(document.activeElement).toBe(cancel());
});

it('leaves Escape in a nested portal dialog to that dialog', async () => {
  await act(async () =>
    root.render(
      <LiveWorkoutSheet active enabled onMinimise={minimise}>
        {createPortal(<button data-test="portal">Keep workout</button>, document.body)}
      </LiveWorkoutSheet>,
    ),
  );
  await act(async () =>
    document
      .querySelector('[data-test="portal"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
  );
  await act(async () => vi.advanceTimersByTime(400));
  expect(minimise).not.toHaveBeenCalled();
});

it('slides up when it opens after the app has loaded, then settles', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(10_000);
  await render(false);
  await render(true);
  expect(sheet().classList.contains('is-opening')).toBe(true);
  expect(
    container.querySelector('.live-workout-sheet-backdrop')?.classList.contains('is-opening'),
  ).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(sheet().classList.contains('is-opening')).toBe(false);
});

it('shows in place when the app opens straight into a workout or motion is reduced', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(200);
  await render(false);
  await render(true);
  expect(sheet().classList.contains('is-opening')).toBe(false);
  vi.spyOn(performance, 'now').mockReturnValue(10_000);
  document.documentElement.setAttribute('data-reduce-motion', '');
  await render(false);
  await render(true);
  expect(sheet().classList.contains('is-opening')).toBe(false);
});

it('lets a drag take over from the opening slide', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(10_000);
  await render(false);
  await render(true);
  await pointer('pointerdown', 20, 20);
  expect(sheet().classList.contains('is-opening')).toBe(false);
});
