// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupDialog, SHEET_CLOSE_MS } from './PopupDialog';

let host: HTMLDivElement;
let root: Root;
let clock = 0;
const onClose = vi.fn();
const BOX = { left: 20, top: 200, right: 370, bottom: 600 };

type Props = Partial<ComponentProps<typeof PopupDialog>>;

async function show(props: Props = {}) {
  await act(async () =>
    root.render(
      <PopupDialog title="Log weigh-in" onClose={onClose} {...props}>
        <form>
          <input aria-label="Weight" />
        </form>
      </PopupDialog>,
    ),
  );
  const dialog = document.querySelector('dialog')!;
  dialog.getBoundingClientRect = () =>
    ({ ...BOX, x: BOX.left, y: BOX.top, width: 350, height: 400 }) as DOMRect;
  return dialog;
}

async function press(down: Element, up: Element, start: [number, number], end = start) {
  await act(async () => {
    down.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: start[0], clientY: start[1] }),
    );
    up.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1, clientX: end[0], clientY: end[1] }),
    );
  });
}

async function escape(dialog: HTMLDialogElement) {
  const event = new Event('cancel', { cancelable: true });
  await act(async () => {
    dialog.dispatchEvent(event);
  });
  return event;
}

/** A touch drag on the header, `ms` apart per step. */
async function drag(dialog: HTMLDialogElement, from: number, to: number, ms: number) {
  const header = dialog.querySelector('header')!;
  for (const [type, y] of [
    ['touchstart', from],
    ['touchmove', (from + to) / 2],
    ['touchmove', to],
    ['touchend', to],
  ] as const) {
    clock += ms;
    const point = { identifier: 1, clientX: 180, clientY: y };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      touches: type === 'touchend' ? [] : [point],
      changedTouches: [point],
    });
    await act(async () => {
      header.dispatchEvent(event);
    });
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  onClose.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PopupDialog backdrop', () => {
  it('closes on a tap that starts and ends on the backdrop', async () => {
    const dialog = await show();
    await press(dialog, dialog, [10, 100]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays open on a tap in its own margin or padding', async () => {
    const dialog = await show();
    await press(dialog, dialog, [200, 590]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when a press inside, such as selecting text, ends over the backdrop', async () => {
    const dialog = await show();
    await press(dialog.querySelector('input')!, dialog, [200, 400], [10, 100]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when a press starts on the backdrop and ends inside', async () => {
    const dialog = await show();
    await press(dialog, dialog, [10, 100], [200, 590]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('can ignore the backdrop, as tours and screens do', async () => {
    const dialog = await show({ dismissOnBackdrop: false });
    await press(dialog, dialog, [10, 100]);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PopupDialog Escape, back and busy', () => {
  it('closes on Escape, keeping the browser from closing it first', async () => {
    const dialog = await show();
    expect((await escape(dialog)).defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('steps back on Escape and with the back chevron in a nested view', async () => {
    const onBack = vi.fn();
    const dialog = await show({ onBack });
    await escape(dialog);
    await act(async () => dialog.querySelector<HTMLButtonElement>('.popup-dialog-back')!.click());
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => dialog.querySelector<HTMLButtonElement>('.popup-dialog-close')!.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores ×, Escape and the backdrop while busy', async () => {
    const dialog = await show({ busy: true });
    await act(async () => dialog.querySelector<HTMLButtonElement>('.popup-dialog-close')!.click());
    await escape(dialog);
    await press(dialog, dialog, [10, 100]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes a screen with its back button', async () => {
    const dialog = await show({ variant: 'screen' });
    await press(dialog, dialog, [10, 100]);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => dialog.querySelector<HTMLButtonElement>('.popup-dialog-back')!.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PopupDialog sheet', () => {
  it('slides away before it closes', async () => {
    vi.useFakeTimers();
    const dialog = await show({ variant: 'sheet' });
    await act(async () => dialog.querySelector<HTMLButtonElement>('.popup-dialog-close')!.click());
    expect(dialog.classList).toContain('is-closing');
    expect(onClose).not.toHaveBeenCalled();
    // A second press while it slides does not close it twice.
    await escape(dialog);
    await act(async () => vi.advanceTimersByTime(SHEET_CLOSE_MS));
    expect(onClose).toHaveBeenCalledOnce();
    // The page kept it open, so it comes back.
    expect(dialog.classList).not.toContain('is-closing');
  });

  it('closes straight away when motion is reduced', async () => {
    document.documentElement.setAttribute('data-reduce-motion', '');
    const dialog = await show({ variant: 'sheet' });
    await press(dialog, dialog, [10, 100]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog.classList).not.toContain('is-closing');
  });

  it('slides away from where a long swipe let go', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const dialog = await show({ variant: 'sheet' });
    await drag(dialog, 300, 420, 200);
    expect(dialog.classList).toContain('is-closing');
    expect(dialog.classList).not.toContain('sheet-dragging');
    expect(dialog.style.getPropertyValue('--sheet-offset')).toBe('120px');
    await act(async () => vi.advanceTimersByTime(SHEET_CLOSE_MS));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a short quick flick, and springs back from a short slow pull', async () => {
    const dialog = await show({ variant: 'sheet' });
    await drag(dialog, 300, 340, 200);
    expect(dialog.classList).not.toContain('is-closing');
    expect(dialog.style.getPropertyValue('--sheet-offset')).toBe('');
    await drag(dialog, 300, 340, 16);
    expect(dialog.classList).toContain('is-closing');
  });

  it('springs back when a swiped sheet closes without sliding and the page keeps it', async () => {
    document.documentElement.setAttribute('data-reduce-motion', '');
    const dialog = await show({ variant: 'sheet' });
    await drag(dialog, 300, 420, 200);
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog.style.getPropertyValue('--sheet-offset')).toBe('');
  });

  it('cannot be swiped away while busy', async () => {
    const dialog = await show({ variant: 'sheet', busy: true });
    await drag(dialog, 300, 500, 16);
    expect(dialog.classList).not.toContain('is-closing');
    expect(dialog.style.getPropertyValue('--sheet-offset')).toBe('');
  });
});
