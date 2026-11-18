// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { api } from './api';
import { ProfileBorderPicker } from './ProfileBorderPicker';
import {
  borderProgressLabel,
  borderProgressPercent,
  borderSets,
  borderTimeBadge,
  borderTimeLabel,
  shownTier,
} from './profileBorderProgress';
import type { ProfileBorder, ProfileBorders, User } from './types';

const user: User = {
  id: 'sample',
  username: 'sample',
  display_name: 'Sample Lifter',
  is_admin: false,
  can_upload_videos: false,
  created_at: '2026-10-01T12:00:00Z',
  profile_photo_url: null,
  profile_border: null,
};

const border = (fields: Partial<ProfileBorder> & Pick<ProfileBorder, 'key' | 'name'>) => ({
  group: 'Consistency',
  rarity: 'common' as const,
  requirement: 'Log 5 workouts',
  unlocked: false,
  progress: { current: 2, target: 5, unit: 'workouts' },
  needs_sex: false,
  ...fields,
});

const borders: ProfileBorders = {
  selected: null,
  sex: null,
  borders: [
    border({ key: 'first-steps', name: 'First Steps', unlocked: true }),
    border({
      key: 'centurion',
      name: 'Centurion',
      rarity: 'epic',
      requirement: 'Log 100 workouts',
      progress: { current: 29, target: 100, unit: 'workouts' },
    }),
    border({
      key: 'bench-club',
      name: 'Bench Club',
      group: 'Strength',
      rarity: 'epic',
      requirement: 'Bench press 100 kg (men) or 50 kg (women)',
      progress: null,
      needs_sex: true,
    }),
  ],
};

let root: Root;
let container: HTMLDivElement;
let closed: Mock<() => void>;
let setSex: Mock<() => void>;

async function open(loaded: ProfileBorders | Promise<ProfileBorders> = borders) {
  vi.spyOn(api, 'profileBorders').mockImplementation(async () => loaded);
  function Harness() {
    const [current, setCurrent] = useState(user);
    return (
      <>
        <output data-testid="worn">{current.profile_border ?? 'none'}</output>
        <ProfileBorderPicker
          user={current}
          onSaved={setCurrent}
          onClose={closed}
          onSetSex={setSex}
        />
      </>
    );
  }
  await act(async () => root.render(<Harness />));
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog.border-picker')!;
const tile = (name: string) =>
  [...dialog().querySelectorAll<HTMLButtonElement>('.border-tile')].find(
    (item) => item.querySelector('.border-tile-name')?.textContent === name,
  )!;
const preview = () => dialog().querySelector('.border-preview-copy')!;
const press = (element: Element) =>
  act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  closed = vi.fn<() => void>();
  setSex = vi.fn<() => void>();
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

describe('borderProgressLabel', () => {
  it('shows how far the account is, never past the target', () => {
    expect(borderProgressLabel({ current: 29, target: 100, unit: 'workouts' })).toBe(
      '29 / 100 workouts',
    );
    expect(borderProgressLabel({ current: 1544.5, target: 8849, unit: 'm' })).toBe(
      '1,544.5 / 8,849 m',
    );
    expect(borderProgressLabel({ current: 130, target: 100, unit: '%' })).toBe('100 / 100%');
  });

  it('fills the bar by a clean percentage', () => {
    expect(borderProgressPercent({ current: 29, target: 100, unit: 'workouts' })).toBe(29);
    expect(borderProgressPercent({ current: 1, target: 3, unit: 'PRs' })).toBe(33.3);
    expect(borderProgressPercent({ current: 500, target: 100, unit: 'km' })).toBe(100);
  });
});

describe('ProfileBorderPicker', () => {
  it('lists every border by group and starts on the first one earned', async () => {
    await open();
    expect(dialog().querySelector('.section-kicker')?.textContent).toBe('1 of 3 unlocked');
    expect([...dialog().querySelectorAll('.border-group h3')].map((h) => h.textContent)).toEqual([
      'Consistency',
      'Strength',
    ]);
    expect(tile('First Steps').getAttribute('aria-pressed')).toBe('true');
    expect(tile('First Steps').getAttribute('aria-label')).toBe('First Steps, unlocked');
    expect(tile('Centurion').getAttribute('aria-label')).toBe('Centurion, locked');
    expect(tile('Centurion').querySelector('.profile-border-art')).not.toBeNull();
    expect(preview().textContent).toContain('Log 5 workouts');
    expect(preview().querySelector('.border-wear')?.textContent).toBe('Wear border');
  });

  it('shows progress for a locked border instead of a way to wear it', async () => {
    await open();
    await press(tile('Centurion'));
    expect(preview().textContent).toContain('Log 100 workouts');
    expect(preview().querySelector('.border-wear')).toBeNull();
    const bar = preview().querySelector('[role=progressbar]')!;
    expect(bar.getAttribute('aria-valuetext')).toBe('29 / 100 workouts');
    expect(bar.querySelector('span')?.style.width).toBe('29%');
    expect(dialog().querySelector('.border-preview-avatar .profile-border-art')).not.toBeNull();
  });

  it('wears an earned border, confirms it and can take it off again', async () => {
    const choose = vi
      .spyOn(api, 'chooseProfileBorder')
      .mockImplementation(async (key) => ({ ...user, profile_border: key }));
    await open();
    await press(preview().querySelector('.border-wear')!);
    expect(choose).toHaveBeenCalledWith('first-steps');
    expect(container.querySelector('[data-testid=worn]')?.textContent).toBe('first-steps');
    expect(preview().querySelector('.border-wearing')?.textContent).toBe('Wearing');
    expect(tile('First Steps').getAttribute('aria-label')).toBe('First Steps, wearing');
    expect(dialog().querySelector('.app-notification-toast p')?.textContent).toBe('Border updated');

    await press(
      [...preview().querySelectorAll('button')].find((item) => item.textContent === 'Take off')!,
    );
    expect(choose).toHaveBeenLastCalledWith(null);
    expect(container.querySelector('[data-testid=worn]')?.textContent).toBe('none');
    expect(preview().querySelector('.border-wear')).not.toBeNull();
  });

  it('keeps the border off and explains a refused choice', async () => {
    vi.spyOn(api, 'chooseProfileBorder').mockRejectedValue(new Error('offline'));
    await open();
    await press(preview().querySelector('.border-wear')!);
    expect(preview().querySelector('[role=alert]')).not.toBeNull();
    expect(container.querySelector('[data-testid=worn]')?.textContent).toBe('none');
    expect(preview().querySelector('.border-wear')).not.toBeNull();
  });

  it('sends a strength border without a sex to the profile editor', async () => {
    await open();
    await press(tile('Bench Club'));
    expect(preview().textContent).toContain('Bench press 100 kg (men) or 50 kg (women)');
    expect(preview().querySelector('[role=progressbar]')).toBeNull();
    await press(
      [...preview().querySelectorAll('button')].find(
        (item) => item.textContent === 'Set your sex to unlock',
      )!,
    );
    expect(setSex).toHaveBeenCalledOnce();
  });

  it('opens on the border already worn', async () => {
    vi.spyOn(api, 'profileBorders').mockResolvedValue({ ...borders, selected: 'first-steps' });
    await act(async () =>
      root.render(
        <ProfileBorderPicker
          user={{ ...user, profile_border: 'first-steps' }}
          onSaved={() => {}}
          onClose={closed}
          onSetSex={setSex}
        />,
      ),
    );
    expect(preview().querySelector('.border-wearing')).not.toBeNull();
    expect(tile('First Steps').querySelector('.border-tile-badge.is-worn')).not.toBeNull();
  });

  it('offers a retry when the borders cannot be loaded', async () => {
    const load = vi.spyOn(api, 'profileBorders').mockRejectedValueOnce(new Error('offline'));
    await act(async () =>
      root.render(
        <ProfileBorderPicker user={user} onSaved={() => {}} onClose={closed} onSetSex={setSex} />,
      ),
    );
    expect(dialog().querySelector('[role=alert]')).not.toBeNull();
    load.mockResolvedValue(borders);
    await press(
      [...dialog().querySelectorAll('button')].find((item) => item.textContent === 'Try again')!,
    );
    expect(tile('First Steps')).toBeDefined();
  });
});

const deadlift = (tier: number, unlocked: boolean) =>
  border({
    key: `deadlift-club-${tier}`,
    name: `Deadlift Club ${['I', 'II', 'III'][tier - 1]}`,
    group: 'Strength',
    requirement: `Deadlift ${[140, 180, 220][tier - 1]} kg`,
    unlocked,
    progress: { current: 185, target: [140, 180, 220][tier - 1], unit: 'kg' },
    family: 'deadlift',
    tier,
  });

const tiered: ProfileBorders = {
  selected: null,
  sex: 'male',
  // Listed out of order to show the picker sorts tiers itself.
  borders: [deadlift(3, false), deadlift(1, true), deadlift(2, true)],
};

describe('tiered borders', () => {
  it('groups a family into one set, easiest first, and shows its best earned tier', () => {
    const [[group, [set]]] = borderSets(tiered.borders);
    expect(group).toBe('Strength');
    expect(set.map((item) => item.tier)).toEqual([1, 2, 3]);
    expect(shownTier(set, null).key).toBe('deadlift-club-2');
    expect(shownTier(set, 'deadlift-club-1').key).toBe('deadlift-club-1');
    expect(shownTier([deadlift(1, false), deadlift(2, false)], null).key).toBe('deadlift-club-1');
  });

  it('shows one tile per family with a pip for each tier earned', async () => {
    await open(tiered);
    const tiles = dialog().querySelectorAll('.border-tile');
    expect(tiles).toHaveLength(1);
    const family = tile('Deadlift Club II');
    expect(family.getAttribute('aria-label')).toBe(
      'Deadlift Club II, unlocked, 2 of 3 tiers earned',
    );
    expect(family.querySelectorAll('.border-tile-pips > i.is-earned')).toHaveLength(2);
    expect(family.querySelectorAll('.border-tile-pips > i')).toHaveLength(3);
    expect(family.querySelector('[data-border="deadlift-club-2"]')).not.toBeNull();
  });

  it('steps through a family from the preview, with progress towards a locked tier', async () => {
    await open(tiered);
    const tierButtons = () => [
      ...preview().querySelectorAll<HTMLButtonElement>('.border-tiers button'),
    ];
    expect(tierButtons().map((item) => item.getAttribute('aria-label'))).toEqual([
      'Tier 1, unlocked',
      'Tier 2, unlocked',
      'Tier 3, locked',
    ]);
    expect(tierButtons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(preview().querySelector('.border-wear')).not.toBeNull();

    await press(tierButtons()[2]);
    expect(preview().textContent).toContain('Deadlift Club III');
    expect(preview().textContent).toContain('Deadlift 220 kg');
    expect(preview().querySelector('[role=progressbar]')?.getAttribute('aria-valuetext')).toBe(
      '185 / 220 kg',
    );
    expect(preview().querySelector('.border-wear')).toBeNull();
    expect(tile('Deadlift Club II').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('limited editions', () => {
  const season = (tier: number, unlocked: boolean) =>
    border({
      key: `season-1-${tier}`,
      name: `Season 1 ${['Contender', 'Challenger', 'Champion'][tier - 1]}`,
      group: 'Season 1',
      rarity: (['common', 'rare', 'epic'] as const)[tier - 1],
      requirement: `Train on ${[15, 40, 70][tier - 1]} days between 1 Sep and 31 Dec 2026`,
      unlocked,
      progress: { current: 17, target: [15, 40, 70][tier - 1], unit: 'days' },
      family: 'season-1',
      tier,
      kind: 'season',
      status: 'active',
      starts_on: '2026-09-01',
      ends_on: '2026-12-31',
      days_left: 43,
    });
  const christmas = border({
    key: 'christmas-2026',
    name: 'Christmas 2026',
    group: 'Events',
    rarity: 'common',
    requirement: 'Train on 12 days in December 2026',
    progress: { current: 0, target: 12, unit: 'days' },
    kind: 'event',
    status: 'upcoming',
    starts_on: '2026-12-01',
    ends_on: '2026-12-31',
    days_left: 12,
  });
  const limited: ProfileBorders = {
    selected: null,
    sex: 'male',
    borders: [season(1, true), season(2, false), season(3, false), christmas],
  };

  it('says how long a border is open, or how soon it opens', () => {
    expect(borderTimeLabel(season(1, true))).toBe('43 days left');
    expect(borderTimeLabel({ ...christmas, days_left: 1, status: 'active' })).toBe('Last day');
    expect(borderTimeLabel(christmas)).toBe('Starts in 12 days');
    expect(borderTimeLabel({ ...christmas, days_left: 1 })).toBe('Starts tomorrow');
    expect(borderTimeLabel({ ...season(1, true), status: 'ended', days_left: null })).toBe(
      'Season over',
    );
    expect(borderTimeLabel(border({ key: 'regular', name: 'Regular' }))).toBeNull();
    expect(borderTimeBadge(season(1, true))).toBe('43d');
    expect(borderTimeBadge(christmas)).toBe('Soon');
  });

  it('shows bodyweight ratios to two decimals', () => {
    expect(borderProgressLabel({ current: 1.05, target: 1.25, unit: '× BW' })).toBe(
      '1.05× / 1.25× BW',
    );
  });

  it('heads the season with its countdown and badges each coming event', async () => {
    await open(limited);
    const headings = [...dialog().querySelectorAll('.border-group h3')];
    expect(headings[0].textContent).toBe('Season 143 days left');
    expect(headings[0].querySelector('.border-group-timer')?.textContent).toBe('43 days left');
    expect(tile('Season 1 Contender').querySelector('.border-tile-timer')).toBeNull();
    expect(tile('Christmas 2026').querySelector('.border-tile-timer')?.textContent).toBe('Soon');
    expect(preview().querySelector('.border-preview-timer')?.textContent).toBe('43 days left');

    await press(tile('Christmas 2026'));
    expect(preview().querySelector('.border-preview-timer')?.textContent).toBe('Starts in 12 days');
    expect(preview().querySelector('.border-wear')).toBeNull();
  });

  it('labels mythic borders', async () => {
    await open({
      ...borders,
      borders: [
        border({ key: 'bench-club-5', name: 'Bench Club V', rarity: 'mythic', unlocked: true }),
      ],
    });
    expect(preview().querySelector('.border-rarity.mythic')?.textContent).toBe('Mythic');
  });
});
