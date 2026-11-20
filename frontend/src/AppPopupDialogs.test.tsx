// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarCreateWorkoutDialog } from './CalendarCreateWorkoutDialog';
import { SetEntryConfirmationDialog } from './SetEntryConfirmationDialog';
import { WorkoutNameDialog } from './WorkoutNameDialog';

let host: HTMLDivElement;
let root: Root;
const BOX = { left: 20, top: 200, right: 370, bottom: 600 };

async function show(element: ReactNode) {
  await act(async () => root.render(element));
  const dialog = document.querySelector('dialog')!;
  dialog.getBoundingClientRect = () =>
    ({ ...BOX, x: BOX.left, y: BOX.top, width: 350, height: 400 }) as DOMRect;
  return dialog;
}

/** A tap on the dialog element itself, as a tap in its padding or on the backdrop lands. */
async function tapDialog(dialog: HTMLDialogElement, x: number, y: number) {
  await act(async () => {
    dialog.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    dialog.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1, clientX: x, clientY: y }),
    );
  });
}

const buttons = (dialog: Element) =>
  [...dialog.querySelectorAll<HTMLButtonElement>('.popup-dialog-actions button')].map(
    (button) => button.textContent,
  );

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('Name this workout', () => {
  const props = {
    value: '',
    fallbackName: 'Upper body workout',
    onChange: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
  };

  it('uses the standard header and footer, without the WORKOUT kicker', async () => {
    const dialog = await show(<WorkoutNameDialog {...props} />);
    expect(dialog.classList).toContain('popup-dialog');
    expect(dialog.querySelector('.section-kicker')).toBeNull();
    expect(dialog.querySelector('.popup-dialog-close')?.getAttribute('aria-label')).toBe(
      'Close Name this workout',
    );
    expect(buttons(dialog)).toEqual(['Cancel', 'Save name']);
    expect(document.activeElement).toBe(dialog.querySelector('input'));
    const description = document.getElementById(dialog.getAttribute('aria-describedby')!);
    expect(description?.textContent).toContain('“Upper body workout”');
  });

  it('stays open on a tap in its padding and closes on a backdrop tap', async () => {
    const onCancel = vi.fn();
    const dialog = await show(<WorkoutNameDialog {...props} onCancel={onCancel} />);
    await tapDialog(dialog, 30, 210);
    expect(onCancel).not.toHaveBeenCalled();
    await tapDialog(dialog, 10, 100);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('saves from the footer button, which submits the form', async () => {
    const onSave = vi.fn();
    const dialog = await show(<WorkoutNameDialog {...props} onSave={onSave} />);
    const save = dialog.querySelector<HTMLButtonElement>('.popup-primary-action')!;
    const form = document.getElementById(save.getAttribute('form')!) as HTMLFormElement;
    expect(form.tagName).toBe('FORM');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('unusual set confirmation', () => {
  const warning = {
    title: 'Add high rep set?',
    message: '25 reps is a lot for this exercise.',
    highReps: true,
  };

  it('is a compact alert dialog described by its message, focused on the confirm', async () => {
    const dialog = await show(
      <SetEntryConfirmationDialog
        warning={warning}
        confirmLabel="Add set"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.classList).toContain('popup-dialog--compact');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
      warning.message,
    );
    expect(buttons(dialog)).toEqual(['Go back', 'Add set']);
    expect(document.activeElement).toBe(dialog.querySelector('.confirm-unusual-set'));
  });

  it('passes the checkbox choice on, and Escape goes back', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const dialog = await show(
      <SetEntryConfirmationDialog
        warning={warning}
        confirmLabel="Add set"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await act(async () => dialog.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('.confirm-unusual-set')!.click());
    expect(onConfirm).toHaveBeenCalledWith(true);
    await act(async () => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('create a workout from the calendar', () => {
  it('asks with the standard primary for an empty day', async () => {
    const dialog = await show(
      <CalendarCreateWorkoutDialog
        workoutDate="2026-11-03"
        activeWorkout={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(dialog.querySelector('h2')?.textContent).toBe('Create a new workout?');
    expect(dialog.querySelector('.section-kicker')).toBeNull();
    expect(buttons(dialog)).toEqual(['Cancel', 'Create workout']);
    expect(dialog.querySelector('.popup-primary-action')?.classList).not.toContain('is-danger');
  });

  it('uses a red confirm and starts on Keep when it would discard the live workout', async () => {
    const onConfirm = vi.fn();
    const dialog = await show(
      <CalendarCreateWorkoutDialog
        workoutDate="2026-11-03"
        activeWorkout
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(dialog.classList).toContain('popup-dialog--compact');
    expect(buttons(dialog)).toEqual(['Keep current workout', 'Cancel & create new']);
    const confirm = dialog.querySelector<HTMLButtonElement>('.popup-primary-action')!;
    expect(confirm.classList).toContain('is-danger');
    expect(document.activeElement?.textContent).toBe('Keep current workout');
    await act(async () => confirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
