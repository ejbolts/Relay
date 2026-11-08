import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdminScreenView, type AdminScreenViewProps } from './AdminScreen';
import type { AccountLimits, AccountLimitsSettings, AdminUser } from './types';

const owner: AdminUser = {
  id: 'owner',
  username: 'owner',
  display_name: 'Owner',
  is_admin: true,
  disabled_at: null,
  must_change_password: false,
  created_at: '2026-10-01T10:00:00Z',
  last_active_at: '2026-10-10T10:00:00Z',
  signed_in_devices: 1,
  workouts: 12,
  photos: 3,
  photo_bytes: 900 * 1024,
  video_sessions: 2,
};

const tester: AdminUser = {
  ...owner,
  id: 'tester',
  username: 'tester',
  display_name: 'Tester',
  is_admin: false,
  signed_in_devices: 2,
  workouts: 0,
  photos: 0,
  photo_bytes: 0,
  video_sessions: 0,
};

const defaults: AccountLimits = {
  workouts_per_account: 5000,
  cardio_sessions_per_account: 5000,
  custom_exercises_per_account: 100,
  photos_per_account: 25,
  saves_per_minute: 60,
  exercises_per_workout: 20,
  sets_per_workout: 100,
  workout_note_characters: 2000,
  exercise_note_characters: 1000,
  set_note_characters: 500,
  photo_upload_megabytes: 5,
};

const limits: AccountLimitsSettings = {
  values: { ...defaults, photos_per_account: 40 },
  defaults,
  bounds: Object.fromEntries(
    Object.keys(defaults).map((name) => [name, { minimum: 1, maximum: 100_000 }]),
  ) as AccountLimitsSettings['bounds'],
};

function view(overrides: Partial<AdminScreenViewProps> = {}) {
  return renderToStaticMarkup(
    <AdminScreenView
      currentUserId="owner"
      users={[owner, tester]}
      settings={{ video_uploads: 'off', allow_registration: true, invite_code_required: true }}
      status={{
        disk: {
          total_bytes: 100 * 1024 ** 3,
          used_bytes: 25 * 1024 ** 3,
          free_bytes: 75 * 1024 ** 3,
        },
        database_bytes: 2 * 1024 * 1024,
        photos: 3,
        photo_bytes: 900 * 1024,
        video_file_bytes: 0,
        video_queue: { queued: 1, normalizing: 0 },
      }}
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
  );
}

describe('AdminScreenView', () => {
  it('shows online activity and a live workout while preserving last-active information', () => {
    const markup = view({
      users: [
        {
          ...tester,
          presence: {
            online: true,
            last_active_at: tester.last_active_at,
            workout: { name: 'Push day', kind: 'strength', started_at: new Date().toISOString() },
          },
        },
      ],
    });
    expect(markup).toContain('Active now');
    expect(markup).toContain('Live workout');
    expect(markup).toContain('Push day');
    expect(markup).toContain('Last active');
    const disabled = view({
      users: [
        {
          ...tester,
          disabled_at: new Date().toISOString(),
          presence: {
            online: true,
            last_active_at: tester.last_active_at,
            workout: {
              name: 'Must stay hidden',
              kind: 'strength',
              started_at: new Date().toISOString(),
            },
          },
        },
      ],
    });
    expect(disabled).not.toContain('Active now');
    expect(disabled).not.toContain('Must stay hidden');
  });

  it('shows the current video mode and the sign-up switch', () => {
    const markup = view();

    expect(markup).toMatch(/role="radio" aria-checked="true" class="active"[^>]*>Off</);
    expect(markup).toMatch(/role="radio" aria-checked="false"[^>]*>Everyone</);
    expect(markup).toContain('Keeps the server’s CPU free');
    expect(markup).toContain('aria-label="New sign-ups" aria-checked="true"');
    expect(markup).toContain('Anyone with the invite code can create an account');
  });

  it('summarises disk, storage, and the video queue', () => {
    const markup = view();

    expect(markup).toContain('75 GB free of 100 GB (25% used)');
    expect(markup).toContain('aria-valuenow="25"');
    expect(markup).toContain('3 photos · 900 KB');
    expect(markup).toContain('1 waiting');
  });

  it('lists accounts and never offers to disable the signed-in admin', () => {
    const markup = view();

    expect(markup).toContain('2 accounts');
    expect(markup).toContain('tester');
    expect(markup).toContain('2 devices');
    expect(markup).toContain('>You<');
    expect(markup.match(/Disable account/g)).toHaveLength(1);
  });

  it('offers a password reset for other accounts only, and flags a pending temporary password', () => {
    const markup = view();
    expect(markup.match(/Reset password/g)).toHaveLength(1);
    expect(markup).not.toContain('Temporary password');

    const pending = view({ users: [owner, { ...tester, must_change_password: true }] });
    expect(pending).toContain('>Temporary password<');
  });

  it('shows a temporary password under the account it belongs to', () => {
    const markup = view({
      temporaryPassword: { userId: 'tester', displayName: 'Tester', password: 'abcde-fghjk-mnpqr' },
    });

    expect(markup).toContain('aria-label="Temporary password for Tester"');
    expect(markup.match(/abcde-fghjk-mnpqr/g)).toHaveLength(1);
    const other = view({
      temporaryPassword: { userId: 'someone-else', displayName: 'Else', password: 'zzzzz-zzzzz' },
    });
    expect(other).not.toContain('zzzzz-zzzzz');
  });

  it('marks disabled accounts and offers to enable them', () => {
    const markup = view({ users: [owner, { ...tester, disabled_at: '2026-10-09T09:00:00Z' }] });

    expect(markup).toContain('1 disabled');
    expect(markup).toContain('admin-user is-disabled');
    expect(markup).toContain('Enable account');
    expect(markup).not.toContain('Disable account');
  });

  it('shows the hidden limits with their defaults, ready to edit', () => {
    const markup = view({ limits });

    expect(markup).toContain('Account limits');
    expect(markup).toContain('Admins aren’t held to these.');
    expect(markup).toMatch(/Machine photos<\/strong><small>Default 25<\/small>/);
    expect(markup).toMatch(/Upload size<\/strong><small>Default 5 MB<\/small>/);
    expect(markup).toContain('value="40"');
    expect(markup.match(/type="number"/g)).toHaveLength(Object.keys(defaults).length);
    // Nothing to save until a value changes.
    expect(markup).toMatch(/type="submit" class="profile-primary" disabled="">Save limits/);
  });

  it('hides the limits until they have loaded', () => {
    expect(view()).not.toContain('Account limits');
  });

  it('shows errors and notices', () => {
    expect(view({ error: 'Only an administrator can do that.' })).toContain('role="alert"');
    expect(view({ notice: 'Sign-ups are closed.' })).toContain('Sign-ups are closed.');
  });

  it('shows private feedback as text and makes the empty state clear', () => {
    expect(view({ feedback: [] })).toContain('No feedback yet.');
    const markup = view({
      feedback: [
        {
          id: 'message',
          username: 'tester',
          message: '<script>alert(1)</script>',
          created_at: '2026-10-11T01:00:00Z',
          resolved_at: null,
          resolved_by: null,
        },
      ],
    });
    expect(markup).toContain('@tester');
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
  });

  it('counts open feedback and offers to resolve or reopen each message', () => {
    const base = {
      username: 'tester',
      message: 'More cardio help',
      created_at: '2026-10-11T01:00:00Z',
    };
    const markup = view({
      onFeedbackResolvedChange: vi.fn(),
      busyFeedbackId: 'saving',
      feedback: [
        { ...base, id: 'open', resolved_at: null, resolved_by: null },
        { ...base, id: 'saving', resolved_at: null, resolved_by: null },
        { ...base, id: 'done', resolved_at: '2026-10-12T01:00:00Z', resolved_by: 'owner' },
      ],
    });
    expect(markup).toContain('2 open');
    expect(markup.match(/>Resolve</g)).toHaveLength(1);
    expect(markup).toMatch(/disabled="">Saving…</);
    expect(markup).toContain('class="is-resolved"');
    expect(markup).toContain('Resolved by @owner');
    expect(markup).toMatch(/class="profile-secondary">Reopen</);
  });

  it('hides the open count once everything is resolved', () => {
    const markup = view({
      feedback: [
        {
          id: 'done',
          username: 'tester',
          message: 'Thanks',
          created_at: '2026-10-11T01:00:00Z',
          resolved_at: '2026-10-12T01:00:00Z',
          resolved_by: null,
        },
      ],
    });
    expect(markup).not.toContain(' open<');
    expect(markup).toContain('Resolved ·');
  });
});
