// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupDialog } from './PopupDialog';

let container: HTMLDivElement;
let root: Root;

function Harness({ autoFocusField = false }: { autoFocusField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <PopupDialog title="Log weigh-in" onClose={() => setOpen(false)}>
          <label>
            Date
            <input type="date" />
          </label>
          <label>
            Weight
            <input aria-label="Weight" autoFocus={autoFocusField} />
          </label>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </PopupDialog>
      )}
    </>
  );
}

const opener = () =>
  Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open')!;

async function open(autoFocusField: boolean, input: 'pointer' | 'keyboard') {
  await act(async () => root.render(<Harness autoFocusField={autoFocusField} />));
  opener().focus();
  document.dispatchEvent(
    input === 'pointer'
      ? new Event('pointerdown', { bubbles: true })
      : new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await act(async () => opener().click());
  return document.querySelector('dialog')!;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Like a browser, showModal() opens the dialog and focuses its first control.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('button, input')?.focus();
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('PopupDialog focus', () => {
  it('starts on the field marked autoFocus instead of the close button', async () => {
    const dialog = await open(true, 'pointer');
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Weight"]'));
  });

  it('starts on the dialog itself after a tap, so the close button shows no focus ring', async () => {
    const dialog = await open(false, 'pointer');
    expect(document.activeElement).toBe(dialog);
  });

  it('keeps the close button first when opened from the keyboard', async () => {
    const dialog = await open(false, 'keyboard');
    expect(document.activeElement).toBe(dialog.querySelector('.popup-dialog-close'));
  });

  it('gives focus back to the control that opened it when it closes', async () => {
    const dialog = await open(true, 'pointer');
    const cancel = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel',
    )!;
    await act(async () => cancel.click());
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('returns to a tapped control even when the browser did not focus it, as in Safari', async () => {
    await act(async () => root.render(<Harness />));
    (document.activeElement as HTMLElement | null)?.blur();
    opener().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await act(async () => opener().click());
    const cancel = Array.from(document.querySelectorAll('dialog button')).find(
      (button) => button.textContent === 'Cancel',
    ) as HTMLButtonElement;
    await act(async () => cancel.click());
    expect(document.activeElement).toBe(opener());
  });

  it('hands focus back without a ring after a tap, until a key is pressed', async () => {
    const dialog = await open(false, 'pointer');
    const cancel = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel',
    )!;
    await act(async () => cancel.click());
    expect(document.activeElement).toBe(opener());
    expect(opener().hasAttribute('data-quiet-focus')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(opener().hasAttribute('data-quiet-focus')).toBe(false);
  });

  it('drops the quiet mark when the control loses focus', async () => {
    const dialog = await open(false, 'pointer');
    const cancel = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel',
    )!;
    await act(async () => cancel.click());
    opener().blur();
    expect(opener().hasAttribute('data-quiet-focus')).toBe(false);
  });

  it('keeps the ring when the dialog was used from the keyboard', async () => {
    const dialog = await open(false, 'keyboard');
    const cancel = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel',
    )!;
    await act(async () => cancel.click());
    expect(document.activeElement).toBe(opener());
    expect(opener().hasAttribute('data-quiet-focus')).toBe(false);
  });

  it('leaves focus alone when something else took it while closing', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    const dialog = await open(false, 'keyboard');
    const cancel = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel',
    )!;
    elsewhere.focus();
    await act(async () => cancel.click());
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});
