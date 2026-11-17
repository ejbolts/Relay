// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLayoutSections } from './HomeLayoutSections';
import { HOME_SECTIONS, type HomeLayout, type HomeSectionId } from './homeLayout';

let root: Root;
let container: HTMLDivElement;
let pointTarget: Element | null;
const changed = vi.fn();
const initial: HomeLayout = {
  order: ['consistency', 'friends', 'zone2', 'bodyweight-trend'],
  hidden: [],
  widths: { consistency: 'compact', friends: 'full' },
};
function Harness({ initialLayout = initial }: { initialLayout?: HomeLayout }) {
  const [layout, setLayout] = useState(initialLayout);
  return (
    <HomeLayoutSections
      layout={layout}
      sections={
        Object.fromEntries(HOME_SECTIONS.map(({ id }) => [id, <p key={id}>{id}</p>])) as Record<
          HomeSectionId,
          React.ReactNode
        >
      }
      edit={{
        saving: false,
        onChange: (next) => {
          changed(next);
          setLayout(next);
        },
      }}
    />
  );
}
async function pointer(handle: Element, type: string) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 240, clientY: 300 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  await act(async () => {
    handle.dispatchEvent(event);
  });
}
async function begin(id: HomeSectionId) {
  const handle = container.querySelector<HTMLButtonElement>(
    `[data-home-section="${id}"] .home-drag-handle`,
  )!;
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => false;
  await pointer(handle, 'pointerdown');
  return handle;
}
beforeEach(async () => {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => pointTarget,
  });
  pointTarget = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.unstubAllGlobals();
  changed.mockClear();
});
describe('Home empty-space dragging', () => {
  it('highlights the empty half-row and fills it without changing the other card widths', async () => {
    const handle = await begin('zone2');
    pointTarget = container.querySelector('[data-home-drop-after="consistency"]');
    await pointer(handle, 'pointermove');
    expect(pointTarget!.classList.contains('is-drop-target')).toBe(true);
    await pointer(handle, 'pointerup');
    expect(changed.mock.lastCall![0]).toEqual({
      ...initial,
      order: ['consistency', 'zone2', 'friends', 'bodyweight-trend'],
      widths: { ...initial.widths, zone2: 'compact' },
    });
    expect(container.querySelector('[data-home-drop-after="consistency"]')).toBeNull();
    expect(
      container.querySelector('[data-home-section="zone2"]')!.getAttribute('data-home-span'),
    ).toBe('3');
  });
  it('shrinks an explicitly expanded card when dropped into a half-row', async () => {
    const handle = await begin('friends');
    pointTarget = container.querySelector('[data-home-drop-after="consistency"]');
    await pointer(handle, 'pointermove');
    expect(pointTarget!.classList.contains('is-drop-target')).toBe(true);
    await pointer(handle, 'pointerup');
    expect(changed.mock.lastCall![0]).toEqual({
      ...initial,
      widths: { consistency: 'compact', friends: 'compact' },
    });
    expect(
      container.querySelector('[data-home-section="friends"]')!.getAttribute('data-home-span'),
    ).toBe('3');
    expect(container.querySelector('[data-home-drop-after="consistency"]')).toBeNull();
  });
  it('fits an expanded section into a third-width space', async () => {
    await act(async () =>
      root.render(
        <Harness
          key="narrow"
          initialLayout={{
            order: ['workouts', 'cardio-sessions', 'friends'],
            hidden: [],
            widths: { workouts: 'compact', 'cardio-sessions': 'compact', friends: 'full' },
          }}
        />,
      ),
    );
    const handle = await begin('friends');
    pointTarget = container.querySelector('[data-home-drop-after="cardio-sessions"]');
    expect(pointTarget!.getAttribute('data-home-drop-span')).toBe('2');
    await pointer(handle, 'pointermove');
    expect(pointTarget!.classList.contains('is-drop-target')).toBe(true);
    await pointer(handle, 'pointerup');
    expect(changed.mock.lastCall![0].widths.friends).toBe('third');
    expect(
      container.querySelector('[data-home-section="friends"]')!.getAttribute('data-home-span'),
    ).toBe('2');
  });
  it('adds a hidden section directly into the tapped space without duplicating it', async () => {
    await act(async () =>
      root.render(
        <Harness
          key="add"
          initialLayout={{
            order: ['workouts', 'cardio-sessions', 'friends', 'consistency'],
            hidden: ['friends'],
            widths: { workouts: 'compact', 'cardio-sessions': 'compact' },
          }}
        />,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-home-drop-after="cardio-sessions"]')!
        .click(),
    );
    expect(document.querySelector('.home-section-picker')).not.toBeNull();
    expect(document.querySelectorAll('.home-section-picker .home-section-choice')).toHaveLength(1);
    expect(document.querySelector('.home-section-picker')!.textContent).not.toContain('Move');
    expect(document.querySelector('[aria-label="Add Workouts here"]')).toBeNull();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Add Recent Friends Activity here"]')!
        .click(),
    );
    expect(changed.mock.lastCall![0]).toEqual({
      order: ['workouts', 'cardio-sessions', 'friends', 'consistency'],
      hidden: [],
      widths: { workouts: 'compact', 'cardio-sessions': 'compact', friends: 'third' },
    });
    expect(container.querySelectorAll('[data-home-section="friends"]')).toHaveLength(1);
    expect(document.querySelector('.home-section-picker')).toBeNull();
  });
  it('shows an empty state when all sections are added and closes without changing the draft', async () => {
    const gap = container.querySelector<HTMLButtonElement>('[data-home-drop-after="consistency"]')!;
    await act(async () => gap.click());
    expect(document.querySelectorAll('.home-section-picker .home-section-choice')).toHaveLength(0);
    expect(document.querySelector('.home-section-picker')!.textContent).toContain(
      'All available sections are already on Home.',
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Close Add a section here"]')!.click(),
    );
    expect(changed).not.toHaveBeenCalled();
    expect(document.querySelector('.home-section-picker')).toBeNull();
  });
  it('cancels a highlighted drop without changing the draft', async () => {
    const handle = await begin('friends');
    pointTarget = container.querySelector('[data-home-drop-after="consistency"]');
    await pointer(handle, 'pointermove');
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    await pointer(handle, 'pointerup');
    expect(changed).not.toHaveBeenCalled();
    expect(container.querySelector('.is-dragging')).toBeNull();
    expect(container.querySelector('.is-drop-target')).toBeNull();
  });
  it('retains existing card-to-card reorder behaviour', async () => {
    const handle = await begin('zone2');
    pointTarget = container.querySelector('[data-home-section="consistency"]');
    await pointer(handle, 'pointermove');
    await pointer(handle, 'pointerup');
    expect(changed.mock.lastCall![0]).toEqual({
      ...initial,
      order: ['zone2', 'consistency', 'friends', 'bodyweight-trend'],
    });
  });
});
