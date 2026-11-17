// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CollapsibleSection } from './CollapsibleSection';
import { SettingsHub, type SettingsGroup } from './SettingsHub';
import {
  SettingsNavigationContext,
  useSettingsPageJump,
  type SettingsJump,
  type SettingsGroupId,
} from './settingsNavigation';

let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();

function Harness({ data = false, help = false, active = true, account = true }) {
  const [request, setRequest] = useState<SettingsJump | null>(null);
  return (
    <SettingsNavigationContext.Provider
      value={{
        request,
        navigate: (destination) =>
          setRequest((old) => ({ destination, serial: (old?.serial ?? 0) + 1 })),
      }}
    >
      <Page data={data} help={help} active={active} account={account} />
    </SettingsNavigationContext.Provider>
  );
}

function Page({
  data,
  help,
  active,
  account,
}: {
  data: boolean;
  help: boolean;
  active: boolean;
  account: boolean;
}) {
  useSettingsPageJump('settings', active);
  const [selected, setSelected] = useState<SettingsGroupId | null>(null);
  const groups: SettingsGroup[] = [
    {
      id: 'training',
      icon: 'timer',
      description: 'Training defaults',
      content: (
        <button aria-label="Rest timer" onClick={changed}>
          On
        </button>
      ),
    },
    {
      id: 'appearance',
      icon: 'sun',
      description: 'Theme and motion',
      content: <h2 id="colour-theme-title">App theme</h2>,
    },
    ...(account
      ? [
          {
            id: 'account' as const,
            icon: 'user' as const,
            description: 'Your account',
            content: (
              <CollapsibleSection title="Change password" className="account-password">
                <input autoComplete="current-password" />
              </CollapsibleSection>
            ),
          },
        ]
      : []),
    {
      id: 'data',
      icon: 'link',
      description: 'Import and export',
      content: <h2 id="workout-data-title">Import & export</h2>,
    },
    {
      id: 'help',
      icon: 'heart',
      description: 'Guides',
      content: (
        <h2 id="home-screen-settings-title" data-guide-target="installation">
          Add to Home Screen
        </h2>
      ),
    },
  ];
  return (
    <section data-settings-page="settings">
      <button className="settings-header-back" onClick={() => setSelected(null)}>
        {selected ? 'All settings' : 'Settings'}
      </button>
      <SettingsHub
        active={active}
        selected={selected}
        onSelect={setSelected}
        groups={groups}
        includeAccount={account}
        accountName="Sam Sample"
        onOpenProfile={vi.fn()}
        revealData={data}
        revealHelp={help}
      />
    </section>
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  changed.mockReset();
});

async function click(selector: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
  await act(async () => vi.runAllTimers());
}
async function search(query: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('.settings-search-results button');
}

it('opens focused sections, returns focus to the overview and retains unfinished forms', async () => {
  await act(async () => root.render(<Harness />));
  expect(container.querySelector('.settings-overview')?.hasAttribute('hidden')).toBe(false);
  expect(container.querySelector('.settings-category-copy small')).toBeNull();
  expect(container.querySelector('.settings-overview-hint')).toBeNull();
  expect(container.querySelector('[data-settings-group="account"]')?.hasAttribute('hidden')).toBe(
    true,
  );
  await click('.settings-category-card:nth-child(3)');
  expect(document.activeElement?.textContent).toBe('Account & privacy');
  await click('.account-password .collapsible-toggle');
  const password = container.querySelector<HTMLInputElement>(
    'input[autocomplete="current-password"]',
  )!;
  password.value = 'unfinished sample value';
  await click('.settings-header-back');
  expect(document.activeElement).toBe(
    container.querySelector('.settings-category-card:nth-child(3)'),
  );
  await click('.settings-category-card:first-child');
  expect(container.querySelector('[data-settings-group="account"]')?.hasAttribute('hidden')).toBe(
    true,
  );
  await search('password');
  expect(document.activeElement).toBe(password);
  expect(password.value).toBe('unfinished sample value');
  expect(container.querySelector('[data-settings-group="account"]')?.hasAttribute('hidden')).toBe(
    false,
  );
  expect(changed).not.toHaveBeenCalled();
});

it('reveals and focuses search destinations across hidden groups without activating them', async () => {
  await act(async () => root.render(<Harness />));
  await search('theme');
  expect(document.activeElement?.id).toBe('colour-theme-title');
  await search('rest timer');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Rest timer');
  expect(container.querySelector('[data-settings-group="training"]')?.hasAttribute('hidden')).toBe(
    false,
  );
  expect(changed).not.toHaveBeenCalled();
});

it('reveals import and installation panels for onboarding shortcuts', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => root.render(<Harness data />));
  expect(container.querySelector('[data-settings-group="data"]')?.hasAttribute('hidden')).toBe(
    false,
  );
  await act(async () => root.render(<Harness help />));
  expect(container.querySelector('[data-settings-group="help"]')?.hasAttribute('hidden')).toBe(
    false,
  );
  expect(
    container.querySelector('[data-guide-target="installation"]')?.closest('[hidden]'),
  ).toBeNull();
});

it('omits account navigation and account search when accounts are unavailable', async () => {
  await act(async () => root.render(<Harness account={false} />));
  expect(container.querySelector('.settings-profile-link')).toBeNull();
  expect(container.querySelector('[data-settings-group="account"]')).toBeNull();
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'password',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('.settings-search-results')?.textContent).toContain(
    'No sections found',
  );
});
