// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutHeaderMeta, WorkoutTimerDock } from './WorkoutRestTimer';

describe('workout header time', () => {
  it('shows only the live time while running', () => {
    const markup = renderToStaticMarkup(<WorkoutHeaderMeta durationLabel="Live 3:55:32" />);
    expect(markup).toContain('<span class="workout-header-duration">Live 3:55:32</span>');
    expect(markup).not.toContain('Paused');
    expect(markup).not.toContain('role="timer"');
  });

  it('marks a paused workout beside its frozen time', () => {
    const markup = renderToStaticMarkup(<WorkoutHeaderMeta durationLabel="28:14" paused />);
    expect(markup).toContain('class="workout-header-meta is-paused"');
    expect(markup).toContain(
      '<span class="workout-header-duration">28:14</span><span class="workout-header-separator" aria-hidden="true">•</span><span class="workout-header-paused">Paused</span>',
    );
  });
});

describe('workout timer dock', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);

  type DockState = Pick<
    Parameters<typeof WorkoutTimerDock>[0],
    'restSeconds' | 'restTotal' | 'restHidden' | 'paused'
  >;

  async function render(props: Partial<DockState> = {}) {
    const handlers = {
      onTogglePause: vi.fn(),
      onAdjust: vi.fn(),
      onHide: vi.fn(),
      onShow: vi.fn(),
    };
    await act(async () =>
      root.render(
        <WorkoutTimerDock
          restSeconds={45}
          restTotal={180}
          restHidden={false}
          paused={false}
          {...handlers}
          {...props}
        />,
      ),
    );
    return handlers;
  }

  it('shows a running rest as one pill: pause, countdown, -30, +30, hide and its progress', async () => {
    const handlers = await render();
    const pill = container.querySelector('.rest-pill')!;
    expect(pill.getAttribute('role')).toBe('group');
    expect(pill.querySelector('[role="timer"]')?.textContent).toBe('0:45');
    expect(pill.querySelector('[role="timer"]')?.getAttribute('aria-label')).toBe(
      'Rest timer 0:45',
    );
    expect(
      [...pill.querySelectorAll('button')].map((item) => item.getAttribute('aria-label')),
    ).toEqual([
      'Pause workout and rest timer',
      'Take 30 seconds off the rest',
      'Add 30 seconds to the rest',
      'Hide rest timer',
    ]);
    // The only text is the countdown; the skip buttons are icons drawn around "30".
    expect(pill.textContent).toBe('0:453030');
    expect(pill.querySelector<HTMLElement>('.rest-pill-fill')?.style.transform).toBe(
      'scaleX(0.25)',
    );
    expect(container.querySelector('.rest-notch')).toBeNull();
    await act(async () => button('Take 30 seconds')!.click());
    await act(async () => button('Add 30 seconds')!.click());
    expect(handlers.onAdjust.mock.calls).toEqual([[-30], [30]]);
    await act(async () => button('Pause workout')!.click());
    expect(handlers.onTogglePause).toHaveBeenCalledTimes(1);
  });

  it('swaps pause for a gold play button while paused', async () => {
    await render({ paused: true });
    expect(container.querySelector('.rest-pill')?.classList.contains('is-paused')).toBe(true);
    expect(button('Resume workout and rest timer')).not.toBeNull();
    expect(container.querySelector('[role="timer"]')?.getAttribute('aria-label')).toBe(
      'Rest timer 0:45, paused',
    );
  });

  it('hides into the bottom-edge notch, which shows the time and reopens the pill', async () => {
    function Harness() {
      const [hidden, setHidden] = useState(false);
      return (
        <WorkoutTimerDock
          restSeconds={48}
          restTotal={90}
          restHidden={hidden}
          paused={false}
          onTogglePause={vi.fn()}
          onAdjust={vi.fn()}
          onHide={() => setHidden(true)}
          onShow={() => setHidden(false)}
        />
      );
    }
    await act(async () => root.render(<Harness />));
    await act(async () => button('Hide rest timer')!.click());
    const notch = container.querySelector<HTMLButtonElement>('.rest-notch')!;
    expect(container.querySelector('.rest-pill')).toBeNull();
    expect(notch.getAttribute('aria-label')).toBe('Show rest timer, 0:48 left');
    expect(notch.querySelector('[role="timer"]')?.textContent).toBe('0:48');
    expect(document.activeElement).toBe(notch);
    await act(async () => notch.click());
    expect(container.querySelector('.rest-pill')).not.toBeNull();
    expect(document.activeElement).toBe(button('Pause workout and rest timer'));
  });

  it('says a hidden paused rest is paused', async () => {
    await render({ restHidden: true, paused: true });
    expect(button('Show paused rest timer, 0:45 left')).not.toBeNull();
  });

  it('keeps a notch that pauses or resumes the workout when no rest is running', async () => {
    const handlers = await render({ restSeconds: 0 });
    const notch = container.querySelector<HTMLButtonElement>('.rest-notch.is-idle')!;
    expect(notch.getAttribute('aria-label')).toBe('Pause workout');
    expect(container.querySelector('[role="timer"]')).toBeNull();
    await act(async () => notch.click());
    expect(handlers.onTogglePause).toHaveBeenCalledTimes(1);
    expect(handlers.onShow).not.toHaveBeenCalled();
    await render({ restSeconds: 0, paused: true });
    expect(button('Resume workout')?.classList.contains('is-paused')).toBe(true);
  });
});
