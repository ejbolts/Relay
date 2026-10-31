// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { ProfileCardioCard } from './ProfileCardioCard';
import type { SharedCardioSession, SharedCardioPage } from './types';

const sessions: SharedCardioSession[] = Array.from({ length: 27 }, (_, i) => ({
  id: `session-${i + 1}`,
  session_date: `2026-10-${String(27 - i).padStart(2, '0')}`,
  activity_type: `Cardio ${i + 1}`,
  duration_minutes: 40,
  calories_kcal: 300,
  average_heart_rate_bpm: 130,
  distance_km: 3,
  average_speed_kph: null,
  incline_percent: null,
  average_power_watts: null,
  average_mets: null,
  zone: 'zone2',
  qualifies_zone2: true,
  notes: null,
}));
let root: Root;
let host: HTMLDivElement;
async function render(
  profileId = 'owner',
  initial = sessions.slice(0, 5),
  total = 27,
  active = true,
) {
  await act(async () =>
    root.render(
      <ProfileCardioCard profileId={profileId} sessions={initial} total={total} active={active} />,
    ),
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  );
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.click());
}
function rows() {
  return [...host.querySelectorAll('.shared-cardio-list li')].map((item) => item.textContent);
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(api.sharing, 'cardio').mockImplementation(async (_id, offset, limit = 5) => ({
    total: 27,
    sessions: sessions.slice(offset, offset + limit),
  }));
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

it('shows only five newest sessions, and pages forward, back and directly to the final page', async () => {
  await render();
  expect(rows()).toHaveLength(5);
  expect(rows()[0]).toContain('Cardio 1');
  expect(rows()[4]).toContain('Cardio 5');
  expect(host.textContent).toContain('1–5 of 27');
  expect(host.textContent).toContain('Page 1 of 6');
  expect(api.sharing.cardio).not.toHaveBeenCalled();
  await click('Next cardio page');
  expect(api.sharing.cardio).toHaveBeenLastCalledWith('owner', 5, 5);
  expect(rows()[0]).toContain('Cardio 6');
  expect(rows()).toHaveLength(5);
  await click('Choose a cardio page');
  await click('Go to page 6');
  expect(rows()).toHaveLength(2);
  expect(rows()[0]).toContain('Cardio 26');
  expect(host.textContent).toContain('26–27 of 27');
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Next cardio page"]')?.disabled).toBe(
    true,
  );
  await click('Previous cardio page');
  expect(rows()[0]).toContain('Cardio 21');
  await click('Choose a cardio page');
  await click('Go to page 1');
  expect(rows()[0]).toContain('Cardio 1');
});

it('hides pagination for zero to five sessions', async () => {
  await render('owner', [], 0);
  expect(host.textContent).toContain('No cardio sessions yet.');
  expect(host.querySelector('nav')).toBeNull();
  await render('owner', sessions.slice(0, 5), 5);
  expect(rows()).toHaveLength(5);
  expect(host.querySelector('nav')).toBeNull();
});

it('retains the current page after a network failure and retries the failed request', async () => {
  vi.mocked(api.sharing.cardio).mockRejectedValueOnce(new Error('Could not load cardio.'));
  await render();
  await click('Next cardio page');
  expect(rows()[0]).toContain('Cardio 1');
  expect(host.textContent).toContain('Page 1 of 6');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click('Try again');
  expect(rows()[0]).toContain('Cardio 6');
  expect(host.textContent).toContain('Page 2 of 6');
});

it('keeps the selected page across profile refreshes and clamps it after deletions', async () => {
  await render();
  await click('Choose a cardio page');
  await click('Go to page 6');
  await render('owner', [...sessions.slice(0, 5)], 27);
  expect(host.textContent).toContain('Page 6 of 6');
  vi.mocked(api.sharing.cardio).mockImplementation(async (_id, offset, limit = 5) => ({
    total: 7,
    sessions: sessions.slice(0, 7).slice(offset, offset + limit),
  }));
  await render('owner', [...sessions.slice(0, 5)], 7);
  expect(host.textContent).toContain('Page 2 of 2');
  expect(rows()).toHaveLength(2);
  expect(rows()[0]).toContain('Cardio 6');
});

it('resets for another profile and ignores stale responses from the previous profile', async () => {
  let finish!: (page: SharedCardioPage) => void;
  vi.mocked(api.sharing.cardio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await click('Next cardio page');
  expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
  const other = [{ ...sessions[0], id: 'other', activity_type: 'Other account cardio' }];
  await render('other', other, 1);
  await act(async () => finish({ total: 27, sessions: sessions.slice(5, 10) }));
  expect(rows()).toHaveLength(1);
  expect(rows()[0]).toContain('Other account cardio');
  expect(host.querySelector('nav')).toBeNull();
});

it('hides stale cardio after access is revoked and keeps it hidden while retrying', async () => {
  vi.mocked(api.sharing.cardio).mockRejectedValueOnce(
    new ApiError('Profile is not shared.', 'profile_not_found', 404),
  );
  await render();
  await click('Next cardio page');
  expect(rows()).toHaveLength(0);
  expect(host.querySelector('nav')).toBeNull();
  vi.mocked(api.sharing.cardio).mockRejectedValueOnce(new Error('Offline'));
  await click('Try again');
  expect(rows()).toHaveLength(0);
  let finish!: (page: SharedCardioPage) => void;
  vi.mocked(api.sharing.cardio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await click('Try again');
  expect(rows()).toHaveLength(0);
  await act(async () => finish({ total: 27, sessions: sessions.slice(5, 10) }));
  expect(rows()[0]).toContain('Cardio 6');
});
