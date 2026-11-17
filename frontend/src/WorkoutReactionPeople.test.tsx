// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { WorkoutReactionControl } from './WorkoutReactionControl';

let root: Root;
let host: HTMLDivElement;
const person = {
  id: 'alex',
  display_name: 'Alex Preview',
  profile_photo_url: null,
  reaction: 'love' as const,
};
function Harness({ ownWorkout = true }: { ownWorkout?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <WorkoutReactionControl
      workoutId="w1"
      subject="Leg day"
      ownWorkout={ownWorkout}
      reactions={{ counts: [{ reaction: 'love', count: 1 }], yours: null }}
      open={open}
      onOpenChange={setOpen}
      onChange={vi.fn()}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(api.sharing, 'reactionPeople').mockResolvedValue({
    items: [person],
    total: 1,
    next_offset: null,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function openPeople(ownWorkout = true) {
  await act(async () => root.render(<Harness ownWorkout={ownWorkout} />));
  const trigger = host.querySelector<HTMLButtonElement>('.discussion-reaction-summary')!;
  await act(async () => trigger.click());
  return trigger;
}
async function touch(target: Element, type: string, y: number) {
  const point = { identifier: 1, clientX: 180, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { touches: type === 'touchend' ? [] : [point], changedTouches: [point] });
  await act(async () => target.dispatchEvent(event));
}
it('opens names and each reaction from your workout count, then restores focus on swipe dismissal', async () => {
  const trigger = await openPeople();
  expect(api.sharing.reactionPeople).toHaveBeenCalledExactlyOnceWith('w1');
  const dialog = document.querySelector('dialog[open]')!;
  expect(dialog.textContent).toContain('Alex Preview');
  expect(dialog.querySelector('[aria-label="Love"]')?.textContent).toBe('❤️');
  expect(host.querySelector('.friend-react-button')).toBeNull();
  const header = dialog.querySelector('header')!;
  await touch(header, 'touchstart', 300);
  await touch(header, 'touchmove', 400);
  expect((dialog as HTMLElement).style.getPropertyValue('--sheet-offset')).toBe('100px');
  await touch(header, 'touchend', 400);
  // It slides back down before it unmounts.
  expect(dialog.classList).toContain('is-closing');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('closes straight away when motion is reduced', async () => {
  document.documentElement.setAttribute('data-reduce-motion', '');
  try {
    const trigger = await openPeople();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Close Reactions"]')!.click(),
    );
    expect(document.querySelector('dialog')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(trigger);
  } finally {
    document.documentElement.removeAttribute('data-reduce-motion');
  }
});
it('keeps reacting separate from viewing people on someone else’s workout', async () => {
  await openPeople(false);
  expect(document.querySelector('dialog')?.textContent).toContain('Alex Preview');
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close Reactions"]')!.click(),
  );
  await act(async () => host.querySelector<HTMLButtonElement>('.friend-react-button')!.click());
  expect(host.querySelector('.friend-react-picker')).not.toBeNull();
});
it('retries a failed request and handles a reaction removed before opening', async () => {
  vi.mocked(api.sharing.reactionPeople).mockRejectedValueOnce(new Error('Connection lost'));
  await openPeople();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Connection lost');
  vi.mocked(api.sharing.reactionPeople).mockResolvedValue({
    items: [],
    total: 0,
    next_offset: null,
  });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.reaction-people-sheet .text-link')!.click(),
  );
  expect(document.querySelector('dialog')?.textContent).toContain('No reactions yet.');
});
it('loads additional people without duplicates and keeps existing rows on a page failure', async () => {
  vi.mocked(api.sharing.reactionPeople).mockResolvedValueOnce({
    items: [person],
    total: 2,
    next_offset: 1,
  });
  await openPeople();
  vi.mocked(api.sharing.reactionPeople).mockRejectedValueOnce(new Error('Try again'));
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.reaction-people-sheet .show-more-button')!.click(),
  );
  expect(document.querySelector('dialog')?.textContent).toContain('Alex Preview');
  vi.mocked(api.sharing.reactionPeople).mockResolvedValue({
    items: [person, { ...person, id: 'sam', display_name: 'Sam Preview', reaction: 'fire' }],
    total: 2,
    next_offset: null,
  });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.reaction-people-sheet .show-more-button')!.click(),
  );
  expect(api.sharing.reactionPeople).toHaveBeenLastCalledWith('w1', 1);
  expect(document.querySelectorAll('.reaction-people-list li')).toHaveLength(2);
});
it('loads pages until a highlighted person appears, and opening it yourself drops the highlight', async () => {
  const sam = { ...person, id: 'sam', display_name: 'Sam Preview', reaction: 'fire' as const };
  vi.mocked(api.sharing.reactionPeople)
    .mockResolvedValueOnce({ items: [person], total: 2, next_offset: 1 })
    .mockResolvedValueOnce({ items: [sam], total: 2, next_offset: null });
  function Focused() {
    const [open, setOpen] = useState(false);
    return (
      <WorkoutReactionControl
        workoutId="w1"
        subject="Leg day"
        ownWorkout
        reactions={{ counts: [{ reaction: 'love', count: 2 }], yours: null }}
        open={open}
        focus={{
          workoutId: 'w1',
          workoutName: 'Leg day',
          panel: 'people',
          personId: 'sam',
          key: 1,
        }}
        onOpenChange={setOpen}
        onChange={vi.fn()}
      />
    );
  }
  await act(async () => root.render(<Focused />));
  expect(api.sharing.reactionPeople).toHaveBeenNthCalledWith(2, 'w1', 1);
  const rows = [...document.querySelectorAll('.reaction-people-list li')];
  expect(rows.map((row) => row.classList.contains('is-highlighted'))).toEqual([false, true]);
  expect(document.querySelector('.reaction-people-sheet .show-more-button')).toBeNull();

  document.documentElement.setAttribute('data-reduce-motion', '');
  try {
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Close Reactions"]')!.click(),
    );
    vi.mocked(api.sharing.reactionPeople).mockResolvedValue({
      items: [person, sam],
      total: 2,
      next_offset: null,
    });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.discussion-reaction-summary')!.click(),
    );
    expect(document.querySelectorAll('.reaction-people-list li')).toHaveLength(2);
    expect(document.querySelector('.reaction-people-list li.is-highlighted')).toBeNull();
  } finally {
    document.documentElement.removeAttribute('data-reduce-motion');
  }
});
