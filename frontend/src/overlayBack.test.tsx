// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeSwipeBack } from './EdgeSwipeBack';
import { closeTopOverlay, topOverlay } from './overlayBack';

vi.mock('./Tips', () => ({ useTips: () => ({ learn: vi.fn() }) }));

function openDialog(onCancel = vi.fn()) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onCancel();
  });
  document.body.append(dialog);
  return { dialog, onCancel };
}

function openSheet(parent: HTMLElement = document.body) {
  const sheet = document.createElement('section');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  parent.append(sheet);
  return sheet;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Back with a sheet or dialog open', () => {
  it('closes the newest dialog through its own cancel handling', () => {
    const older = openDialog();
    const newer = openDialog();
    expect(topOverlay()).toBe(newer.dialog);
    expect(closeTopOverlay()).toBe(true);
    expect(newer.onCancel).toHaveBeenCalledOnce();
    expect(older.onCancel).not.toHaveBeenCalled();
  });

  it('closes a dialog without its own handling the way the browser would', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    dialog.close = vi.fn();
    document.body.append(dialog);
    closeTopOverlay();
    expect(dialog.close).toHaveBeenCalledOnce();
  });

  it('sends Escape to a sheet that closes on Escape', () => {
    const sheet = openSheet();
    const escape = vi.fn();
    window.addEventListener('keydown', escape);
    expect(closeTopOverlay()).toBe(true);
    window.removeEventListener('keydown', escape);
    expect(escape).toHaveBeenCalledOnce();
    expect(escape.mock.calls[0][0]).toMatchObject({ key: 'Escape', target: sheet });
  });

  it('leaves the live workout, and anything hidden, to their own controls', () => {
    const live = document.createElement('div');
    live.className = 'live-workout-sheet';
    openSheet(live);
    document.body.append(live);
    const hidden = document.createElement('div');
    hidden.hidden = true;
    openSheet(hidden);
    document.body.append(hidden);
    expect(topOverlay()).toBeNull();
    expect(closeTopOverlay()).toBe(false);
  });
});

describe('the edge swipe in the installed app', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onBack = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('standalone') }));
    onBack.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  function swipe() {
    const at = (type: string, clientX: number) =>
      window.dispatchEvent(
        Object.assign(new MouseEvent(type, { clientX, clientY: 300, button: 0, bubbles: true }), {
          pointerType: 'mouse',
          pointerId: 1,
          isPrimary: true,
        }),
      );
    at('pointerdown', 4);
    for (const x of [30, 80, 140, 200]) at('pointermove', x);
    at('pointerup', 200);
  }

  it('does nothing on the first screen with nothing open', async () => {
    await act(async () => root.render(<EdgeSwipeBack onBack={onBack} enabled={false} />));
    swipe();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('still closes a sheet open on the first screen', async () => {
    await act(async () => root.render(<EdgeSwipeBack onBack={onBack} enabled={false} />));
    openDialog();
    swipe();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('works above the live workout, which on its own keeps the edge for itself', async () => {
    await act(async () => root.render(<EdgeSwipeBack onBack={onBack} enabled />));
    const live = document.createElement('div');
    live.className = 'live-workout-sheet';
    openSheet(live);
    document.body.append(live);
    swipe();
    expect(onBack).not.toHaveBeenCalled();
    openDialog();
    swipe();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
