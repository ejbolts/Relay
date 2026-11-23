import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import {
  accountActivityLabel,
  accountFilterOptions,
  accountLiveWorkout,
  accountOnline,
  accountsTitle,
  accountVersionsLabel,
  afterPasswordReset,
  diskUsedPercent,
  dismissRequestsLabel,
  feedbackResolvedNotice,
  filterAccounts,
  nativeClientLabel,
  registrationSummary,
  replaceAccount,
  settingsSavedNotice,
  userDisabledNotice,
  userSexNotice,
  usernameChangedNotice,
  waitingRequestsLabel,
  type AccountFilter,
} from './adminAccounts';
import { useAdminUsers } from './adminActivity';
import { adminUserRowId, clearAdminAccountFocus, useAdminAccountFocus } from './adminAccountFocus';
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
import { Icon } from './Icon';
import { SEX_LABELS } from './profileDisplay';
import { InlineConfirmButton } from './InlineConfirmButton';
import { motionReduced } from './motion';
import { Toast, useToast } from './Toast';
import { AdminUsernameDialog } from './AdminUsernameDialog';
import type {
  AccountLimits,
  AppFeedback,
  AccountLimitsSettings,
  AdminUser,
  ServerSettings,
  ServerStatus,
  Sex,
  VideoUploadMode,
} from './types';
import { useUserSession } from './userContext';
import './adminScreen.css';

/** A temporary password an admin has just generated; shown once, then discarded. */
export interface TemporaryPasswordReveal {
  userId: string;
  displayName: string;
  password: string;
}

export interface AdminScreenViewProps {
  feedback?: AppFeedback[] | null;
  currentUserId: string;
  users: AdminUser[] | null;
  settings: ServerSettings | null;
  status: ServerStatus | null;
  limits: AccountLimitsSettings | null;
  loading: boolean;
  error: string | null;
  /** Where the error belongs: 'switches', 'limits', 'user:<id>' or 'feedback:<id>'; none for the page. */
  errorScope?: string | null;
  /** A confirmation shown in the top toast. */
  notice: string | null;
  savingSetting: boolean;
  savingLimits: boolean;
  busyUserId: string | null;
  busyFeedbackId?: string | null;
  temporaryPassword: TemporaryPasswordReveal | null;
  onFeedbackResolvedChange?: (item: AppFeedback, resolved: boolean) => void;
  onVideoUploadsChange: (mode: VideoUploadMode) => void;
  onSaveLimits: (values: AccountLimits) => void;
  onRegistrationChange: (open: boolean) => void;
  onUserDisabledChange: (user: AdminUser, disabled: boolean) => Promise<void>;
  onResetPassword: (user: AdminUser) => Promise<void>;
  /** Changes or clears an account's sex; absent hides the control. */
  onUserSexChange?: (user: AdminUser, sex: Sex | null) => void;
  /** Clears the account's waiting password reset and username requests. */
  onRequestDismiss?: (user: AdminUser) => void;
  /** Rejects with the server's error, for the Change username dialog to show. */
  onUsernameChange?: (user: AdminUser, username: string) => Promise<void>;
  onTemporaryPasswordDismiss: () => void;
  onNoticeDismiss?: () => void;
  onRefresh: () => void;
}

function SwitchesPanel({
  settings,
  saving,
  error,
  onVideoUploadsChange,
  onRegistrationChange,
}: {
  settings: ServerSettings;
  saving: boolean;
  error: string | null;
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
          <small>{registrationSummary(settings)}</small>
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
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function LimitsPanel({
  limits,
  saving,
  error,
  onSave,
}: {
  limits: AccountLimitsSettings;
  saving: boolean;
  error: string | null;
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
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
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

function ClientVersionsPanel({ status, now }: { status: ServerStatus; now: number }) {
  const versions = status.client_versions ?? [];
  return (
    <section className="settings-panel panel" aria-labelledby="admin-versions-title">
      <header>
        <div>
          <p className="section-kicker">LAST 30 DAYS</p>
          <h2 id="admin-versions-title">App versions in use</h2>
        </div>
      </header>
      <dl className="admin-stats admin-version-stats">
        {versions.map((usage) => (
          <div key={usage.version ?? 'unreported'}>
            <dt>{usage.version ? `Version ${usage.version}` : 'Not reported'}</dt>
            <dd>
              {plural(usage.users, 'account')} · {plural(usage.sessions, 'device')} ·{' '}
              {formatLastActive(usage.last_seen_at, new Date(now))}
            </dd>
            {usage.native_clients?.map(({ client, sessions }) => (
              <dd key={client}>
                {nativeClientLabel(client)} · {plural(sessions, 'device')}
              </dd>
            ))}
          </div>
        ))}
        {versions.length === 0 && (
          <div>
            <dt>Signed-in devices</dt>
            <dd>None</dd>
          </div>
        )}
        <div>
          <dt>Oldest version that can save</dt>
          <dd>{status.minimum_write_version ?? 'Any'}</dd>
        </div>
      </dl>
    </section>
  );
}

function StatusPanel({ status }: { status: ServerStatus }) {
  const { total_bytes, free_bytes } = status.disk;
  const usedPercent = diskUsedPercent(status.disk);
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

function TemporaryPasswordPanel({
  reveal,
  onDismiss,
}: {
  reveal: TemporaryPasswordReveal;
  onDismiss: () => void;
}) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(reveal.password);
      toast.show('Password copied');
    } catch {
      // The password stays selectable, so it can still be copied by hand.
    }
  }

  return (
    <div
      className="admin-temp-password"
      role="group"
      aria-label={`Temporary password for ${reveal.displayName}`}
    >
      <strong>Temporary password</strong>
      <code>{reveal.password}</code>
      <small>Shown once. {reveal.displayName} must choose a new password after signing in.</small>
      <div className="admin-temp-password-actions">
        <button type="button" className="profile-secondary" onClick={() => void copy()}>
          Copy
        </button>
        <button type="button" className="profile-primary" onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  );
}

function UserRow({
  user,
  now,
  isSelf,
  busy,
  error,
  temporaryPassword,
  onDisabledChange,
  onResetPassword,
  onSexChange,
  onRequestDismiss,
  onUsernameChange,
  onTemporaryPasswordDismiss,
}: {
  user: AdminUser;
  now: number;
  isSelf: boolean;
  busy: boolean;
  error: string | null;
  temporaryPassword: TemporaryPasswordReveal | null;
  onDisabledChange: (user: AdminUser, disabled: boolean) => Promise<void>;
  onResetPassword: (user: AdminUser) => Promise<void>;
  onSexChange?: (user: AdminUser, sex: Sex | null) => void;
  onRequestDismiss?: (user: AdminUser) => void;
  onUsernameChange?: (user: AdminUser, username: string) => Promise<void>;
  onTemporaryPasswordDismiss: () => void;
}) {
  const disabled = user.disabled_at !== null;
  const online = accountOnline(user);
  const live = accountLiveWorkout(user);
  const resetRequestedAt = user.password_reset_requested_at ?? null;
  const usernameRequestedAt = user.username_reminder_requested_at ?? null;
  const requested = Boolean(resetRequestedAt || usernameRequestedAt);
  // Accounts that need something done start open; the rest show one line until tapped.
  const needsAction = Boolean(requested || temporaryPassword || error || busy);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState(false);
  const open = toggled ?? needsAction;
  const detailsId = `${adminUserRowId(user.id)}-details`;
  return (
    <li
      id={adminUserRowId(user.id)}
      tabIndex={-1}
      className={`admin-user ${disabled ? 'is-disabled' : ''} ${requested ? 'has-request' : ''}`}
    >
      <button
        type="button"
        className="admin-user-summary"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setToggled(!open)}
      >
        <span className="admin-user-heading">
          <strong>
            {user.display_name}
            {user.is_admin && <span className="profile-badge">Admin</span>}
            {isSelf && <span className="admin-tag">You</span>}
            {disabled && <span className="admin-tag is-danger">Disabled</span>}
            {resetRequestedAt && <span className="admin-tag is-request">Reset requested</span>}
            {usernameRequestedAt && (
              <span className="admin-tag is-request">Username requested</span>
            )}
            {user.must_change_password && <span className="admin-tag">Temporary password</span>}
          </strong>
          <span>{user.username}</span>
        </span>
        <span className={`admin-user-activity${online ? ' admin-user-online' : ''}`}>
          {accountActivityLabel(user, now)}
        </span>
        <Icon name="chevron-down" />
      </button>
      <div id={detailsId} className="admin-user-details" hidden={!open}>
        <dl className="admin-user-stats">
          {resetRequestedAt && (
            <div className="admin-user-request">
              <dt>Asked for a reset</dt>
              <dd>{formatLastActive(resetRequestedAt, new Date(now))}</dd>
            </div>
          )}
          {usernameRequestedAt && (
            <div className="admin-user-request">
              <dt>Asked for username</dt>
              <dd>{formatLastActive(usernameRequestedAt, new Date(now))}</dd>
            </div>
          )}
          <div>
            <dt>Joined</dt>
            <dd>{formatJoined(user.created_at)}</dd>
          </div>
          <div>
            <dt>Last active</dt>
            <dd className={online ? 'admin-user-online' : undefined}>
              {online ? 'Active now' : formatLastActive(user.last_active_at, new Date(now))}
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
            <dt>App versions</dt>
            <dd>{accountVersionsLabel(user)}</dd>
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
          {onSexChange && (
            <div className="admin-user-sex">
              <dt>
                <label htmlFor={`admin-sex-${user.id}`}>Sex</label>
              </dt>
              <dd>
                <select
                  id={`admin-sex-${user.id}`}
                  value={user.sex ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    onSexChange(
                      user,
                      event.target.value === '' ? null : (event.target.value as Sex),
                    )
                  }
                >
                  <option value="">Not set</option>
                  <option value="male">{SEX_LABELS.male}</option>
                  <option value="female">{SEX_LABELS.female}</option>
                </select>
              </dd>
            </div>
          )}
        </dl>
        {temporaryPassword && (
          <TemporaryPasswordPanel
            reveal={temporaryPassword}
            onDismiss={onTemporaryPasswordDismiss}
          />
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {(!isSelf || onUsernameChange || (requested && onRequestDismiss)) && (
          <div className="admin-user-actions">
            {!isSelf && (
              <InlineConfirmButton
                label="Reset password"
                confirmLabel="Reset and sign out"
                workingLabel="Resetting…"
                confirmationMessage="Signs them out everywhere. They choose a new password at next sign-in."
                className={resetRequestedAt ? 'profile-primary' : 'profile-secondary'}
                size="default"
                disabled={busy}
                onConfirm={() => onResetPassword(user)}
              />
            )}
            {onUsernameChange && (
              <button
                type="button"
                className="profile-secondary"
                disabled={busy}
                onClick={() => setRenaming(true)}
              >
                Change username
              </button>
            )}
            {requested && onRequestDismiss && (
              <button
                type="button"
                className="profile-secondary"
                disabled={busy}
                onClick={() => onRequestDismiss(user)}
              >
                {dismissRequestsLabel(user)}
              </button>
            )}
            {isSelf ? null : disabled ? (
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
                confirmationMessage="Signs them out everywhere and blocks sign-in. Their data is kept, so enabling the account restores everything."
                className="profile-danger"
                size="default"
                disabled={busy}
                onConfirm={() => onDisabledChange(user, true)}
              />
            )}
          </div>
        )}
      </div>
      {renaming && onUsernameChange && (
        <AdminUsernameDialog
          user={user}
          onSave={async (username) => {
            await onUsernameChange(user, username);
            setRenaming(false);
          }}
          onClose={() => setRenaming(false)}
        />
      )}
    </li>
  );
}

function AccountsPanel({
  users,
  now,
  currentUserId,
  loading,
  busyUserId,
  error,
  errorScope,
  temporaryPassword,
  onRefresh,
  onUserDisabledChange,
  onResetPassword,
  onUserSexChange,
  onRequestDismiss,
  onUsernameChange,
  onTemporaryPasswordDismiss,
}: Pick<
  AdminScreenViewProps,
  | 'currentUserId'
  | 'loading'
  | 'busyUserId'
  | 'error'
  | 'errorScope'
  | 'temporaryPassword'
  | 'onRefresh'
  | 'onUserDisabledChange'
  | 'onResetPassword'
  | 'onUserSexChange'
  | 'onRequestDismiss'
  | 'onUsernameChange'
  | 'onTemporaryPasswordDismiss'
> & { users: AdminUser[] | null; now: number }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AccountFilter | null>(null);
  const waitingRequests = waitingRequestsLabel(users);
  // Only offer filters that would find someone, and keep a chosen one until it is cleared.
  const filters = accountFilterOptions(users, filter);
  const shown = filterAccounts(users, query, filter);
  return (
    <section className="settings-panel panel admin-accounts" aria-labelledby="admin-users-title">
      <header>
        <div>
          <p className="section-kicker">ACCOUNTS</p>
          <h2 id="admin-users-title">{accountsTitle(users)}</h2>
        </div>
        {waitingRequests && <span className="sharing-state is-on">{waitingRequests}</span>}
        <button
          type="button"
          className="icon-button-pulse admin-refresh"
          aria-label={loading ? 'Refreshing' : 'Refresh'}
          disabled={loading}
          onClick={onRefresh}
        >
          <Icon name="reset" />
        </button>
      </header>
      {users && users.length > 1 && (
        <div className="admin-account-tools">
          <label className="admin-account-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              autoComplete="off"
              aria-label="Search accounts"
              placeholder="Search name or username"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {filters.length > 0 && (
            <div className="admin-account-filters" role="group" aria-label="Show only">
              {filters.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(filter === option.id ? null : option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {shown && (
        <ul className="admin-user-list">
          {shown.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              now={now}
              isSelf={user.id === currentUserId}
              busy={busyUserId === user.id}
              error={errorScope === `user:${user.id}` ? error : null}
              temporaryPassword={temporaryPassword?.userId === user.id ? temporaryPassword : null}
              onDisabledChange={onUserDisabledChange}
              onResetPassword={onResetPassword}
              onSexChange={onUserSexChange}
              onRequestDismiss={onRequestDismiss}
              onUsernameChange={onUsernameChange}
              onTemporaryPasswordDismiss={onTemporaryPasswordDismiss}
            />
          ))}
        </ul>
      )}
      {shown?.length === 0 && <p className="admin-accounts-empty">No accounts match.</p>}
    </section>
  );
}

function FeedbackRow({
  item,
  busy,
  error,
  onResolvedChange,
}: {
  item: AppFeedback;
  busy: boolean;
  error: string | null;
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
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
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
  errorScope = null,
  notice,
  savingSetting,
  savingLimits,
  busyUserId,
  busyFeedbackId = null,
  temporaryPassword,
  onFeedbackResolvedChange,
  onVideoUploadsChange,
  onRegistrationChange,
  onSaveLimits,
  onUserDisabledChange,
  onResetPassword,
  onUserSexChange,
  onRequestDismiss,
  onUsernameChange,
  onTemporaryPasswordDismiss,
  onNoticeDismiss,
  onRefresh,
}: AdminScreenViewProps) {
  const now = useNow(users !== null, 60_000);
  const openFeedback = feedback?.filter((item) => item.resolved_at === null).length ?? 0;
  const scoped = (scope: string) => (errorScope === scope ? error : null);
  const usedPercent = status?.disk.total_bytes ? diskUsedPercent(status.disk) : null;
  return (
    <section className="settings-screen admin-screen content-page">
      {error && errorScope === null && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <AccountsPanel
        users={users}
        now={now}
        currentUserId={currentUserId}
        loading={loading}
        busyUserId={busyUserId}
        error={error}
        errorScope={errorScope}
        temporaryPassword={temporaryPassword}
        onRefresh={onRefresh}
        onUserDisabledChange={onUserDisabledChange}
        onResetPassword={onResetPassword}
        onUserSexChange={onUserSexChange}
        onRequestDismiss={onRequestDismiss}
        onUsernameChange={onUsernameChange}
        onTemporaryPasswordDismiss={onTemporaryPasswordDismiss}
      />
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
                error={scoped(`feedback:${item.id}`)}
                onResolvedChange={onFeedbackResolvedChange}
              />
            ))}
          </ul>
        </section>
      )}
      {settings && (
        <SwitchesPanel
          settings={settings}
          saving={savingSetting}
          error={scoped('switches')}
          onVideoUploadsChange={onVideoUploadsChange}
          onRegistrationChange={onRegistrationChange}
        />
      )}
      {(limits || status) && (
        // Limits, storage and versions are checked now and then, so they stay folded away.
        <details className="admin-server" open={errorScope === 'limits' || undefined}>
          <summary>
            <span>
              <strong>Server</strong>
              {usedPercent !== null && <small>{usedPercent}% disk used</small>}
            </span>
            <Icon name="chevron-down" />
          </summary>
          {limits && (
            // Keyed by the saved values, so the form restarts from what the server holds.
            <LimitsPanel
              key={JSON.stringify(limits.values)}
              limits={limits}
              saving={savingLimits}
              error={scoped('limits')}
              onSave={onSaveLimits}
            />
          )}
          {status && <StatusPanel status={status} />}
          {status && <ClientVersionsPanel status={status} now={now} />}
        </details>
      )}
      {notice && (
        <Toast id={notice} message={notice} onDismiss={onNoticeDismiss ?? (() => undefined)} />
      )}
    </section>
  );
}

export function AdminScreen({ active }: { active: boolean }) {
  const { user, updateUser } = useUserSession();
  const { users, setUsers, loadUsers, snapshots } = useAdminUsers(
    active && Boolean(user?.is_admin),
  );
  const [feedback, setFeedback] = useState<AppFeedback[] | null>(null);
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [limits, setLimits] = useState<AccountLimitsSettings | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; scope: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyFeedbackId, setBusyFeedbackId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<TemporaryPasswordReveal | null>(null);
  const focus = useAdminAccountFocus();
  const focusAfter = useRef<{ key: number; snapshots: number } | null>(null);

  useEffect(() => {
    // A temporary password is only kept in memory while this screen is in view.
    if (!active) setTemporaryPassword(null);
  }, [active]);

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
      setError({ message: authErrorMessage(reason), scope: null });
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    // An account opened from a notification. This runs before the reload below, so it waits for
    // a list applied after the request, where the account's request shows and the order is final,
    // and for the panels above it to load, so they do not push the card back out of view.
    if (!active || !focus) return;
    if (focusAfter.current?.key !== focus.key) {
      focusAfter.current = { key: focus.key, snapshots };
    }
    if (loading || snapshots <= focusAfter.current.snapshots) return;
    const row = document.getElementById(adminUserRowId(focus.userId));
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: motionReduced() ? 'auto' : 'smooth' });
      row.focus({ preventScroll: true });
    }
    clearAdminAccountFocus(focus.key);
  }, [active, focus, loading, snapshots]);

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
      }
      setNotice(settingsSavedNotice(update, saved));
    } catch (reason) {
      setError({ message: authErrorMessage(reason), scope: 'switches' });
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
      setError({ message: authErrorMessage(reason), scope: 'limits' });
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
      setUsers((current) => replaceAccount(current, updated) ?? current);
      setNotice(userDisabledNotice(updated, disabled));
    } catch (reason) {
      setError({ message: authErrorMessage(reason), scope: `user:${target.id}` });
    } finally {
      setBusyUserId(null);
    }
  }

  async function changeUserSex(target: AdminUser, sex: Sex | null) {
    setBusyUserId(target.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.admin.setUserSex(target.id, sex);
      setUsers((current) => replaceAccount(current, updated) ?? current);
      setNotice(userSexNotice(updated, sex));
    } catch (reason) {
      setError({ message: authErrorMessage(reason), scope: `user:${target.id}` });
    } finally {
      setBusyUserId(null);
    }
  }

  async function resetUserPassword(target: AdminUser) {
    setBusyUserId(target.id);
    setError(null);
    setNotice(null);
    setTemporaryPassword(null);
    try {
      const { temporary_password } = await api.admin.resetUserPassword(target.id);
      setUsers((current) =>
        current
          ? current.map((row) => (row.id === target.id ? afterPasswordReset(row) : row))
          : current,
      );
      setTemporaryPassword({
        userId: target.id,
        displayName: target.display_name,
        password: temporary_password,
      });
    } catch (reason) {
      setError({ message: authErrorMessage(reason), scope: `user:${target.id}` });
    } finally {
      setBusyUserId(null);
    }
  }

  async function changeUsername(target: AdminUser, username: string) {
    setBusyUserId(target.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.admin.setUserUsername(target.id, username);
      setUsers((current) => replaceAccount(current, updated) ?? current);
      setNotice(usernameChangedNotice(updated));
    } finally {
      setBusyUserId(null);
    }
  }

  async function dismissRequests(target: AdminUser) {
    setBusyUserId(target.id);
    setError(null);
    setNotice(null);
    // The tag and the header count clear; the card keeps its place until the next refresh.
    const clear = (fields: Partial<AdminUser>) =>
      setUsers((current) =>
        current
          ? current.map((row) => (row.id === target.id ? { ...row, ...fields } : row))
          : current,
      );
    try {
      if (target.password_reset_requested_at) {
        await api.admin.dismissPasswordResetRequest(target.id);
        clear({ password_reset_requested_at: null });
      }
      if (target.username_reminder_requested_at) {
        await api.admin.dismissUsernameReminderRequest(target.id);
        clear({ username_reminder_requested_at: null });
      }
    } catch (reason) {
      setError({ message: authErrorMessage(reason), scope: `user:${target.id}` });
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
      setNotice(feedbackResolvedNotice(updated, resolved));
    } catch (reason) {
      setError({ message: authErrorMessage(reason), scope: `feedback:${target.id}` });
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
      error={error?.message ?? null}
      errorScope={error?.scope ?? null}
      notice={notice}
      savingSetting={savingSetting}
      savingLimits={savingLimits}
      busyUserId={busyUserId}
      busyFeedbackId={busyFeedbackId}
      temporaryPassword={temporaryPassword}
      onFeedbackResolvedChange={(item, resolved) => void changeFeedbackResolved(item, resolved)}
      onVideoUploadsChange={(mode) => void saveSettings({ video_uploads: mode })}
      onSaveLimits={(values) => void saveLimits(values)}
      onRegistrationChange={(open) => void saveSettings({ allow_registration: open })}
      onUserDisabledChange={changeUserDisabled}
      onResetPassword={resetUserPassword}
      onUserSexChange={(target, sex) => void changeUserSex(target, sex)}
      onRequestDismiss={(target) => void dismissRequests(target)}
      onUsernameChange={changeUsername}
      onTemporaryPasswordDismiss={() => setTemporaryPassword(null)}
      onNoticeDismiss={() => setNotice(null)}
      onRefresh={() => void load()}
    />
  );
}
