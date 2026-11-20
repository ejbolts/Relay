// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { AuthScreen } from './AuthScreen';

let container: HTMLDivElement;
let root: Root;

async function render(initialMode: 'sign-in' | 'create-account' = 'sign-in') {
  await act(async () =>
    root.render(
      <AuthScreen
        config={{ registration_open: true, invite_code_required: false }}
        onAuthenticated={vi.fn()}
        initialMode={initialMode}
      />,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const dialog = () => document.querySelector<HTMLDialogElement>('dialog.forgot-password-dialog');
const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name);
const click = (element: HTMLElement) => act(async () => element.click());

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function dialogInput() {
  return dialog()!.querySelector<HTMLInputElement>('input[name="username"]')!;
}

describe('forgot password', () => {
  it('asks the admins for a reset with the username typed so far', async () => {
    const send = vi.spyOn(api.auth, 'requestPasswordReset').mockResolvedValue(undefined);
    await render();
    await type(
      container.querySelector<HTMLInputElement>('input[name="username"]')!,
      ' Sam.Sample ',
    );

    await click(buttonNamed('Forgot password?')!);

    expect(dialog()?.open).toBe(true);
    expect(dialogInput().value).toBe('Sam.Sample');
    await click(buttonNamed('Ask admin to reset')!);

    expect(send).toHaveBeenCalledWith('sam.sample');
    const sent = dialog()!.querySelector('[role="status"]')!;
    expect(sent.textContent).toContain('Request sent for @sam.sample');
    expect(sent.textContent).toContain('Your admin will give you a temporary password.');
    expect(document.activeElement).toBe(buttonNamed('Done'));

    await click(buttonNamed('Done')!);
    expect(dialog()).toBeNull();
  });

  it('needs a username before sending', async () => {
    const send = vi.spyOn(api.auth, 'requestPasswordReset').mockResolvedValue(undefined);
    await render();
    await click(buttonNamed('Forgot password?')!);

    await click(buttonNamed('Ask admin to reset')!);

    expect(send).not.toHaveBeenCalled();
    expect(dialogInput().getAttribute('aria-invalid')).toBe('true');
    expect(dialog()!.textContent).toContain('Enter your username.');
    expect(document.activeElement).toBe(dialogInput());
  });

  it('keeps the form open with the reason when the request fails', async () => {
    vi.spyOn(api.auth, 'requestPasswordReset').mockRejectedValue(
      new ApiError('Too many requests. Try again later.', 'too_many_attempts', 429),
    );
    await render();
    await click(buttonNamed('Forgot password?')!);
    await type(dialogInput(), 'sam.sample');

    await click(buttonNamed('Ask admin to reset')!);

    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe(
      'Too many attempts. Wait a few minutes before trying again.',
    );
    expect(dialog()!.querySelector('[role="status"]')).toBeNull();
    expect(buttonNamed('Ask admin to reset')).toBeDefined();
  });

  it('is only offered on the sign-in form', async () => {
    await render('create-account');
    expect(buttonNamed('Forgot password?')).toBeUndefined();
  });
});

describe('forgot username', () => {
  const usernameDialog = () =>
    document.querySelector<HTMLDialogElement>('dialog.forgot-username-dialog');
  const nameInput = () => usernameDialog()!.querySelector<HTMLInputElement>('input[name="name"]')!;

  it('asks the admins for the username of the account with that name', async () => {
    const send = vi.spyOn(api.auth, 'requestUsernameReminder').mockResolvedValue(undefined);
    await render();
    // What was typed as a username is not a name, so it is not carried over.
    await type(container.querySelector<HTMLInputElement>('input[name="username"]')!, 'sam');

    await click(buttonNamed('Forgot username?')!);

    expect(usernameDialog()?.open).toBe(true);
    expect(dialog()).toBeNull();
    expect(usernameDialog()!.querySelector('label')?.textContent).toBe('Name on your profile');
    expect(nameInput().value).toBe('');
    await type(nameInput(), '  Sam   Sample ');
    await click(buttonNamed('Ask admin')!);

    expect(send).toHaveBeenCalledWith('Sam Sample');
    const sent = usernameDialog()!.querySelector('[role="status"]')!;
    expect(sent.textContent).toContain('Request sent for Sam Sample');
    expect(sent.textContent).toContain('Your admin will tell you your username.');
    expect(document.activeElement).toBe(buttonNamed('Done'));

    await click(buttonNamed('Done')!);
    expect(usernameDialog()).toBeNull();
  });

  it('needs a name before sending', async () => {
    const send = vi.spyOn(api.auth, 'requestUsernameReminder').mockResolvedValue(undefined);
    await render();
    await click(buttonNamed('Forgot username?')!);

    await type(nameInput(), '   ');
    await click(buttonNamed('Ask admin')!);

    expect(send).not.toHaveBeenCalled();
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(usernameDialog()!.textContent).toContain('Enter your name.');
    expect(document.activeElement).toBe(nameInput());

    await type(nameInput(), 'Sam Sample');
    expect(nameInput().getAttribute('aria-invalid')).toBe('false');
    expect(usernameDialog()!.textContent).not.toContain('Enter your name.');
  });

  it('keeps the form open with the reason when the request fails', async () => {
    vi.spyOn(api.auth, 'requestUsernameReminder').mockRejectedValue(
      new ApiError('Too many requests. Try again later.', 'too_many_attempts', 429),
    );
    await render();
    await click(buttonNamed('Forgot username?')!);
    await type(nameInput(), 'Sam Sample');

    await click(buttonNamed('Ask admin')!);

    expect(usernameDialog()!.querySelector('[role="alert"]')?.textContent).toBe(
      'Too many attempts. Wait a few minutes before trying again.',
    );
    expect(usernameDialog()!.querySelector('[role="status"]')).toBeNull();
  });

  it('is only offered on the sign-in form', async () => {
    await render('create-account');
    expect(buttonNamed('Forgot username?')).toBeUndefined();
  });
});
