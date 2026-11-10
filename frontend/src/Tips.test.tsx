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
  it('holds a Home card after it has been counted as seen', async () => {
    page = 'dashboard';
    await render(
      'alice',
      <>
        <Harness />
        <HomeTips workouts={[]} createdAt="2026-10-01" hasSplit />
      </>,
    );
    // The dot would otherwise compete with Home in this artificial harness.
    await act(async () => controller.learn('plates'));
    await advance();
    expect(document.querySelector('.relay-tip-home')?.textContent).toContain('Make Home your own');
    await advance();
    expect(document.querySelector('.relay-tip-home')).not.toBeNull();
  });
  it('allows a deliberate Home carousel change without allowing a second automatic tip', async () => {
    page = 'dashboard';
    await render(
      'alice',
      <>
        <Harness />
        <HomeTips
          workouts={Array.from({ length: 3 }, () => ({ workout_date: '2026-11-09' })) as never[]}
          createdAt="2026-10-01"
          hasSplit={false}
        />
      </>,
    );
    await act(async () => controller.learn('plates'));
    await advance();
    await act(async () => button('Next tip').click());
    expect(document.querySelector('.relay-tip-home')?.textContent).toContain(
      'Have a regular rotation?',
    );
    await act(async () => controller.dismiss());
    await act(async () => controller.event('re-add-set', 'reorder'));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
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
});
