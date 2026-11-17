// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { PeopleSearch } from './SharedProfiles';
import type { SharedProfileSummary } from './types';

const ada: SharedProfileSummary = {
  id: 'd7131000-7937-40be-b8ee-8b02800f5a36',
  display_name: 'Ada Lifter',
  profile_photo_url: null,
  member_since: '2026-10-01T12:00:00Z',
  visibility: 'public',
  is_you: false,
  friend_status: 'none',
  can_view: true,
  workout_count: 1,
  recent_workout_count: 1,
  last_workout_date: '2026-10-17',
  shares: null,
};
let root: Root;
let container: HTMLDivElement;
const open = vi.fn();
const changed = vi.fn();
async function type(value: string) {
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit(value: string) {
  await type(value);
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api.sharing, 'profiles').mockResolvedValue([ada]);
  vi.spyOn(api.sharing, 'addFriend').mockResolvedValue({ status: 'outgoing' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <PeopleSearch active refreshKey="0" onOpenProfile={open} onFriendChanged={changed} />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  open.mockClear();
  changed.mockClear();
});
describe('People search', () => {
  it('waits for a search, trims the query and supports opening and adding a result', async () => {
    expect(api.sharing.profiles).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Ada Lifter');
    await submit('  Ada  ');
    expect(api.sharing.profiles).toHaveBeenLastCalledWith('Ada');
    expect(container.textContent).toContain('1 account found');
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open Ada Lifter\'s profile"]')!
        .click(),
    );
    expect(open).toHaveBeenCalledWith(ada);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Add friend: Ada Lifter"]')!.click(),
    );
    expect(api.sharing.addFriend).toHaveBeenCalledWith(ada.id);
    expect(changed).toHaveBeenCalled();
  });
  it('accepts requests, cancels your own and labels existing friends', async () => {
    const accept = vi.spyOn(api.sharing, 'acceptFriend').mockResolvedValue({ status: 'friends' });
    const remove = vi.spyOn(api.sharing, 'removeFriend').mockResolvedValue(undefined);
    vi.mocked(api.sharing.profiles).mockResolvedValue([
      { ...ada, friend_status: 'incoming' },
      { ...ada, id: 'grace', display_name: 'Grace Lifter', friend_status: 'outgoing' },
      { ...ada, id: 'lin', display_name: 'Lin Lifter', friend_status: 'friends' },
    ]);
    await submit('Lifter');
    expect(container.textContent).toContain('Sent you a friend request');
    expect(container.textContent).toContain('Friend request sent');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Accept: Ada Lifter"]')!.click(),
    );
    expect(accept).toHaveBeenCalledWith(ada.id);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Cancel request: Grace Lifter"]')!
        .click(),
    );
    expect(remove).toHaveBeenCalledWith('grace');
    expect(changed).toHaveBeenCalledTimes(2);
    const friend = [...container.querySelectorAll('li')].find((item) =>
      item.textContent?.includes('Lin Lifter'),
    )!;
    expect(friend.querySelector('.friend-status-label')?.textContent?.trim()).toBe('Friends');
    expect(friend.querySelector('.shared-connection-actions button')).toBeNull();
  });
  it('ignores stale search responses and clears results without listing all accounts', async () => {
    let resolveOld!: (profiles: SharedProfileSummary[]) => void;
    vi.mocked(api.sharing.profiles).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    await submit('old');
    await submit(ada.id);
    expect(api.sharing.profiles).toHaveBeenLastCalledWith(ada.id);
    await act(async () => resolveOld([{ ...ada, display_name: 'Stale Result' }]));
    expect(container.textContent).toContain('Ada Lifter');
    expect(container.textContent).not.toContain('Stale Result');
    await type('');
    expect(container.textContent).not.toContain('Ada Lifter');
    expect(api.sharing.profiles).toHaveBeenCalledTimes(2);
  });
  it('offers retry after failure and explains an empty result', async () => {
    vi.mocked(api.sharing.profiles)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    await submit('missing');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    )!;
    await act(async () => retry.click());
    expect(container.textContent).toContain('No shared accounts found');
    expect(api.sharing.profiles).toHaveBeenLastCalledWith('missing');
  });
});
