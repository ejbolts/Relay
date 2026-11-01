import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useAdminUsers } from './adminActivity';
import { useNow, workoutElapsed } from './presence';
import {
  LIMIT_GROUPS,
  VIDEO_UPLOAD_OPTIONS,
  formatBytes,
  formatJoined,
  formatLastActive,
  limitDraft,
  parseLimitDraft,
  plural,
  validLimit,
  videoQueueSummary,
} from './adminDisplay';
import { authErrorMessage } from './authForm';
import { InlineConfirmButton } from './InlineConfirmButton';
import type {
  AccountLimits,
  AppFeedback,
  AccountLimitsSettings,
  AdminUser,
  ServerSettings,
  ServerStatus,
  VideoUploadMode,
} from './types';
import { useUserSession } from './userContext';

export interface AdminScreenViewProps {
  feedback?: AppFeedback[] | null;
  currentUserId: string;
  users: AdminUser[] | null;
  settings: ServerSettings | null;
  status: ServerStatus | null;
  limits: AccountLimitsSettings | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  savingSetting: boolean;
  savingLimits: boolean;
  busyUserId: string | null;
  busyFeedbackId?: string | null;
  onFeedbackResolvedChange?: (item: AppFeedback, resolved: boolean) => void;
  onVideoUploadsChange: (mode: VideoUploadMode) => void;
  onSaveLimits: (values: AccountLimits) => void;
  onRegistrationChange: (open: boolean) => void;
  onUserDisabledChange: (user: AdminUser, disabled: boolean) => Promise<void>;
  onRefresh: () => void;
}

function SwitchesPanel({
  settings,
  saving,
  onVideoUploadsChange,
  onRegistrationChange,
}: {
  settings: ServerSettings;
  saving: boolean;
  onVideoUploadsChange: (mode: VideoUploadMode) => void;
  onRegistrationChange: (open: boolean) => void;
}) {
  const videoOption = VIDEO_UPLOAD_OPTIONS.find(
    (option) => option.value === settings.video_uploads,
  );
  return (
    <section className="settings-panel panel" aria-labelledby="admin-switches-title">
      <header>
        <div>
          <p className="section-kicker">SERVER SWITCHES</p>
          <h2 id="admin-switches-title">Features</h2>
        </div>
      </header>
      <div className="admin-setting">
        <div>
          <strong id="admin-video-label">Video uploads</strong>
          <small>{videoOption?.detail}</small>
        </div>
        <div
          className="segmented-control compact admin-segmented"
          role="radiogroup"
          aria-labelledby="admin-video-label"
        >
          {VIDEO_UPLOAD_OPTIONS.map((option) => (
            <button
              type="button"
              role="radio"
              key={option.value}
              aria-checked={settings.video_uploads === option.value}
              className={settings.video_uploads === option.value ? 'active' : ''}
              disabled={saving}
              onClick={() => {
                if (settings.video_uploads !== option.value) onVideoUploadsChange(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="notification-setting-row admin-setting-row">
        <div>
          <strong>New sign-ups</strong>
          <small>
            {settings.allow_registration
              ? settings.invite_code_required
                ? 'Anyone with the invite code can create an account'
                : 'Anyone can create an account'
              : 'Nobody new can create an account'}
          </small>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="New sign-ups"
          aria-checked={settings.allow_registration}
          className={settings.allow_registration ? 'is-on' : ''}
          disabled={saving}
          onClick={() => onRegistrationChange(!settings.allow_registration)}
        >
          <span />
          {settings.allow_registration ? 'On' : 'Off'}
        </button>
      </div>
    </section>
  );
}

function LimitsPanel({
  limits,
  saving,
  onSave,
}: {
  limits: AccountLimitsSettings;
  saving: boolean;
  onSave: (values: AccountLimits) => void;
}) {
  const [draft, setDraft] = useState(() => limitDraft(limits.values));
  const parsed = parseLimitDraft(draft, limits.bounds);
  const names = Object.keys(limits.values) as (keyof AccountLimits)[];
  const changed = parsed !== null && names.some((name) => parsed[name] !== limits.values[name]);
  const defaultsDraft = limitDraft(limits.defaults);
  const showingDefaults = names.every((name) => draft[name] === defaultsDraft[name]);

  return (
    <section className="settings-panel panel" aria-labelledby="admin-limits-title">
      <header>
        <div>
          <p className="section-kicker">HIDDEN LIMITS</p>
          <h2 id="admin-limits-title">Account limits</h2>
        </div>
      </header>
      <p>
        People are never told these exist, except the photo size: anything over a limit just fails
        to save. Workouts saved before a limit was lowered can still be edited.
      </p>
      <form
        className="admin-limits"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed && changed) onSave(parsed);
        }}
      >
        {LIMIT_GROUPS.map((group) => {
          const headingId = `admin-limits-${group.fields[0].name}`;
          return (
            <div
              className="admin-limit-group"
              role="group"
              aria-labelledby={headingId}
              key={group.title}
            >
              <div className="admin-limit-group-heading">
                <h3 id={headingId}>{group.title}</h3>
                <small>{group.detail}</small>
              </div>
              {group.fields.map((field) => {
                const bound = limits.bounds[field.name];
                const unit = field.unit ? ` ${field.unit}` : '';
                return (
                  <label className="admin-limit" key={field.name}>
                    <span>
                      <strong>{field.label}</strong>
                      <small>
                        Default {limits.defaults[field.name].toLocaleString()}
                        {unit}
                      </small>
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={bound.minimum}
                      max={bound.maximum}
                      step={1}
                      value={draft[field.name]}
                      aria-invalid={validLimit(draft[field.name], bound) ? undefined : true}
                      disabled={saving}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                    />
                  </label>
                );
              })}
            </div>
          );
        })}
        <div className="admin-limit-actions">
          <button
            type="button"
            className="profile-secondary"
            disabled={saving || showingDefaults}
            onClick={() => setDraft(defaultsDraft)}
          >
            Use defaults
          </button>
          <button type="submit" className="profile-primary" disabled={saving || !changed}>
            {saving ? 'Saving…' : 'Save limits'}
          </button>
        </div>
      </form>
    </section>
  );
}

function StatusPanel({ status }: { status: ServerStatus }) {
  const { total_bytes, used_bytes, free_bytes } = status.disk;
  const usedPercent = total_bytes ? Math.round((used_bytes / total_bytes) * 100) : 0;
  return (
    <section className="settings-panel panel" aria-labelledby="admin-status-title">
      <header>
        <div>
          <p className="section-kicker">SERVER</p>
          <h2 id="admin-status-title">Storage &amp; processing</h2>
        </div>
      </header>
      <div
        className="admin-disk-meter"
        role="meter"
        aria-label="Disk used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usedPercent}
      >
        <span style={{ width: `${usedPercent}%` }} />
      </div>
      <p className="admin-disk-caption">
        {formatBytes(free_bytes)} free of {formatBytes(total_bytes)} ({usedPercent}% used)
      </p>
      <dl className="admin-stats">
        <div>
          <dt>Database</dt>
          <dd>{formatBytes(status.database_bytes)}</dd>
        </div>
        <div>
          <dt>Machine photos</dt>
          <dd>
            {plural(status.photos, 'photo')} · {formatBytes(status.photo_bytes)}
          </dd>
        </div>
        <div>
          <dt>Video files on disk</dt>
          <dd>{formatBytes(status.video_file_bytes)}</dd>
        </div>
        <div>
          <dt>Video queue</dt>
          <dd>{videoQueueSummary(status.video_queue)}</dd>
        </div>
      </dl>
    </section>
  );
}

function UserRow({
  user,
  isSelf,
  busy,
  onDisabledChange,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onDisabledChange: (user: AdminUser, disabled: boolean) => Promise<void>;
}) {
  const disabled = user.disabled_at !== null;
  const online = !disabled && user.presence?.online;
  const live = disabled ? null : user.presence?.workout;
  const now = useNow(Boolean(live || online), 60_000);
  return (
    <li className={`admin-user ${disabled ? 'is-disabled' : ''}`}>
      <div className="admin-user-heading">
        <strong>
          {user.display_name}
          {user.is_admin && <span className="profile-badge">Admin</span>}
          {isSelf && <span className="admin-tag">You</span>}
          {disabled && <span className="admin-tag is-danger">Disabled</span>}
        </strong>
        <span>{user.username}</span>
      </div>
      <dl className="admin-user-stats">
        <div>
          <dt>Joined</dt>
          <dd>{formatJoined(user.created_at)}</dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd className={online ? 'admin-user-online' : undefined}>
            {online ? 'Active now' : formatLastActive(user.last_active_at)}
          </dd>
        </div>
        {live && (
          <div className="admin-user-workout">
            <dt>Live workout</dt>
            <dd>
              {live.name} · {workoutElapsed(live.started_at, now)}
            </dd>
          </div>
        )}
        <div>
          <dt>Signed in on</dt>
          <dd>{plural(user.signed_in_devices, 'device')}</dd>
        </div>
        <div>
          <dt>Workouts</dt>
          <dd>{user.workouts}</dd>
        </div>
        <div>
          <dt>Photos</dt>
          <dd>
            {user.photos} · {formatBytes(user.photo_bytes)}
          </dd>
        </div>
        <div>
          <dt>Video sessions</dt>
          <dd>{user.video_sessions}</dd>
        </div>
      </dl>
      {!isSelf &&
        (disabled ? (
          <button
            type="button"
            className="profile-secondary"
            disabled={busy}
            onClick={() => void onDisabledChange(user, false)}
          >
            {busy ? 'Enabling…' : 'Enable account'}
          </button>
        ) : (
          <InlineConfirmButton
            label="Disable account"
            confirmLabel="Disable and sign out"
            workingLabel="Disabling…"
            className="profile-danger"
            disabled={busy}
            onConfirm={() => onDisabledChange(user, true)}
          />
        ))}
    </li>
  );
}

function FeedbackRow({
  item,
  busy,
  onResolvedChange,
}: {
  item: AppFeedback;
  busy: boolean;
  onResolvedChange?: (item: AppFeedback, resolved: boolean) => void;
}) {
  const resolved = item.resolved_at !== null;
  return (
    <li className={resolved ? 'is-resolved' : undefined}>
      <strong>@{item.username}</strong>
      <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
      <p>{item.message}</p>
      {resolved && (
        <small className="admin-feedback-resolution">
          Resolved{item.resolved_by && ` by @${item.resolved_by}`} ·{' '}
          <time dateTime={item.resolved_at!}>{new Date(item.resolved_at!).toLocaleString()}</time>
        </small>
      )}
      {onResolvedChange && (
        <button
          type="button"
          className={resolved ? 'profile-secondary' : 'profile-primary'}
          disabled={busy}
          onClick={() => onResolvedChange(item, !resolved)}
        >
          {busy ? 'Saving…' : resolved ? 'Reopen' : 'Resolve'}
        </button>
      )}
    </li>
  );
}

export function AdminScreenView({
  feedback,
  currentUserId,
  users,
  settings,
  status,
  limits,
  loading,
  error,
  notice,
  savingSetting,
  savingLimits,
  busyUserId,
  busyFeedbackId = null,
  onFeedbackResolvedChange,
  onVideoUploadsChange,
  onRegistrationChange,
  onSaveLimits,
  onUserDisabledChange,
  onRefresh,
}: AdminScreenViewProps) {
  const disabledCount = users?.filter((user) => user.disabled_at !== null).length ?? 0;
  const openFeedback = feedback?.filter((item) => item.resolved_at === null).length ?? 0;
  return (
    <section className="settings-screen admin-screen content-page">
      <div aria-live="polite" aria-atomic="true">
        {notice && (
          <p className="notification-setting-status" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {settings && (
        <SwitchesPanel
          settings={settings}
          saving={savingSetting}
          onVideoUploadsChange={onVideoUploadsChange}
          onRegistrationChange={onRegistrationChange}
        />
      )}
      {limits && (
        // Keyed by the saved values, so the form restarts from what the server holds.
        <LimitsPanel
          key={JSON.stringify(limits.values)}
          limits={limits}
          saving={savingLimits}
          onSave={onSaveLimits}
        />
      )}
      {status && <StatusPanel status={status} />}
      {feedback && (
        <section className="settings-panel panel" aria-labelledby="admin-feedback-title">
          <header>
            <div>
              <p className="section-kicker">FROM YOUR USERS</p>
              <h2 id="admin-feedback-title">App feedback</h2>
            </div>
            {openFeedback > 0 && <span className="sharing-state is-on">{openFeedback} open</span>}
          </header>
          <p>
            {feedback.length
              ? 'Open messages first, then the latest resolved ones. Feedback is private to administrators.'
              : 'No feedback yet. Messages sent from Settings or the app guide will appear here.'}
          </p>
          <ul className="admin-feedback-list">
            {feedback.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                busy={busyFeedbackId === item.id}
                onResolvedChange={onFeedbackResolvedChange}
              />
            ))}
          </ul>
        </section>
      )}
      <section className="settings-panel panel" aria-labelledby="admin-users-title">
        <header>
          <div>
            <p className="section-kicker">ACCOUNTS</p>
            <h2 id="admin-users-title">
              {users ? plural(users.length, 'account') : 'Accounts'}
              {disabledCount > 0 && ` · ${disabledCount} disabled`}
            </h2>
          </div>
        </header>
        <p>
          Disabling an account signs it out on every device and blocks sign-in. Its data is kept, so
          enabling it again restores everything.
        </p>
        {users && (
          <ul className="admin-user-list">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUserId}
                busy={busyUserId === user.id}
                onDisabledChange={onUserDisabledChange}
              />
            ))}
          </ul>
        )}
        <button type="button" className="profile-secondary" disabled={loading} onClick={onRefresh}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>
    </section>
  );
}

export function AdminScreen({ active }: { active: boolean }) {
  const { user, updateUser } = useUserSession();
  const { users, setUsers, loadUsers } = useAdminUsers(active && Boolean(user?.is_admin));
  const [feedback, setFeedback] = useState<AppFeedback[] | null>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [limits, setLimits] = useState<AccountLimitsSettings | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyFeedbackId, setBusyFeedbackId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [, nextSettings, nextStatus, nextLimits, nextFeedback] = await Promise.all([
        loadUsers(),
        api.admin.settings(),
        api.admin.status(),
        api.admin.limits(),
        api.admin.feedback(),
      ]);
      setSettings(nextSettings);
      setStatus(nextStatus);
      setLimits(nextLimits);
      setFeedback(nextFeedback);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    // The screen stays mounted while hidden, so reload whenever it is opened again.
    if (active) void load();
  }, [active, load]);

  async function saveSettings(update: Parameters<typeof api.admin.updateSettings>[0]) {
    if (savingSetting) return;
    setSavingSetting(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.admin.updateSettings(update);
      setSettings(saved);
      if (update.video_uploads) {
        // Show or hide the Videos screen for this admin straight away; the switch is already
        // saved, so a failed refresh only delays that until the next sign-in check.
        await api.auth
          .me()
          .then(updateUser)
          .catch(() => undefined);
        const label = VIDEO_UPLOAD_OPTIONS.find((option) => option.value === saved.video_uploads);
        setNotice(`Video uploads: ${label?.label ?? saved.video_uploads}.`);
      } else {
        setNotice(saved.allow_registration ? 'Sign-ups are open.' : 'Sign-ups are closed.');
      }
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setSavingSetting(false);
    }
  }

  async function saveLimits(values: AccountLimits) {
    if (savingLimits) return;
    setSavingLimits(true);
    setError(null);
    setNotice(null);
    try {
      setLimits(await api.admin.updateLimits(values));
      setNotice('Limits saved.');
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setSavingLimits(false);
    }
  }

  async function changeUserDisabled(target: AdminUser, disabled: boolean) {
    setBusyUserId(target.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.admin.setUserDisabled(target.id, disabled);
      setUsers((current) =>
        current ? current.map((row) => (row.id === updated.id ? updated : row)) : current,
      );
      setNotice(
        disabled
          ? `${updated.display_name} is disabled and signed out.`
          : `${updated.display_name} can sign in again.`,
      );
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusyUserId(null);
    }
  }

  async function changeFeedbackResolved(target: AppFeedback, resolved: boolean) {
    if (busyFeedbackId) return;
    setBusyFeedbackId(target.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.admin.setFeedbackResolved(target.id, resolved);
      // Keep the row where it is until the next refresh, so it doesn't jump away mid-review.
      setFeedback((current) =>
        current ? current.map((row) => (row.id === updated.id ? updated : row)) : current,
      );
      setNotice(
        resolved
          ? `Resolved feedback from @${updated.username}.`
          : `Reopened feedback from @${updated.username}.`,
      );
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusyFeedbackId(null);
    }
  }

  if (!user?.is_admin) return null;

  return (
    <AdminScreenView
      feedback={feedback}
      currentUserId={user.id}
      users={users}
      settings={settings}
      status={status}
      limits={limits}
      loading={loading}
      error={error}
      notice={notice}
      savingSetting={savingSetting}
      savingLimits={savingLimits}
      busyUserId={busyUserId}
      busyFeedbackId={busyFeedbackId}
      onFeedbackResolvedChange={(item, resolved) => void changeFeedbackResolved(item, resolved)}
      onVideoUploadsChange={(mode) => void saveSettings({ video_uploads: mode })}
      onSaveLimits={(values) => void saveLimits(values)}
      onRegistrationChange={(open) => void saveSettings({ allow_registration: open })}
      onUserDisabledChange={changeUserDisabled}
      onRefresh={() => void load()}
    />
  );
}
