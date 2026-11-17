// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLayoutSections } from './HomeLayoutSections';
import { defaultHomeLayout, HOME_SECTIONS, type HomeSectionId } from './homeLayout';

let root: Root;
let container: HTMLDivElement;
const opened = vi.fn();
const edited = vi.fn();

function Harness({ enabled = true }: { enabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <HomeLayoutSections
      layout={{ ...defaultHomeLayout(), hidden: [] }}
      sections={
        Object.fromEntries(
          HOME_SECTIONS.map(({ id }) => [
            id,
            <section key={id}>
              <button onClick={opened}>{id}</button>
              <input aria-label={`${id} input`} />
            </section>,
          ]),
        ) as Record<HomeSectionId, React.ReactNode>
      }
      onStartEditing={
        enabled
          ? () => {
              edited();
              setEditing(true);
            }
          : undefined
      }
      edit={editing ? { onChange: vi.fn(), saving: false } : undefined}
    />
  );
}

function card(id = 'bodyweight-trend') {
  return container.querySelector(`[data-home-section="${id}"] button`)!;
}
async function pointer(target: EventTarget, type: string, overrides = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 100,
    clientY: 100,
    ...overrides,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
    ...Object.fromEntries(
      Object.entries(overrides)
        .filter(([key]) => ['pointerId', 'isPrimary'].includes(key))
        .map(([key, value]) => [key, { value }]),
    ),
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Home hold to edit', () => {
  it.each(HOME_SECTIONS.map(({ id }) => id))(
    'enters the existing editor after 0.5 seconds on %s',
    async (id) => {
      await pointer(card(id), 'pointerdown');
      await advance(499);
      expect(edited).not.toHaveBeenCalled();
      await advance(1);
      expect(edited).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.home-sections.is-editing')).not.toBeNull();
      expect(container.querySelector('[aria-label="Hide Bodyweight trend"]')).not.toBeNull();
      await pointer(card(id), 'pointerup');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
      await act(async () => {
        card(id).dispatchEvent(click);
      });
      expect(click.defaultPrevented).toBe(true);
      expect(opened).not.toHaveBeenCalled();
      await advance(1500);
      expect(edited).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves a quick tap native and restarts the timer for the next press', async () => {
    await pointer(card(), 'pointerdown');
    await advance(250);
    await pointer(card(), 'pointerup');
    await act(async () => {
      card().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    await advance(500);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(edited).not.toHaveBeenCalled();
    await pointer(card(), 'pointerdown');
    await advance(500);
    expect(edited).toHaveBeenCalledTimes(1);
  });

  it.each(['move', 'scroll', 'cancel', 'blur', 'release outside', 'second finger', 'leave'])(
    'cancels on %s',
    async (action) => {
      await pointer(card(), 'pointerdown');
      await advance(250);
      if (action === 'move') await pointer(card(), 'pointermove', { clientY: 111 });
      if (action === 'scroll') window.dispatchEvent(new Event('scroll'));
      if (action === 'cancel') await pointer(card(), 'pointercancel');
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'release outside') await pointer(window, 'pointerup');
      if (action === 'second finger')
        await pointer(window, 'pointerdown', { pointerId: 2, isPrimary: false });
      if (action === 'leave') await pointer(card(), 'pointerout', { relatedTarget: document.body });
      await advance(500);
      expect(edited).not.toHaveBeenCalled();
    },
  );

  it('allows small finger jitter and prevents a native context menu during the hold', async () => {
    await pointer(card(), 'pointerdown');
    await pointer(card(), 'pointermove', { clientX: 105, clientY: 105 });
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    await advance(500);
    expect(edited).toHaveBeenCalledTimes(1);
  });

  it('preserves text entry, secondary clicks and disabled editing', async () => {
    const input = container.querySelector('input')!;
    await pointer(input, 'pointerdown');
    await advance(500);
    await pointer(card(), 'pointerdown', { button: 2 });
    await advance(500);
    await act(async () => root.render(<Harness enabled={false} />));
    await pointer(card(), 'pointerdown');
    await advance(500);
    expect(edited).not.toHaveBeenCalled();
  });

  it('cleans up a pending hold on unmount', async () => {
    await pointer(card(), 'pointerdown');
    await act(async () => root.render(null));
    await advance(500);
    expect(edited).not.toHaveBeenCalled();
  });
});
