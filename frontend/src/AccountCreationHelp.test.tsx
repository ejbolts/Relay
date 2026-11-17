// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
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
  await act(async () =>
    root.render(
      <AuthScreen
        config={{ registration_open: true, invite_code_required: false }}
        onAuthenticated={vi.fn()}
        initialMode="create-account"
      />,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const buttonNamed = (name: string) =>
  [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name)!;
const click = (element: HTMLElement) => act(async () => element.click());

async function type(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('account creation help', () => {
  it('explains the name and username, including which must be unique', async () => {
    const nameHelp = byLabel('About name');
    const usernameHelp = byLabel('About username');
    const nameText = document.getElementById(nameHelp.getAttribute('aria-controls')!)!;
    const usernameText = document.getElementById(usernameHelp.getAttribute('aria-controls')!)!;
    expect(nameText.hidden).toBe(true);
    expect(usernameText.hidden).toBe(true);

    await click(nameHelp);
    expect(nameHelp.getAttribute('aria-expanded')).toBe('true');
    expect(nameText.hidden).toBe(false);
    expect(nameText.textContent).toBe('Your display name for friends to see on your profile.');
    expect(nameText.querySelector('b')).toBeNull();

    await click(usernameHelp);
    expect(usernameText.textContent).toBe(
      'Used to sign in and shown as your handle so friends can find you. Must be unique.',
    );
    expect(usernameText.querySelector('b')).toBeNull();

    await click(nameHelp);
    expect(nameText.hidden).toBe(true);
  });

  it('previews a sample profile as Sam Sample, then with the names typed', async () => {
    await click(buttonNamed('See a sample profile'));
    const dialog = () => document.querySelector('dialog.sample-profile-dialog');
    expect(dialog()?.querySelector('.sample-profile-name')?.textContent).toBe('Sam Sample');
    expect(dialog()?.querySelector('.sample-profile-username')?.textContent).toBe('@sam.sample');
    expect(dialog()?.querySelector('.profile-avatar')?.textContent).toBe('S');
    await click(buttonNamed('Close'));
    expect(dialog()).toBeNull();

    await type('name', '  Jordan   Reyes ');
    await type('username', 'Jordan.R');
    await click(buttonNamed('See a sample profile'));
    expect(dialog()?.querySelector('.sample-profile-name')?.textContent).toBe('Jordan Reyes');
    expect(dialog()?.querySelector('.sample-profile-username')?.textContent).toBe('@jordan.r');
    expect(dialog()?.querySelector('.profile-avatar')?.textContent).toBe('J');
  });
});
