// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSessionSettings, AccountSettings } from './AccountSettings';
import { api } from './api';
import { toastText, withToasts } from './toastTestUtils';
import type { User } from './types';
import { UserContext, type UserSession } from './userContext';
import { writeActiveWorkoutDraft } from './workoutDraft';

const user: User = {
  id: 'lifter',
  username: 'lifter',
  display_name: 'Lifter',
  is_admin: false,
  can_upload_videos: true,
  created_at: '2026-10-01T10:00:00Z',
};

let container: HTMLDivElement;
let root: Root;
let session: UserSession;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  session = {
    user,
    updateUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    signOutEverywhere: vi.fn().mockResolvedValue(undefined),
    accountDeleted: vi.fn(),
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function show(children = <AccountSessionSettings />) {
  await act(async () => {
    root.render(
      withToasts(<UserContext.Provider value={session}>{children}</UserContext.Provider>),
    );
  });
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}

describe('signing out', () => {
  it('signs out of this device straight away when nothing is waiting to sync', async () => {
    await show();
    await act(async () => button('Sign out').click());
    expect(session.signOut).toHaveBeenCalledOnce();
    expect(session.signOutEverywhere).not.toHaveBeenCalled();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('asks before signing out everywhere', async () => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.open = false;
    };
    await show();
    await act(async () => button('Sign out everywhere…').click());
    expect(session.signOutEverywhere).not.toHaveBeenCalled();
    expect(document.querySelector('dialog')?.textContent).toContain('Sign out everywhere?');

    await act(async () => button('Cancel').click());
    expect(document.querySelector('dialog')).toBeNull();

    await act(async () => button('Sign out everywhere…').click());
    await act(async () => button('Sign out everywhere').click());
    expect(session.signOutEverywhere).toHaveBeenCalledOnce();
    expect(session.signOut).not.toHaveBeenCalled();
  });

  it('warns before signing out of this device with sets that have not synced', async () => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    writeActiveWorkoutDraft({
      version: 1,
      startedAt: Date.now() - 60_000,
      updatedAt: Date.now(),
      name: 'Sample session',
      workoutDate: '2026-11-19',
      category: 'upper',
      notes: 'Logged offline',
      movements: [],
    });
    await show();
    await act(async () => button('Sign out').click());

    expect(session.signOut).not.toHaveBeenCalled();
    expect(document.querySelector('dialog')?.textContent).toContain(
      'Sets that haven’t synced yet will be deleted from this device.',
    );
    const confirm = document.querySelector<HTMLButtonElement>('dialog .popup-primary-action')!;
    await act(async () => confirm.click());
    expect(session.signOut).toHaveBeenCalledOnce();
  });
});

describe('changing the password', () => {
  it('confirms in a toast that other devices were signed out, and has an eye on each field', async () => {
    vi.spyOn(api, 'changePassword').mockResolvedValue(undefined);
    await show(<AccountSettings />);
    const section = container.querySelector('.account-password')!;
    const toggle = section.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (toggle?.getAttribute('aria-expanded') === 'false') await act(async () => toggle.click());
    const inputs = [...section.querySelectorAll<HTMLInputElement>('input')];
    expect(inputs.map((input) => input.type)).toEqual(['password', 'password', 'password']);
    expect(
      [...section.querySelectorAll('.auth-reveal')].map((eye) => eye.getAttribute('aria-label')),
    ).toEqual(['Show current password', 'Show new password', 'Show confirmed password']);

    for (const [input, value] of [
      [inputs[0], 'current sample password'],
      [inputs[1], 'a new sample password'],
      [inputs[2], 'a new sample password'],
    ] as const) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await act(async () => {
      section
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(toastText()).toBe('Password updated. Other devices were signed out.');
    expect(section.textContent).not.toContain('Password updated');
  });
});
