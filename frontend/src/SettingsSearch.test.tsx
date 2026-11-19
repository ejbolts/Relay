// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CollapsibleSection } from './CollapsibleSection';
import { ProfileIdentity } from './ProfileIdentity';
import { SettingsSearch } from './SettingsSearch';
import {
  searchSettings,
  SETTINGS_DESTINATIONS,
  SettingsNavigationContext,
  useSettingsPageJump,
  type SettingsJump,
  type SettingsPage,
} from './settingsNavigation';

let root: Root;
let container: HTMLDivElement;
const restChanged = vi.fn();
const account = {
  id: 'sample-id',
  username: 'sample',
  display_name: 'Sample Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-01',
};

function Harness({ identityKey = 'initial' }: { identityKey?: string }) {
  const [request, setRequest] = useState<SettingsJump | null>(null);
  const page = request?.destination.page ?? 'settings';
  return (
    <SettingsNavigationContext.Provider
      value={{
        request,
        navigate: (destination) =>
          setRequest((old) => ({ destination, serial: (old?.serial ?? 0) + 1 })),
      }}
    >
      <JumpObserver page={page} />
      <SettingsSearch />
      <section data-settings-page="settings" hidden={page !== 'settings'}>
        <button aria-label="Rest timer" onClick={restChanged}>
          On
        </button>
        <CollapsibleSection className="settings-panel account-password" title="Change password">
          <form className="profile-form">
            <input autoComplete="current-password" />
          </form>
        </CollapsibleSection>
      </section>
      <section data-settings-page="profile" className="profile-screen" hidden={page !== 'profile'}>
        <ProfileIdentity key={identityKey} user={account} onSaved={vi.fn()} />
      </section>
    </SettingsNavigationContext.Provider>
  );
}

function JumpObserver({ page }: { page: SettingsPage }) {
  useSettingsPageJump('settings', page === 'settings');
  useSettingsPageJump('profile', page === 'profile');
  return null;
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
  restChanged.mockReset();
});
async function type(query: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}
async function jump(query: string) {
  await type(query);
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.settings-search-results button')!.click(),
  );
  await act(async () => vi.runAllTimers());
}
it('matches cross-page terms and synonyms and does not list anything for an empty query', () => {
  expect(searchSettings('  REST TIMER  ').map((entry) => entry.id)).toEqual(['rest']);
  // Titles containing the word lead; sections that only mention it in keywords follow.
  const rest = searchSettings('rest').map((entry) => entry.title);
  expect(rest.slice(0, 2)).toEqual(['Rest timer', 'Show rest times']);
  expect(rest).toContain('Your split');
  expect(searchSettings('username')[0].page).toBe('profile');
  expect(searchSettings('color').map((entry) => entry.id)).toContain('appearance');
  expect(searchSettings('password', false)).toEqual([]);
  for (const query of ['password', 'sharing', 'sign out', 'delete account', 'uuid']) {
    expect(searchSettings(query)[0].page).toBe('settings');
  }
  expect(searchSettings('  ')).toEqual([]);
  expect(new Set(SETTINGS_DESTINATIONS.map((entry) => entry.id)).size).toBe(
    SETTINGS_DESTINATIONS.length,
  );
});
it('opens profile editing and focuses Username, then jumps back to Rest timer without changing it', async () => {
  await act(async () => root.render(<Harness />));
  await jump('username');
  expect(container.querySelector('.profile-identity')?.classList.contains('is-editing')).toBe(true);
  expect(document.activeElement?.getAttribute('autocomplete')).toBe('username');
  expect((document.activeElement as HTMLInputElement).value).toBe('sample');
  await jump('rest timer');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Rest timer');
  expect(restChanged).not.toHaveBeenCalled();
});
it('keeps the searched field focused when loaded profile data remounts the editor', async () => {
  await act(async () => root.render(<Harness />));
  await jump('username');
  await act(async () => root.render(<Harness identityKey="loaded" />));
  await act(async () => vi.runAllTimers());
  expect(document.activeElement?.getAttribute('autocomplete')).toBe('username');
  expect((document.activeElement as HTMLInputElement).value).toBe('sample');
});
it('reveals a folded password form and offers an empty-result message and Escape clear', async () => {
  await act(async () => root.render(<Harness />));
  await jump('password');
  expect(container.querySelector('.collapsible-toggle')?.getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(document.activeElement?.getAttribute('autocomplete')).toBe('current-password');
  const input = await type('does-not-exist');
  expect(container.textContent).toContain('No sections found');
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(container.querySelector('.settings-search-results')).toBeNull();
});

it('waits for a destination that arrives after loading and focuses it when ready', async () => {
  const destination = { ...SETTINGS_DESTINATIONS[0], selector: '.late-target' };
  await act(async () =>
    root.render(
      <SettingsNavigationContext.Provider
        value={{ request: { destination, serial: 1 }, navigate: vi.fn() }}
      >
        <JumpObserver page="settings" />
        <section data-settings-page="settings" />
      </SettingsNavigationContext.Provider>,
    ),
  );
  await act(async () => vi.advanceTimersByTime(10));
  const target = document.createElement('button');
  target.className = 'late-target';
  await act(async () => {
    container.querySelector('[data-settings-page]')!.append(target);
  });
  await act(async () => vi.advanceTimersByTime(10));
  expect(document.activeElement).toBe(target);
});

it('finds settings that live on other screens, and admin tools only for admins', () => {
  const ids = (query: string, admin = false) =>
    searchSettings(query, true, admin).map((entry) => entry.id);
  expect(ids('zone')).toContain('cardio-zones');
  expect(ids('heart rate')).toContain('cardio-zones');
  expect(ids('check-in')).toContain('home-check-in');
  expect(ids('body fat')).toContain('home-check-in');
  expect(ids('sex')).toContain('profile-sex');
  expect(ids('rest alert')).toContain('alerts');
  expect(ids('routine')).toContain('training-split');
  expect(ids('automatic')).toContain('appearance');
  expect(ids('admin')).toEqual([]);
  expect(ids('admin', true)).toEqual(['admin']);
  expect(searchSettings('admin', false, true).map((entry) => entry.id)).toEqual(['admin']);
});

it('matches the start of words, so "plate" no longer finds templates', () => {
  expect(searchSettings('plate')).toEqual([]);
  expect(searchSettings('temp').map((entry) => entry.id)).toContain('training-split');
  expect(searchSettings('time').map((entry) => entry.id)).toContain('rest');
});
