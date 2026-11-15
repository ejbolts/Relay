// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TipsProvider, TipSlot, TipsSettings, useTips } from './Tips';
import { HomeTips } from './HomeTips';
import { loadTips, saveTips, freshTips, TIP_COOLDOWN } from './tipsState';

let root: Root, container: HTMLDivElement;
let controller: ReturnType<typeof useTips>;
let resting = true,
  ready = true,
  workoutCount = 5,
  page = 'log';
function Harness() {
  controller = useTips();
  const { configure } = controller;
  useEffect(() => {
    configure({ page, ready, resting, workoutCount });
  }, [configure]);
  return (
    <>
      <TipSlot id="plates" eligible>
        <button onClick={() => controller.learn('plates')}>Plates</button>
      </TipSlot>
      <TipSlot id="plates" eligible>
        <button>Other plate calculator</button>
      </TipSlot>
      <TipsSettings />
      <input aria-label="Weight" />
    </>
  );
}
async function render(account = 'alice', child = <Harness />) {
  await act(async () =>
    root.render(
      <TipsProvider key={account} account={account}>
        {child}
      </TipsProvider>,
    ),
  );
}
async function advance(ms = 2500) {
  await act(async () => vi.advanceTimersByTime(ms));
}
function button(label: string) {
  return [...document.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  )!;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  resting = ready = true;
  workoutCount = 5;
  page = 'log';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    bottom: 150,
    width: 100,
    height: 50,
    left: 0,
    right: 100,
    x: 0,
    y: 100,
    toJSON() {},
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('shared tip presentation', () => {
  it('shows a quiet dot without intercepting the feature action, and learns it permanently', async () => {
    await render();
    await advance();
    expect(document.querySelectorAll('.relay-tip-dot')).toHaveLength(1);
    expect(button('Tip: Let Relay count the plates')).toBeTruthy();
    await act(async () => button('Tip: Let Relay count the plates').click());
    expect(document.querySelector('.relay-tip-popover')?.textContent).toContain('each side');
    await act(async () => button('Plates').click());
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(loadTips('alice').seen.plates).toBe('learned');
  });
  it.each(['typing', 'dialog', 'onboarding', 'first-workout', 'hidden-panel'])(
    'waits during %s without consuming the allowance',
    async (blocker) => {
      if (blocker === 'onboarding') ready = false;
      if (blocker === 'first-workout') workoutCount = 0;
      await render();
      if (blocker === 'typing') container.querySelector('input')!.focus();
      let dialog: HTMLDialogElement | undefined;
      if (blocker === 'dialog') {
        dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        document.body.append(dialog);
      }
      if (blocker === 'hidden-panel') container.hidden = true;
      await advance();
      expect(document.querySelector('.relay-tip-dot')).toBeNull();
      expect(loadTips('alice').lastShown).toBe(0);
      dialog?.remove();
      container.hidden = false;
    },
  );
  it('defers a behavioural nudge until rest and enforces the threshold', async () => {
    // Prevent the unrelated dot from winning the allowance.
    saveTips('alice', { ...freshTips(), seen: { plates: 'learned' } });
    resting = false;
    await render();
    await act(async () => {
      controller.event('menu-delete', 'swipe', 3);
      controller.event('menu-delete', 'swipe', 3);
    });
    await advance();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    await act(async () => controller.event('menu-delete', 'swipe', 3));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    await act(async () =>
      controller.configure({ page: 'log', ready: true, resting: true, workoutCount: 5 }),
    );
    await advance();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('Swipe a set left');
    await advance(12500);
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    expect(loadTips('alice').seen.swipe).toBe('seen');
  });
  it('shows the set type nudge on a first workout and inside the daily cooldown', async () => {
    workoutCount = 0;
    saveTips('alice', {
      ...freshTips(),
      lastShown: Date.now() - 1000,
      seen: { plates: 'learned' },
    });
    await render();
    await act(async () => {
      controller.event('menu-delete', 'swipe', 1);
      controller.event('warmup-logged', 'setType');
    });
    await advance();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('Tap W beside a set');
    expect(loadTips('alice').seen.setType).toBe('seen');
    await act(async () => button('Dismiss tip').click());
    await advance();
    // Ordinary nudges still wait for a saved workout.
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    expect(loadTips('alice').seen.swipe).toBeUndefined();
  });
  it('replaces a showing ordinary tip with the set type nudge', async () => {
    await render();
    await advance();
    expect(document.querySelector('.relay-tip-dot')).not.toBeNull();
    await act(async () => controller.event('warmup-logged', 'setType'));
    await advance();
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('Tap W beside a set');
  });
  it('turns every surface off immediately, remembers the switch and keeps the library available', async () => {
    await render();
    await advance();
    await act(async () => button('Show tips on this device').click());
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(loadTips('alice').enabled).toBe(false);
    await act(async () => button('Browse tips').click());
    expect(document.querySelector('dialog')?.textContent).toContain('Machine taken?');
    await render('bob');
    await advance();
    expect(button('Show tips on this device').getAttribute('aria-checked')).toBe('true');
    await render('alice');
    await advance();
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
  });
  it('does not repeat tips after reload or spend another surface’s daily allowance', async () => {
    await render();
    await advance();
    await act(async () => controller.dismiss());
    await act(async () => controller.event('re-add-set', 'reorder'));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    await render('other');
    await render('alice');
    vi.setSystemTime(Date.now() + TIP_COOLDOWN);
    await advance();
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
  });
  it('supports a quiet completed-set moment when the rest timer is disabled', async () => {
    saveTips('alice', { ...freshTips(), seen: { plates: 'learned' } });
    resting = false;
    await render();
    await act(async () => {
      controller.event('re-add-set', 'reorder');
      controller.event('set-completed');
    });
    await advance();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('dotted handle');
  });
  it('does not move a workout nudge to an unrelated page', async () => {
    saveTips('alice', { ...freshTips(), seen: { plates: 'learned' } });
    await render();
    await act(async () => {
      controller.event('re-add-set', 'reorder');
      controller.configure({ page: 'settings', ready: true, resting: false, workoutCount: 5 });
    });
    await advance();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
  });
  it('honours a second tab turning tips off', async () => {
    await render();
    await advance();
    saveTips('alice', { ...loadTips('alice'), enabled: false });
    await act(async () =>
      window.dispatchEvent(new StorageEvent('storage', { key: 'relay:tips:v1:alice' })),
    );
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(button('Show tips on this device').getAttribute('aria-checked')).toBe('false');
  });
  async function homeBulb(child = <HomeTips workouts={[]} hasSplit />) {
    page = 'dashboard';
    saveTips('alice', { ...freshTips(), lastShown: Date.now(), seen: { plates: 'learned' } });
    await render(
      'alice',
      <>
        <Harness />
        {child}
      </>,
    );
    await advance();
  }
  async function navigate(destination: string) {
    await act(async () =>
      controller.configure({ page: destination, ready: true, resting: false, workoutCount: 5 }),
    );
    await advance();
  }
  const bulb = () => document.querySelector<HTMLButtonElement>('.home-tip-button');
  const popover = () => document.querySelector('.home-tip-popover');
  it('waits behind a bulb instead of a Home card, without spending contextual discovery', async () => {
    await homeBulb();
    expect(document.querySelector('.relay-tip-home')).toBeNull();
    expect(popover()).toBeNull();
    expect(bulb()?.classList.contains('is-unread')).toBe(true);
    expect(bulb()?.getAttribute('aria-label')).toBe('Tip, new');
    await act(async () => bulb()!.click());
    expect(bulb()?.getAttribute('aria-expanded')).toBe('true');
    expect(popover()?.textContent).toContain('Put sets in order');
    expect(loadTips('alice').homeRead).toEqual(['reorder']);
    expect(loadTips('alice').seen.reorder).toBeUndefined();
    expect(loadTips('alice').lastShown).toBe(Date.now() - 2500);
    await advance();
    expect(popover()).not.toBeNull();
  });
  it('turns grey once every tip is read and opens on the next unread tip', async () => {
    await homeBulb();
    await act(async () => bulb()!.click());
    await act(async () => button('Next').click());
    expect(popover()?.textContent).toContain('One less tap');
    await act(async () => bulb()!.click());
    expect(popover()).toBeNull();
    expect(bulb()?.classList.contains('is-unread')).toBe(true);
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Train alongside a friend');
    expect(bulb()?.classList.contains('is-unread')).toBe(false);
    expect(bulb()?.getAttribute('aria-label')).toBe('Tip');
    await act(async () => button('Next').click());
    expect(popover()?.textContent).toContain('Put sets in order');
  });
  it('retires a tip with Got it and disappears when none are left', async () => {
    await homeBulb();
    for (const id of ['reorder', 'swipe'] as const) await act(async () => controller.learn(id));
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Train alongside a friend');
    expect(button('Next')).toBeUndefined();
    await act(async () => button('Got it').click());
    expect(loadTips('alice').seen.friends).toBe('dismissed');
    expect(popover()).toBeNull();
    expect(bulb()).toBeNull();
  });
  it('closes the popover with Escape, an outside tap or leaving Home', async () => {
    await homeBulb();
    await act(async () => bulb()!.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(bulb());
    await act(async () => bulb()!.click());
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(popover()).toBeNull();
    await act(async () => bulb()!.click());
    await navigate('body');
    expect(popover()).toBeNull();
  });
  it('hides the bulb when tips are off or before a first workout', async () => {
    workoutCount = 0;
    await homeBulb();
    expect(bulb()).toBeNull();
    await act(async () =>
      controller.configure({ page: 'dashboard', ready: true, resting: false, workoutCount: 5 }),
    );
    expect(bulb()).not.toBeNull();
    await act(async () => button('Show tips on this device').click());
    expect(bulb()).toBeNull();
  });
  it('includes relevant machine and maintenance tips', async () => {
    await homeBulb(
      <HomeTips
        measurementCount={3}
        hasSplit
        workouts={
          [
            {
              is_sample: false,
              workout_date: '2026-11-09',
              movements: [{ exercise: { equipment: 'Machine', kind: 'strength' } }],
            },
          ] as never[]
        }
      />,
    );
    await act(async () => bulb()!.click());
    for (const title of [
      'One less tap',
      'Different machines, one progress chart',
      'Saved the same machine twice?',
      'Remember your machine',
      'Maintain a range, not a single number',
    ]) {
      await act(async () => button('Next').click());
      expect(popover()?.textContent).toContain(title);
      expect(document.querySelector('.relay-tip-dot')).toBeNull();
      expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    }
  });
});
