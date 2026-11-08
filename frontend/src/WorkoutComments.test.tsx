// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { WorkoutComments } from './WorkoutComments';
import {
  unreadNotificationReferences,
  markNotificationSnapshotRead,
} from './notificationReadState';
import type { WorkoutComment, SharingNotifications } from './types';

const alex = { id: 'alex', display_name: 'Alex Sample', profile_photo_url: null };
const jamie = { id: 'jamie', display_name: 'Jamie Sample', profile_photo_url: null };
const rootComment: WorkoutComment = {
  id: 'c1',
  author: alex,
  body: 'Great bench PR!',
  parent_id: null,
  reply_to: null,
  created_at: '2026-10-24T01:00:00Z',
  edited_at: null,
  can_edit: false,
  can_delete: false,
  reactions: { counts: [], yours: null },
};
const replyComment: WorkoutComment = {
  ...rootComment,
  id: 'c2',
  author: jamie,
  body: 'Thanks!',
  parent_id: 'c1',
  reply_to: alex,
  can_edit: true,
  can_delete: true,
};
let root: Root;
let host: HTMLDivElement;

it('sends JSON comment mutations to the server with its required content type', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(replyComment), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await api.sharing.addComment('workout', 'Thanks!', 'c1', 'strong');
  await api.sharing.editComment('c2', 'Updated');
  await api.sharing.reactToComment('c2', 'love');
  for (const [, options] of fetcher.mock.calls) {
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  }
});
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
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === text || b.getAttribute('aria-label') === text,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function type(body: string) {
  await act(async () => {
    const input = host.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, body);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('shows inline replies, opens mention profiles, posts replies, and toggles reactions', async () => {
  vi.spyOn(api.sharing, 'comments').mockResolvedValue({
    items: [rootComment, replyComment],
    total: 2,
    next_offset: null,
  });
  const add = vi.spyOn(api.sharing, 'addComment').mockResolvedValue(replyComment);
  const react = vi.spyOn(api.sharing, 'reactToComment').mockResolvedValue({
    ...rootComment,
    reactions: { counts: [{ reaction: 'run', count: 1 }], yours: 'run' },
  });
  const open = vi.fn();
  const count = vi.fn();
  await act(async () =>
    root.render(<WorkoutComments workoutId="w1" onOpenMember={open} onCountChange={count} />),
  );
  expect(host.querySelector('.comment-replies')?.textContent).toContain('Thanks!');
  await click('@Alex Sample');
  expect(open).toHaveBeenCalledWith(alex);
  await click('Reply');
  expect(document.activeElement).toBe(host.querySelector('textarea'));
  await type('What was your warm-up?');
  await click('Send');
  expect(add).toHaveBeenCalledWith('w1', 'What was your warm-up?', 'c1', null);
  await click('React');
  await click('Run');
  expect(react).toHaveBeenCalledWith('c1', 'run');
  expect(host.querySelector('[aria-label="run, 1"]')?.getAttribute('aria-pressed')).toBe('true');
  await click('run, 1');
  expect(react).toHaveBeenLastCalledWith('c1', null);
});

it('counts Unicode characters, retains failed edits, and retries', async () => {
  vi.spyOn(api.sharing, 'comments').mockResolvedValue({
    items: [replyComment],
    total: 1,
    next_offset: null,
  });
  // Use a root so its own edit control is rendered.
  vi.mocked(api.sharing.comments).mockResolvedValue({
    items: [{ ...replyComment, parent_id: null }],
    total: 1,
    next_offset: null,
  });
  const edit = vi
    .spyOn(api.sharing, 'editComment')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(replyComment);
  await act(async () =>
    root.render(<WorkoutComments workoutId="w1" onOpenMember={vi.fn()} onCountChange={vi.fn()} />),
  );
  await click('Edit');
  await type('💪'.repeat(281));
  expect(Array.from(host.querySelector('textarea')!.value)).toHaveLength(280);
  expect(host.textContent).toContain('280/280');
  await click('Save');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Offline');
  expect(Array.from(host.querySelector('textarea')!.value)).toHaveLength(280);
  await click('Save');
  expect(edit).toHaveBeenCalledTimes(2);
});

it('acknowledges exact reply and reaction notices without reading newer events', () => {
  const items: SharingNotifications = {
    requests: [],
    accepted: [],
    comments: [
      {
        ...alex,
        notice_id: 'n1',
        kind: 'reply',
        since: '2026-10-24T01:00:00Z',
        is_read: false,
        comment_id: 'c1',
        workout_id: 'w1',
        workout_name: 'Bench',
        body: 'Great!',
        reaction: null,
      },
    ],
  };
  const refs = unreadNotificationReferences(items);
  expect(refs).toEqual([{ kind: 'comment', id: 'n1', since: '2026-10-24T01:00:00Z' }]);
  expect(markNotificationSnapshotRead(items, refs).comments![0].is_read).toBe(true);
  expect(
    markNotificationSnapshotRead(
      { ...items, comments: [{ ...items.comments![0], since: '2026-10-24T01:00:01Z' }] },
      refs,
    ).comments![0].is_read,
  ).toBe(false);
});

it('confirms deletion and shows a failed deletion inside the dialog for retry', async () => {
  vi.spyOn(api.sharing, 'comments')
    .mockResolvedValueOnce({
      items: [{ ...replyComment, parent_id: null }],
      total: 1,
      next_offset: null,
    })
    .mockResolvedValue({ items: [], total: 0, next_offset: null });
  const remove = vi
    .spyOn(api.sharing, 'deleteComment')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(undefined);
  await act(async () =>
    root.render(<WorkoutComments workoutId="w1" onOpenMember={vi.fn()} onCountChange={vi.fn()} />),
  );
  await click('Delete');
  expect(remove).not.toHaveBeenCalled();
  const dialog = document.querySelector('dialog')!;
  expect(dialog.textContent).toContain('and its replies');
  const confirm = [...dialog.querySelectorAll('button')].find(
    (button) => button.textContent === 'Delete',
  )!;
  await act(async () => confirm.click());
  expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('Offline');
  await act(async () => confirm.click());
  expect(remove).toHaveBeenCalledTimes(2);
  expect(document.querySelector('dialog')).toBeNull();
  expect(host.querySelector('.workout-comment')).toBeNull();
});
