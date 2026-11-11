// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { LAST_USER_KEY } from './deviceAccount';
import { clearPendingReactions, PENDING_REACTIONS_KEY } from './pendingReactions';
import type { WorkoutReactions } from './types';
import { WorkoutReactionControl } from './WorkoutReactionControl';

let root: Root;
let host: HTMLDivElement;
const others: WorkoutReactions = {
  counts: [
    { reaction: 'like', count: 2 },
    { reaction: 'love', count: 1 },
  ],
  yours: null,
};

function Harness({
  initial = others,
  ownWorkout = false,
}: {
  initial?: WorkoutReactions;
  ownWorkout?: boolean;
}) {
  const [reactions, setReactions] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <WorkoutReactionControl
      workoutId="w1"
      subject="Upper body"
      reactions={reactions}
      open={open}
      onOpenChange={setOpen}
      onChange={setReactions}
      ownWorkout={ownWorkout}
    />
  );
}

function button(label: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: 'A', display_name: 'Sample A' }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearPendingReactions(localStorage);
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows a smiley-plus and unselected counts before reacting, with no default choice', async () => {
  const react = vi.spyOn(api.sharing, 'react');
  await act(async () => root.render(<Harness />));
  expect(button('React to Upper body').querySelector('svg')).not.toBeNull();
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(host.querySelector('.is-yours')).toBeNull();
  const comments = button('0 comments on Upper body');
  expect(comments.textContent).toBe('0');
  expect(comments.querySelector('svg')).not.toBeNull();
  await act(async () => button('React to Upper body').click());
  expect(host.querySelector('[aria-pressed="true"]')).toBeNull();
  expect(host.querySelector('.is-yours')).toBeNull();
  expect(react).not.toHaveBeenCalled();
});

it('combines matching reactions, moves only your highlight when changing, and restores the smiley on removal', async () => {
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValueOnce({
      counts: [
        { reaction: 'like', count: 3 },
        { reaction: 'love', count: 1 },
      ],
      yours: 'like',
    })
    .mockResolvedValueOnce({
      counts: [
        { reaction: 'like', count: 2 },
        { reaction: 'love', count: 2 },
      ],
      yours: 'love',
    });
  const remove = vi.spyOn(api.sharing, 'removeReaction').mockResolvedValue(others);
  await act(async () => root.render(<Harness />));
  await act(async () => button('React to Upper body').click());
  await act(async () => button('Like').click());
  expect(react).toHaveBeenLastCalledWith('w1', 'like');
  expect(host.querySelector('.is-yours')?.textContent).toBe('👍 3');
  expect(host.querySelectorAll('.is-yours')).toHaveLength(1);
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(host.querySelectorAll('.workout-discussion-actions span[aria-hidden]')).toHaveLength(2);
  expect(button('React to Upper body')).toBeNull();

  const mine = button('Your reaction to Upper body: Like. Change reaction');
  expect(document.activeElement).toBe(mine);
  await act(async () => mine.click());
  expect(button('Like').getAttribute('aria-pressed')).toBe('true');
  await act(async () => button('Love').click());
  expect(react).toHaveBeenLastCalledWith('w1', 'love');
  expect(host.querySelector('.is-yours')?.textContent).toBe('❤️ 2');
  expect(host.querySelectorAll('.is-yours')).toHaveLength(1);
  expect(button('View 2 Like reactions on Upper body').closest('.is-yours')).toBeNull();

  await act(async () => button('Your reaction to Upper body: Love. Change reaction').click());
  await act(async () => button('Love').click());
  expect(remove).toHaveBeenCalledWith('w1');
  expect(host.querySelector('.is-yours')).toBeNull();
  expect(button('React to Upper body').querySelector('svg')).not.toBeNull();
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(document.activeElement).toBe(button('React to Upper body'));
});

it('keeps the default control and counts when saving fails, and permits retry', async () => {
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ counts: [{ reaction: 'fire', count: 1 }], yours: 'fire' });
  await act(async () => root.render(<Harness initial={{ counts: [], yours: null }} />));
  await act(async () => button('React to Upper body').click());
  await act(async () => button('Fire').click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Connection lost');
  expect(host.querySelector('.is-yours')).toBeNull();
  expect(button('React to Upper body')).not.toBeNull();
  await act(async () => button('Fire').click());
  expect(react).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.is-yours')?.textContent).toBe('🔥 1');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('grays out an offline reaction and sends it when the connection returns', async () => {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValue({ counts: [{ reaction: 'fire', count: 1 }], yours: 'fire' });
  await act(async () => root.render(<Harness initial={{ counts: [], yours: null }} />));
  await act(async () => button('React to Upper body').click());
  await act(async () => button('Fire').click());
  expect(react).not.toHaveBeenCalled();
  const waiting = button("Fire reaction to Upper body sends when you're back online");
  expect(waiting.disabled).toBe(true);
  expect(waiting.classList.contains('is-pending')).toBe(true);
  expect(waiting.textContent).toBe('🔥');
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  expect(JSON.parse(localStorage.getItem(PENDING_REACTIONS_KEY)!)).toEqual({
    owner: 'A',
    items: { w1: 'fire' },
  });

  onLine.mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(react).toHaveBeenCalledWith('w1', 'fire');
  expect(host.querySelector('.is-pending')).toBeNull();
  expect(host.querySelector('.is-yours')?.textContent).toBe('🔥 1');
  expect(localStorage.getItem(PENDING_REACTIONS_KEY)).toBeNull();
});

it('queues a reaction when the server cannot be reached, then retries', async () => {
  vi.useFakeTimers();
  try {
    const react = vi
      .spyOn(api.sharing, 'react')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ counts: [{ reaction: 'like', count: 1 }], yours: 'like' });
    await act(async () => root.render(<Harness initial={{ counts: [], yours: null }} />));
    await act(async () => button('React to Upper body').click());
    await act(async () => button('Like').click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('.is-pending')?.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(react).toHaveBeenCalledTimes(3);
    expect(host.querySelector('.is-pending')).toBeNull();
    expect(host.querySelector('.is-yours')?.textContent).toBe('👍 1');
  } finally {
    vi.useRealTimers();
  }
});

it('shows counts without an add button or personal highlight on your own workout', async () => {
  await act(async () => root.render(<Harness ownWorkout />));
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(host.querySelector('.friend-react-button')).toBeNull();
  expect(host.querySelector('.is-yours')).toBeNull();
});

it('opens the people list from your combined count without opening the picker', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const people = vi.spyOn(api.sharing, 'reactionPeople').mockResolvedValue({
    items: [
      { id: 'sample', display_name: 'Taylor Sample', profile_photo_url: null, reaction: 'like' },
    ],
    total: 1,
    next_offset: null,
  });
  await act(async () =>
    root.render(
      <Harness
        initial={{
          counts: [{ reaction: 'like', count: 1 }],
          yours: 'like',
        }}
      />,
    ),
  );
  await act(async () => button('View 1 Like reaction on Upper body').click());
  expect(people).toHaveBeenCalledExactlyOnceWith('w1');
  expect(document.querySelector('dialog[open]')?.textContent).toContain('Taylor Sample');
  expect(host.querySelector('.friend-react-picker')).toBeNull();
  expect(host.querySelectorAll('.is-yours')).toHaveLength(1);
});
