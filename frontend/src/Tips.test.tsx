// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { TipsProvider, TipSlot, TipsSettings, useTips } from './Tips';
import { HomeTips } from './HomeTips';
import { SetupGuideHost } from './SetupGuide';
import { activeGuide, exitGuide } from './setupGuides';
import { onTipTarget, type TipAction } from './tipActions';
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
    // It went by untouched, so it is not seen yet and may return another day.
    expect(loadTips('alice').seen.swipe).toBeUndefined();
    expect(loadTips('alice').shows?.swipe).toBe(1);
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
    expect(loadTips('alice').seen.setType).toBeUndefined();
    await act(async () => button('Dismiss tip').click());
    expect(loadTips('alice').seen.setType).toBe('dismissed');
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
  it('does not repeat a dismissed tip after reload, and lets a nudge follow a quiet dot the same day', async () => {
    await render();
    await advance();
    await act(async () => controller.dismiss());
    // The dot interrupted nothing, so today's nudge is still available.
    expect(loadTips('alice').lastShown).toBe(0);
    await act(async () => controller.event('re-add-set', 'reorder'));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('dotted handle');
    await render('other');
    await render('alice');
    vi.setSystemTime(Date.now() + TIP_COOLDOWN);
    await advance();
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
  });
  it('lets one nudge a day through, and brings back one that went by untouched', async () => {
    saveTips('alice', { ...freshTips(), seen: { plates: 'learned' } });
    await render();
    await act(async () => controller.event('re-add-set', 'reorder'));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('dotted handle');
    await advance(12500);
    // A second nudge the same day waits.
    await act(async () => controller.event('replace-exercise', 'swap'));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
    // Tomorrow the untouched one may show again when its moment recurs.
    vi.setSystemTime(Date.now() + TIP_COOLDOWN);
    await act(async () => controller.event('re-add-set', 'reorder'));
    await advance();
    expect(document.querySelector('.relay-tip-nudge')?.textContent).toContain('dotted handle');
    expect(loadTips('alice').shows?.reorder).toBe(2);
  });
  it('brings a dot back on later visits until it has been shown three times', async () => {
    await render();
    for (const visit of [1, 2, 3]) {
      await advance();
      expect(document.querySelectorAll('.relay-tip-dot')).toHaveLength(1);
      expect(loadTips('alice').shows?.plates).toBe(visit);
      // Leaving the screen takes the dot away; in the app its control is gone with the screen.
      await act(async () =>
        controller.configure({ page: 'settings', ready: true, resting: false, workoutCount: 5 }),
      );
      expect(document.querySelector('.relay-tip-dot')).toBeNull();
      await act(async () =>
        controller.configure({ page: 'log', ready: true, resting: true, workoutCount: 5 }),
      );
    }
    await advance();
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(loadTips('alice').seen.plates).toBe('seen');
  });
  it('counts opening a dot as seeing it', async () => {
    await render();
    await advance();
    await act(async () => button('Tip: Let Relay count the plates').click());
    expect(loadTips('alice').seen.plates).toBe('seen');
    await act(async () => button('Got it').click());
    expect(loadTips('alice').seen.plates).toBe('dismissed');
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
  });
  it('runs an anchored tip’s action in place and retires the tip', async () => {
    const open = vi.fn();
    function Anchored() {
      controller = useTips();
      const { configure } = controller;
      useEffect(() => {
        configure({ page: 'progress', ready: true, resting: false, workoutCount: 5 });
      }, [configure]);
      return (
        <TipSlot id="normalise" eligible onAction={open}>
          <button>Normalise</button>
        </TipSlot>
      );
    }
    await render('alice', <Anchored />);
    await advance();
    await act(async () => button('Tip: Different machines, one progress chart').click());
    await act(async () => button('Open Machine weights').click());
    expect(open).toHaveBeenCalledOnce();
    expect(loadTips('alice').seen.normalise).toBe('dismissed');
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(document.querySelector('.relay-tip-popover')).toBeNull();
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
    expect(bulb()?.getAttribute('aria-label')).toBe('Tips, 2 new');
    expect(bulb()?.textContent).toBe('2');
    await act(async () => bulb()!.click());
    expect(bulb()?.getAttribute('aria-expanded')).toBe('true');
    expect(popover()?.textContent).toContain('Train alongside a friend');
    expect(loadTips('alice').homeRead).toEqual(['friends']);
    expect(loadTips('alice').seen.friends).toBeUndefined();
    expect(loadTips('alice').lastShown).toBe(Date.now() - 2500);
    await advance();
    expect(popover()).not.toBeNull();
  });
  it('turns grey once every tip is read and opens on the next unread tip', async () => {
    await homeBulb();
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Train alongside a friend');
    await act(async () => bulb()!.click());
    expect(popover()).toBeNull();
    expect(bulb()?.classList.contains('is-unread')).toBe(true);
    // The next unread tip follows on.
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Make Relay look your way');
    await act(async () => bulb()!.click());
    expect(bulb()?.classList.contains('is-unread')).toBe(false);
    expect(bulb()?.getAttribute('aria-label')).toBe('Tips');
    expect(bulb()?.textContent).toBe('Tips');
    // Read tips stay browsable, from the first.
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Train alongside a friend');
    await act(async () => button('Next').click());
    expect(popover()?.textContent).toContain('Make Relay look your way');
  });
  it('puts a tip away with Got it without retiring its hint elsewhere, and stays as a caught-up bulb', async () => {
    await homeBulb();
    await act(async () => controller.learn('appearance'));
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Train alongside a friend');
    expect(button('Next')).toBeUndefined();
    await act(async () => button('Got it').click());
    expect(loadTips('alice').homeDone).toEqual(['friends']);
    expect(loadTips('alice').seen.friends).toBeUndefined();
    expect(popover()).toBeNull();
    expect(bulb()?.classList.contains('is-unread')).toBe(false);
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain("You're all caught up");
    expect(document.querySelector('.home-tip-dots')).toBeNull();
    await act(async () => button('Done').click());
    expect(popover()).toBeNull();
    expect(bulb()).not.toBeNull();
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
  it('shows the bulb before a first workout and hides it when tips are off', async () => {
    workoutCount = 0;
    await homeBulb();
    expect(bulb()).not.toBeNull();
    await act(async () => button('Show tips on this device').click());
    expect(bulb()).toBeNull();
  });
  const machineWorkout = (id: string, date: string, machine: string) => ({
    id,
    is_sample: false,
    workout_date: date,
    movements: [
      {
        exercise: {
          id: 'chest-press',
          name: 'Chest press',
          equipment: 'Machine',
          kind: 'strength',
        },
        machine_photos: [{ id: machine, caption: machine }],
        sets: [],
      },
    ],
  });
  const twoMachines = [
    machineWorkout('a', '2026-11-02', 'technogym'),
    machineWorkout('b', '2026-11-05', 'life-fitness'),
    machineWorkout('c', '2026-11-09', 'technogym'),
  ] as never[];
  const cutTo = (target: number) =>
    vi.spyOn(api, 'listBodyWeightGoals').mockResolvedValue([
      {
        id: 'cut',
        created_at: '2026-09-01T08:00:00Z',
        start_date: '2026-09-01',
        target_date: '2026-12-01',
        start_weight_kg: 86,
        target_weight_kg: target,
        maintenance_min_kg: null,
        maintenance_max_kg: null,
        active: true,
      },
    ]);
  it('lists features, most useful first, and leaves gesture hints to their controls', async () => {
    cutTo(80);
    await homeBulb(<HomeTips latestWeightKg={79.8} hasSplit={false} workouts={twoMachines} />);
    expect(bulb()?.getAttribute('aria-label')).toBe('Tips, 5 new');
    // More than three new tips are not counted out one by one.
    expect(bulb()?.textContent).toBe('3+');
    await act(async () => bulb()!.click());
    const titles = [popover()?.querySelector('strong')?.textContent];
    for (let step = 0; step < 4; step += 1) {
      await act(async () => button('Next').click());
      titles.push(popover()?.querySelector('strong')?.textContent);
    }
    expect(titles).toEqual([
      'Different machines, one progress chart',
      'Have a regular rotation?',
      'Maintain a range, not a single number',
      'Train alongside a friend',
      'Make Relay look your way',
    ]);
    expect(document.querySelector('.relay-tip-dot')).toBeNull();
    expect(document.querySelector('.relay-tip-nudge')).toBeNull();
  });
  it('brings a guided tip back to the bulb a week after Got it, while the feature is unused', async () => {
    await homeBulb(<HomeTips hasSplit workouts={twoMachines} />);
    await act(async () => bulb()!.click());
    expect(popover()?.querySelector('strong')?.textContent).toBe(
      'Different machines, one progress chart',
    );
    await act(async () => button('Got it').click());
    const unread = () => bulb()?.getAttribute('aria-label');
    const before = unread();
    expect(loadTips('alice').reminders?.normalise?.at).toBe(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // A week later, coming back to the app brings it back as new.
    vi.setSystemTime(Date.now() + 7 * 24 * 60 * 60 * 1000 + 1000);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(unread()).not.toBe(before);
    await act(async () => bulb()!.click());
    expect(popover()?.querySelector('strong')?.textContent).toBe(
      'Different machines, one progress chart',
    );
    expect(loadTips('alice').reminders?.normalise).toEqual({ count: 1 });
  });
  it('leaves the maintenance range out while the weight goal is still ahead', async () => {
    // Three weigh-ins in, 2.4 kg short of the goal: nothing to maintain yet.
    cutTo(80);
    await homeBulb(<HomeTips latestWeightKg={82.4} hasSplit workouts={[]} />);
    expect(bulb()?.getAttribute('aria-label')).toBe('Tips, 2 new');
    await act(async () => bulb()!.click());
    const titles = [popover()?.querySelector('strong')?.textContent];
    await act(async () => button('Next').click());
    titles.push(popover()?.querySelector('strong')?.textContent);
    expect(titles).toEqual(['Train alongside a friend', 'Make Relay look your way']);
  });
  it('leaves comparing machines out until one exercise has used two of them', async () => {
    await homeBulb(<HomeTips hasSplit workouts={twoMachines.slice(0, 1)} />);
    await act(async () => bulb()!.click());
    expect(popover()?.textContent).toContain('Train alongside a friend');
  });
  it('starts the machines guide in Machine weights for the right exercise', async () => {
    const opened: TipAction[] = [];
    const stop = onTipTarget((action) => opened.push(action));
    await homeBulb(
      <>
        <HomeTips hasSplit workouts={twoMachines} />
        <SetupGuideHost workouts={twoMachines} />
      </>,
    );
    await act(async () => bulb()!.click());
    // Home's wording says what the feature is for, not where its button is.
    expect(popover()?.querySelector('p')?.textContent).toBe(
      'Compare different machines on one chart with Machine weights.',
    );
    await act(async () => button('Show me how').click());
    expect(popover()).toBeNull();
    // The guide runs inside Machine weights itself, opened on the exercise used on two machines.
    expect(opened).toEqual([{ target: 'machine-weights', exerciseId: 'chest-press' }]);
    expect(activeGuide()?.id).toBe('normalise');
    expect(loadTips('alice').seen.normalise).toBe('seen');
    exitGuide();
    stop();
  });
});
