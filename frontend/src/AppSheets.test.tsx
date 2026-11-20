// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupDialog } from './PopupDialog';
import { SupersetPicker } from './SupersetPicker';
import type { WorkoutDraftMovement } from './workoutMovements';

let host: HTMLDivElement;
let root: Root;
let clock = 0;

/** A slow touch drag from `from` to `to` (px) starting on `target`. */
async function drag(target: Element, from: number, to: number) {
  for (const [type, y] of [
    ['touchstart', from],
    ['touchmove', (from + to) / 2],
    ['touchmove', to],
    ['touchend', to],
  ] as const) {
    clock += 200;
    const point = { identifier: 1, clientX: 180, clientY: y };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { touches: type === 'touchend' ? [] : [point], changedTouches: [point] });
    await act(async () => {
      target.dispatchEvent(event);
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
  document.documentElement.setAttribute('data-reduce-motion', '');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tall sheets', () => {
  it('drag only from the header, so their list can scroll from the top', async () => {
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        <PopupDialog variant="sheet" size="tall" title="Select exercise" onClose={onClose}>
          <div className="list">
            <p>Back Squat</p>
          </div>
        </PopupDialog>,
      ),
    );
    const dialog = document.querySelector('dialog')!;
    await drag(dialog.querySelector('.list p')!, 300, 600);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.classList).not.toContain('sheet-dragging');
    await drag(dialog.querySelector('header')!, 100, 400);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('other sheets still drag from content at its top', async () => {
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        <PopupDialog variant="sheet" title="Sessions" onClose={onClose}>
          <p className="row">Back Squat</p>
        </PopupDialog>,
      ),
    );
    await drag(document.querySelector('dialog .row')!, 300, 600);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('superset picker', () => {
  const movement = (key: string, name: string, supersetKey: string | null = null) =>
    ({
      key,
      exercise: { id: key, name },
      supersetKey,
      sets: [],
    }) as unknown as WorkoutDraftMovement;

  it('is a sheet with Remove on the edge and the primary last', async () => {
    const onSave = vi.fn();
    await act(async () =>
      root.render(
        <SupersetPicker
          movementKey="squat"
          movements={[
            movement('squat', 'Back Squat', 'group'),
            movement('rdl', 'Romanian Deadlift', 'group'),
            movement('press', 'Leg Press'),
          ]}
          onClose={vi.fn()}
          onSave={onSave}
          onRemove={vi.fn()}
        />,
      ),
    );
    const dialog = document.querySelector('dialog')!;
    expect(dialog.classList).toContain('popup-dialog--sheet');
    expect(dialog.querySelector('.sheet-grabber')).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Alternate Back Squat with the exercises you choose.',
    );
    const footer = [...dialog.querySelectorAll<HTMLButtonElement>('.popup-dialog-actions button')];
    expect(footer.map((button) => button.textContent)).toEqual([
      'Remove superset',
      'Cancel',
      'Update superset',
    ]);
    expect(footer[0].className).toContain('popup-tertiary-action is-danger');
    expect(footer[2].className).toContain('popup-primary-action');
    await act(async () => dialog.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    expect(footer[2].disabled).toBe(true);
    await act(async () =>
      [...dialog.querySelectorAll<HTMLInputElement>('input[type=checkbox]')][1].click(),
    );
    await act(async () => footer[2].click());
    expect(onSave).toHaveBeenCalledWith(['press']);
  });
});
