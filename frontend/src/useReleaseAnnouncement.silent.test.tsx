// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import shipped from '../release.json';
import { useReleaseAnnouncement } from './useReleaseAnnouncement';

const notes = vi.hoisted(() => ({ version: '' }));

// Ship the current notes as a silent patch of themselves: one patch number higher.
vi.mock('../release.json', async (importOriginal) => {
  const actual = (await importOriginal<{ default: typeof shipped }>()).default;
  const announced = (actual as { notesVersion?: string }).notesVersion ?? actual.version;
  const [major, minor, patch] = actual.version.split('.').map(Number);
  notes.version = announced;
  return {
    default: {
      ...actual,
      version: `${major}.${minor}.${patch + 1}`,
      notesVersion: announced,
      silentChanges: ['**Exercises:** The help button is back.'],
    },
  };
});

let root: Root;
let container: HTMLDivElement;
let announcement: ReturnType<typeof useReleaseAnnouncement>;
type Notices = Parameters<typeof useReleaseAnnouncement>[2];

function Harness({ userId, notices }: { userId: string; notices?: Notices }) {
  announcement = useReleaseAnnouncement(userId, null, notices);
  return null;
}

async function render(userId: string, notices?: Notices) {
  await act(async () => root.render(<Harness userId={userId} notices={notices} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps a silent patch quiet for an account that has seen the release it follows', async () => {
  const record = vi.fn();
  await render('seen-on-another-device', {
    ready: true,
    notices: { release_seen: notes.version, weekly_review_seen: null },
    record,
  });
  expect(announcement.open).toBe(false);
  expect(announcement.noticeUnread).toBe(false);

  window.localStorage.setItem(`gym-logger-release-seen:seen-here:${notes.version}`, '1');
  window.localStorage.setItem(`gym-logger-release-notice-read:seen-here:${notes.version}`, '1');
  await render('seen-here');
  expect(announcement.open).toBe(false);
  expect(announcement.noticeUnread).toBe(false);
});

it('shows the followed release’s notes, without the held-back changes, to an account that missed them', async () => {
  const record = vi.fn();
  await render('missed-it', { ready: true, notices: null, record });
  expect(announcement.open).toBe(true);
  expect(announcement.release.version).toBe(notes.version);
  expect(announcement.release).not.toHaveProperty('silentChanges');
  expect(announcement.release.changes).not.toContain('**Exercises:** The help button is back.');
  await act(async () => announcement.dismiss());
  expect(record).toHaveBeenCalledWith({ release_seen: notes.version });
});
