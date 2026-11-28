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
  compact = false,
}: {
  initial?: WorkoutReactions;
  ownWorkout?: boolean;
  compact?: boolean;
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
      compact={compact}
    />
  );
}

function button(label: string) {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

/** An emoji in the open reaction sheet, by its Unicode name. */
function emoji(name: string) {
  return document.querySelector<HTMLButtonElement>(
    `.emoji-reaction-sheet button[aria-label="${name}"]`,
  )!;
}

const sheet = () => document.querySelector('.emoji-reaction-sheet');

/** Opens the emoji sheet from a React button, waiting for it to load. */
async function openPicker(label = 'React to Upper body') {
  await act(async () => button(label).click());
  await vi.waitFor(() => expect(sheet()).not.toBeNull());
}

async function search(text: string) {
  const input = document.querySelector<HTMLInputElement>('.emoji-reaction-sheet input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
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
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  document.documentElement.removeAttribute('data-reduce-motion');
});

it.each([false, true])(
  'glides the real layout box when panels open and switch (contents: %s)',
  async (contents) => {
    vi.spyOn(api.sharing, 'comments').mockResolvedValue({ items: [], total: 0, next_offset: null });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.querySelector('.workout-discussion-thread:not([hidden])') ? 240 : 44;
    });
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
    Object.assign(HTMLElement.prototype, { animate });
    const computed = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const style = computed(element);
      if (contents && element.classList.contains('workout-discussion')) {
        Object.defineProperty(style, 'display', { value: 'contents' });
      }
      return style;
    });
    await act(async () => root.render(<Harness />));
    await act(async () => button('0 comments on Upper body').click());
    const layout = contents ? host : host.querySelector('.workout-discussion');
    expect(animate.mock.contexts[0]).toBe(layout);
    expect(animate.mock.calls[0]).toEqual([
      [{ height: '44px' }, { height: '240px' }],
      expect.objectContaining({ duration: 340 }),
    ]);
    // Reacting swaps the thread for the emoji sheet, which opens over the page.
    await openPicker();
    expect(animate).toHaveBeenLastCalledWith(
      [{ height: '240px' }, { height: '44px' }],
      expect.anything(),
    );

    document.documentElement.setAttribute('data-reduce-motion', '');
    await act(async () => button('Close React to Upper body').click());
    expect(sheet()).toBeNull();
    animate.mockClear();
    await act(async () => button('0 comments on Upper body').click());
    expect(animate).not.toHaveBeenCalled();
  },
);

it('shows a smiley-plus and unselected counts before reacting, with no default choice', async () => {
  const react = vi.spyOn(api.sharing, 'react');
  await act(async () => root.render(<Harness />));
  expect(button('React to Upper body').querySelector('svg')).not.toBeNull();
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(host.querySelector('.is-yours')).toBeNull();
  const comments = button('0 comments on Upper body');
  // No comments yet: the icon alone, with the count kept in its label.
  expect(comments.textContent).toBe('');
  expect(comments.querySelector('svg')).not.toBeNull();
  await openPicker();
  expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
  expect(document.querySelector('.emoji-reaction-remove')).toBeNull();
  expect(host.querySelector('.is-yours')).toBeNull();
  expect(react).not.toHaveBeenCalled();
});

it('retargets an opening card from its current height when comments finish loading', async () => {
  let loaded!: (value: { items: []; total: number; next_offset: null }) => void;
  vi.spyOn(api.sharing, 'comments').mockReturnValue(new Promise((resolve) => (loaded = resolve)));
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.querySelector('.workout-discussion-thread:not([hidden])')) return 44;
    return this.querySelector('[role="status"]') ? 240 : 150;
  });
  const running = new Map<HTMLElement, { id: string; playState: string; cancel: () => void }>();
  const animate = vi.fn(function (this: HTMLElement) {
    const animation = {
      id: 'height',
      playState: 'running',
      cancel: vi.fn(() => {
        animation.playState = 'idle';
      }),
    };
    running.set(this, animation);
    return animation;
  });
  Object.assign(HTMLElement.prototype, {
    animate,
    getAnimations(this: HTMLElement) {
      const animation = running.get(this);
      return animation?.playState === 'running' ? [animation] : [];
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 80,
  } as DOMRect);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => button('0 comments on Upper body').click());
    const initial = running.get(host.querySelector('.workout-discussion')!)!;
    expect(animate).toHaveBeenCalledWith(
      [{ height: '44px' }, { height: '240px' }],
      expect.anything(),
    );
    await act(async () => loaded({ items: [], total: 0, next_offset: null }));
    expect(initial.cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenLastCalledWith(
      [{ height: '80px' }, { height: '150px' }],
      expect.anything(),
    );
  } finally {
    delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
  }
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
  await openPicker();
  await act(async () => emoji('thumbs up').click());
  expect(react).toHaveBeenLastCalledWith('w1', 'like');
  expect(sheet()).toBeNull();
  expect(host.querySelector('.is-yours')?.textContent).toBe('👍 3');
  expect(host.querySelectorAll('.is-yours')).toHaveLength(1);
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(host.querySelectorAll('.workout-discussion-actions span[aria-hidden]')).toHaveLength(2);
  expect(button('React to Upper body')).toBeNull();

  const mine = button('Your reaction to Upper body: Like. Change reaction');
  expect(document.activeElement).toBe(mine);
  await openPicker('Your reaction to Upper body: Like. Change reaction');
  expect(emoji('thumbs up').getAttribute('aria-pressed')).toBe('true');
  await act(async () => emoji('red heart').click());
  expect(react).toHaveBeenLastCalledWith('w1', 'love');
  expect(host.querySelector('.is-yours')?.textContent).toBe('❤️ 2');
  expect(host.querySelectorAll('.is-yours')).toHaveLength(1);
  expect(button('View 2 Like reactions on Upper body').closest('.is-yours')).toBeNull();

  await openPicker('Your reaction to Upper body: Love. Change reaction');
  // Choosing your reaction again takes it away, as does the Remove button.
  expect(document.querySelector('.emoji-reaction-remove')?.textContent).toBe('❤️ Remove reaction');
  await act(async () => emoji('red heart').click());
  expect(remove).toHaveBeenCalledWith('w1');
  expect(host.querySelector('.is-yours')).toBeNull();
  expect(button('React to Upper body').querySelector('svg')).not.toBeNull();
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(document.activeElement).toBe(button('React to Upper body'));
});

it('removes your reaction from the sheet’s Remove button', async () => {
  const remove = vi.spyOn(api.sharing, 'removeReaction').mockResolvedValue(others);
  await act(async () =>
    root.render(
      <Harness
        initial={{
          counts: [
            { reaction: 'like', count: 2 },
            { reaction: '🫡', count: 1 },
          ],
          yours: '🫡',
        }}
      />,
    ),
  );
  await openPicker('Your reaction to Upper body: 🫡. Change reaction');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.emoji-reaction-remove')!.click(),
  );
  expect(remove).toHaveBeenCalledWith('w1');
  expect(sheet()).toBeNull();
  expect(host.querySelector('.is-yours')).toBeNull();
});

it('keeps the default control and counts when saving fails, and permits retry', async () => {
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ counts: [{ reaction: 'fire', count: 1 }], yours: 'fire' });
  await act(async () => root.render(<Harness initial={{ counts: [], yours: null }} />));
  await openPicker();
  await act(async () => emoji('fire').click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Connection lost');
  expect(host.querySelector('.is-yours')).toBeNull();
  expect(button('React to Upper body')).not.toBeNull();
  await act(async () => emoji('fire').click());
  expect(react).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.is-yours')?.textContent).toBe('🔥 1');
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('grays out an offline reaction and sends it when the connection returns', async () => {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValue({ counts: [{ reaction: 'fire', count: 1 }], yours: 'fire' });
  await act(async () => root.render(<Harness initial={{ counts: [], yours: null }} />));
  await openPicker();
  await act(async () => emoji('fire').click());
  expect(react).not.toHaveBeenCalled();
  const waiting = button("Fire reaction to Upper body sends when you're back online");
  expect(waiting.disabled).toBe(true);
  expect(waiting.classList.contains('is-pending')).toBe(true);
  expect(waiting.textContent).toBe('🔥');
  expect(sheet()).toBeNull();
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
    // The sheet loads on first use; fake timers need a nudge for it to arrive.
    for (let tries = 0; !sheet() && tries < 50; tries += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(10));
    }
    await act(async () => emoji('thumbs up').click());
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('.is-pending')?.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(react).toHaveBeenCalledTimes(3);
    expect(host.querySelector('.is-pending')).toBeNull();
    expect(host.querySelector('.is-yours')?.textContent).toBe('👍 1');
  } finally {
    vi.useRealTimers();
  }
});

it('keeps comments open while tapping or scrolling elsewhere, until the button or Escape closes them', async () => {
  vi.spyOn(api.sharing, 'comments').mockResolvedValue({ items: [], total: 0, next_offset: null });
  await act(async () => root.render(<Harness />));
  const comments = button('0 comments on Upper body');
  const thread = () => host.querySelector('.workout-discussion-thread');

  await act(async () => comments.click());
  const draft = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Comment"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      draft,
      'Strong session',
    );
    draft.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await act(async () => window.dispatchEvent(new Event('scroll')));
  expect(comments.getAttribute('aria-expanded')).toBe('true');
  expect(thread()?.hasAttribute('hidden')).toBe(false);
  expect(draft.value).toBe('Strong session');

  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(thread()?.hasAttribute('hidden')).toBe(true);
  expect(document.activeElement).toBe(comments);

  await act(async () => comments.click());
  expect(thread()?.hasAttribute('hidden')).toBe(false);
  expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Strong session');
  await act(async () => comments.click());
  expect(thread()?.hasAttribute('hidden')).toBe(true);
});

it('closes the emoji sheet without reacting', async () => {
  document.documentElement.setAttribute('data-reduce-motion', '');
  const react = vi.spyOn(api.sharing, 'react');
  await act(async () => root.render(<Harness />));
  await openPicker();
  await act(async () => button('Close React to Upper body').click());
  expect(sheet()).toBeNull();
  expect(button('React to Upper body').getAttribute('aria-expanded')).toBe('false');
  expect(react).not.toHaveBeenCalled();
});

it('reacts with any emoji found by name, and shows emojis others chose', async () => {
  const react = vi.spyOn(api.sharing, 'react').mockResolvedValue({
    counts: [
      { reaction: 'like', count: 2 },
      { reaction: '🫡', count: 2 },
    ],
    yours: '🫡',
  });
  await act(async () =>
    root.render(
      <Harness
        initial={{
          counts: [
            { reaction: 'like', count: 2 },
            { reaction: '🫡', count: 1 },
          ],
          yours: null,
        }}
      />,
    ),
  );
  expect(button('View 1 🫡 reaction on Upper body').textContent).toBe('🫡 1');
  await openPicker();
  await search('salut');
  expect(document.querySelector('.emoji-reaction-tabs')).toBeNull();
  await act(async () => emoji('saluting face').click());
  expect(react).toHaveBeenCalledWith('w1', '🫡');
  expect(host.querySelector('.is-yours')?.textContent).toBe('🫡 2');
  expect(button('Your reaction to Upper body: 🫡. Change reaction').textContent).toBe('🫡');
});

it('reacts with an emoji typed from the keyboard, such as one with a skin tone', async () => {
  const react = vi
    .spyOn(api.sharing, 'react')
    .mockResolvedValue({ counts: [{ reaction: '👍🏽', count: 1 }], yours: '👍🏽' });
  await act(async () => root.render(<Harness initial={{ counts: [], yours: null }} />));
  await openPicker();
  await search('👍🏽');
  await act(async () => emoji('👍🏽').click());
  expect(react).toHaveBeenCalledWith('w1', '👍🏽');
  await openPicker('Your reaction to Upper body: 👍🏽. Change reaction');
  await search('nothing like this');
  expect(document.querySelector('.emoji-reaction-empty')?.textContent).toBe('No emoji found');
});

it('shows counts without an add button or personal highlight on your own workout', async () => {
  await act(async () => root.render(<Harness ownWorkout />));
  expect(host.querySelectorAll('.discussion-reaction-summary')).toHaveLength(2);
  expect(host.querySelector('.friend-react-button')).toBeNull();
  expect(host.querySelector('.is-yours')).toBeNull();
});

it('stacks only the two most common emojis beside the total in a card header', async () => {
  const counts: WorkoutReactions['counts'] = [
    { reaction: 'like', count: 1 },
    { reaction: 'fire', count: 3 },
    { reaction: 'strong', count: 2 },
    { reaction: 'clap', count: 1 },
  ];
  await act(async () =>
    root.render(<Harness ownWorkout compact initial={{ counts, yours: null }} />),
  );
  const total = button('View 7 reactions on Upper body');
  expect(total.querySelector('.discussion-reaction-emojis')?.textContent).toBe('🔥💪');
  expect(total.textContent).toBe('🔥💪 7');
});

it('opens the people list from your combined count without opening the picker', async () => {
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
  expect(sheet()).toBeNull();
  expect(host.querySelectorAll('.is-yours')).toHaveLength(1);
});
