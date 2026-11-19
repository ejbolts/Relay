// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminScreenView, type AdminScreenViewProps } from './AdminScreen';
import type { AdminUser } from './types';

const base: AdminUser = {
  id: 'owner',
  username: 'owner',
  display_name: 'Owner',
  is_admin: true,
  disabled_at: null,
  must_change_password: false,
  created_at: '2026-10-01T10:00:00Z',
  last_active_at: '2026-10-10T10:00:00Z',
  signed_in_devices: 1,
  workouts: 0,
  photos: 0,
  photo_bytes: 0,
  video_sessions: 0,
};
const users: AdminUser[] = [
  base,
  { ...base, id: 'riley', username: 'riley', display_name: 'Riley Park', is_admin: false },
  {
    ...base,
    id: 'sam',
    username: 'samlifts',
    display_name: 'Sam',
    is_admin: false,
    disabled_at: '2026-10-09T09:00:00Z',
  },
];

let host: HTMLDivElement;
let root: Root;

async function show(overrides: Partial<AdminScreenViewProps> = {}) {
  await act(async () =>
    root.render(
      <AdminScreenView
        currentUserId="owner"
        users={users}
        settings={null}
        status={null}
        limits={null}
        loading={false}
        error={null}
        notice={null}
        savingSetting={false}
        savingLimits={false}
        busyUserId={null}
        temporaryPassword={null}
        onVideoUploadsChange={vi.fn()}
        onSaveLimits={vi.fn()}
        onRegistrationChange={vi.fn()}
        onUserDisabledChange={vi.fn()}
        onResetPassword={vi.fn()}
        onTemporaryPasswordDismiss={vi.fn()}
        onRefresh={vi.fn()}
        {...overrides}
      />,
    ),
  );
}

const names = () =>
  [...host.querySelectorAll('li.admin-user .admin-user-heading strong')].map(
    (strong) => strong.firstChild?.textContent,
  );
const button = (label: string) =>
  [...host.querySelectorAll('button')].find((element) => element.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('admin account search and filters', () => {
  it('finds accounts by name or username', async () => {
    await show();
    const search = host.querySelector<HTMLInputElement>('input[aria-label="Search accounts"]')!;
    const type = async (value: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(search, value);
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await type('park');
    expect(names()).toEqual(['Riley Park']);
    await type('SAMLI');
    expect(names()).toEqual(['Sam']);
    await type('nobody');
    expect(host.textContent).toContain('No accounts match.');
  });

  it('offers only the filters that would find someone, and toggles them', async () => {
    await show();
    expect(button('Disabled')).toBeDefined();
    expect(button('Reset requested')).toBeUndefined();
    await act(async () => button('Disabled').click());
    expect(button('Disabled').getAttribute('aria-pressed')).toBe('true');
    expect(names()).toEqual(['Sam']);
    await act(async () => button('Disabled').click());
    expect(names()).toHaveLength(3);
  });

  it('opens an account row to its details and actions', async () => {
    await show();
    const row = host.querySelector('#admin-user-riley')!;
    const summary = row.querySelector<HTMLButtonElement>('.admin-user-summary')!;
    expect(row.querySelector('.admin-user-details')!.hasAttribute('hidden')).toBe(true);
    await act(async () => summary.click());
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(row.querySelector('.admin-user-details')!.hasAttribute('hidden')).toBe(false);
  });

  it('confirms actions in the top toast instead of at the top of the page', async () => {
    const dismiss = vi.fn();
    await show({ notice: 'Sam is disabled and signed out.', onNoticeDismiss: dismiss });
    const toast = document.body.querySelector('.toast')!;
    expect(toast.textContent).toContain('Sam is disabled and signed out.');
    expect(host.contains(toast)).toBe(false);
    await act(async () => toast.querySelector<HTMLButtonElement>('button')!.click());
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
