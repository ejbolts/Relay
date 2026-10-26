// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { SuggestedFriends } from './SharedProfiles';
import type { SharedProfileSummary, SuggestedProfilePage } from './types';

const members: SharedProfileSummary[] = Array.from({ length: 17 }, (_, index) => ({
  id: `person-${index + 1}`,
  display_name: `Person ${index + 1}`,
  profile_photo_url: null,
  member_since: '2026-10-01T12:00:00Z',
  visibility: 'public',
  is_you: false,
  friend_status: 'none',
  can_view: true,
  workout_count: 0,
  recent_workout_count: 0,
  last_workout_date: null,
  shares: null,
}));
let root: Root;
let host: HTMLDivElement;
let available: SharedProfileSummary[];
const open = vi.fn();
const changed = vi.fn();
function result(page = 1): SuggestedProfilePage {
  page = Math.min(page, Math.max(1, Math.ceil(available.length / 8)));
  return {
    profiles: available.slice((page - 1) * 8, page * 8),
    total: available.length,
    page,
    page_size: 8,
  };
}
async function render(active = true, refreshKey = '0') {
  await act(async () =>
    root.render(
      <SuggestedFriends
        active={active}
        refreshKey={refreshKey}
        onOpenProfile={open}
        onFriendChanged={changed}
      />,
    ),
  );
}
function button(label: string) {
  return host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
}
async function click(target: HTMLElement) {
  expect(target).not.toBeNull();
  await act(async () => target.click());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  available = [...members];
  open.mockClear();
  changed.mockClear();
  vi.spyOn(api.sharing, 'suggestions').mockImplementation(async (page) => result(page));
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

it('automatically lists eight suggestions and opens a name without sending a request', async () => {
  const add = vi.spyOn(api.sharing, 'addFriend');
  await render();
  expect(api.sharing.suggestions).toHaveBeenCalledWith(1);
  expect(host.querySelectorAll('li')).toHaveLength(8);
  expect(host.textContent).toContain('1–8 of 17');
  await click(button("Open Person 1's profile"));
  expect(open).toHaveBeenCalledWith(members[0]);
  expect(add).not.toHaveBeenCalled();
});

it('supports next, previous and numbered pages with boundary states and focus', async () => {
  await render();
  expect(button('Previous suggested friends page').disabled).toBe(true);
  await click(button('Next suggested friends page'));
  expect(api.sharing.suggestions).toHaveBeenLastCalledWith(2);
  expect(host.querySelectorAll('li')).toHaveLength(8);
  expect(host.textContent).toContain('9–16 of 17');
  expect(button("Open Person 9's profile")).not.toBeNull();
  expect(document.activeElement).toBe(host.querySelector('h3'));
  await click(button('Suggested friends page 3'));
  expect(host.querySelectorAll('li')).toHaveLength(1);
  expect(button('Next suggested friends page').disabled).toBe(true);
  await click(button('Previous suggested friends page'));
  expect(button('Suggested friends page 2').getAttribute('aria-current')).toBe('page');
});

it('adds separately, refreshes the list and corrects a removed last page', async () => {
  const add = vi.spyOn(api.sharing, 'addFriend').mockImplementation(async (id) => {
    available = available.filter((person) => person.id !== id);
    return { status: 'outgoing' };
  });
  await render();
  await click(button('Suggested friends page 3'));
  await click(button('Add friend: Person 17'));
  expect(add).toHaveBeenCalledWith('person-17');
  expect(changed).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();
  expect(host.textContent).toContain('9–16 of 16');
  expect(host.querySelectorAll('li')).toHaveLength(8);
});

it('keeps a failed request available for retry and does not report a friend change', async () => {
  vi.spyOn(api.sharing, 'addFriend').mockRejectedValue(new Error('offline'));
  await render();
  await click(button('Add friend: Person 1'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('offline');
  expect(button('Add friend: Person 1').disabled).toBe(false);
  expect(changed).not.toHaveBeenCalled();
});

it('offers retry for loading failures and a compact empty state without pagination', async () => {
  vi.mocked(api.sharing.suggestions).mockRejectedValueOnce(new Error('offline'));
  await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  available = [];
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!);
  expect(host.textContent).toContain('No suggested friends right now.');
  expect(host.querySelector('nav')).toBeNull();
});

it('does not fetch while hidden and ignores an older response after a refresh', async () => {
  await render(false);
  expect(api.sharing.suggestions).not.toHaveBeenCalled();
  let resolveOld!: (page: SuggestedProfilePage) => void;
  vi.mocked(api.sharing.suggestions).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await render();
  available = [];
  await render(true, 'changed');
  await act(async () =>
    resolveOld({ profiles: members.slice(0, 8), total: 17, page: 1, page_size: 8 }),
  );
  expect(host.textContent).toContain('No suggested friends right now.');
  expect(host.textContent).not.toContain('Person 1');
  await render(false, 'hidden');
  expect(api.sharing.suggestions).toHaveBeenCalledTimes(2);
});
