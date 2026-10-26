import { useWeightUnit } from './trainingPreferencesContext';
import { bodyGoalKind } from './bodyMeasurementHistory';
import { formatWeight, weightFromKg, type WeightUnit } from './weightUnits';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { authErrorMessage } from './authForm';
import { clipBodyWeightGoalPath } from './bodyTrend';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileAccountId } from './ProfileAccountId';
import { ProfileIdentity } from './ProfileIdentity';
import { ProfileCardioCard } from './ProfileCardioCard';
import { SharedWorkoutFilters } from './SharedWorkoutFilters';
import { ConsistencyCard } from './ConsistencyCard';
import { WorkoutCalendar, WorkoutCalendarLegend } from './WorkoutCalendar';
import { builtinTypeColors, calendarLegendTypes } from './workoutTypes';
import { TrainingTimeCard } from './TrainingTimeStats';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import { PopupDialog } from './PopupDialog';
import { formatMemberSince } from './profileDisplay';
import { TrendChart, type GoalPath } from './PulseCharts';
import type { FriendConnectionsState } from './friendConnections';
import {
  friendStatusLabel,
  plural,
  SHARED_WORKOUT_PAGE_SIZE,
  sinceMonthLabel,
} from './sharedProfileDisplay';
import { addDays, dayMonth, parseLocalDate } from './trainingSummary';
import type {
  FriendConnections,
  FriendStatus,
  MachinePhoto,
  PersonalRecord,
  SharedBodyMeasurement,
  SharedGoals,
  SharedProfile,
  SharedProfileSummary,
  SharedConsistency,
  SharedWorkoutFilters as WorkoutFilters,
  SharedWorkoutFilterOptions,
  SharingConnection,
  TrackedWorkout,
  WorkoutReactions,
  User,
} from './types';

const BODY_WEIGHT_CHART_DAYS = 90;

type LoadState = 'loading' | 'ready' | 'locked' | 'missing' | 'blocked' | 'error';

function loadStateFor(reason: unknown): LoadState {
  if (reason instanceof ApiError && reason.code === 'sharing_required') return 'locked';
  if (reason instanceof ApiError && reason.status === 404) return 'missing';
  return 'error';
}

function longDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function avatarUser(member: { display_name: string; profile_photo_url: string | null }) {
  return {
    display_name: member.display_name,
    username: '',
    profile_photo_url: member.profile_photo_url,
  };
}

export function SharingLocked({ onChooseSharing }: { onChooseSharing: () => void }) {
  return (
    <section className="settings-panel panel sharing-locked" aria-labelledby="sharing-locked-title">
      <header>
        <div>
          <p className="section-kicker">SHARING</p>
          <h2 id="sharing-locked-title">Share your profile to see others</h2>
        </div>
      </header>
      <p>
        Your profile is private. Share it with friends or everyone in Settings to see and add other
        members as friends; your workouts and profile photo are always part of it.
      </p>
      <button type="button" className="profile-primary" onClick={onChooseSharing}>
        Choose who can see your profile
      </button>
    </section>
  );
}

export function LoadProblem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="settings-panel panel">
      <p className="inline-error" role="alert">
        {message}
      </p>
      <button type="button" className="profile-secondary" onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}

/** A search result's friend action: Add friend, Accept, Cancel request, or a Friends label. */
function FriendButton({
  profile,
  onChange,
}: {
  profile: SharedProfileSummary;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (profile.is_you) return null;
  if (profile.friend_status === 'friends') {
    return (
      <span className="friend-status-label">
        <Icon name="check" /> Friends
      </span>
    );
  }
  const action = {
    none: { label: 'Add friend', primary: true, run: () => api.sharing.addFriend(profile.id) },
    incoming: { label: 'Accept', primary: true, run: () => api.sharing.acceptFriend(profile.id) },
    outgoing: {
      label: 'Cancel request',
      primary: false,
      run: () => api.sharing.removeFriend(profile.id),
    },
  }[profile.friend_status];

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action.run();
      onChange();
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shared-follow compact">
      <button
        type="button"
        className={action.primary ? 'profile-primary' : 'profile-secondary'}
        disabled={busy}
        aria-label={`${action.label}: ${profile.display_name}`}
        onClick={() => void run()}
      >
        {busy && <span className="auth-spinner" aria-hidden="true" />}
        <span>{action.label}</span>
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A profile page's friend control: Add friend, Accept or Decline, or Requested and Friends pills.
 * Its menu cancels a request, removes a friend or blocks the member.
 */
function ProfileFriendControl({
  profile,
  onChange,
  onBlocked,
}: {
  profile: SharedProfileSummary;
  onChange: (status: FriendStatus) => void;
  onBlocked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (profile.is_you) return null;
  const status = profile.friend_status;
  const since = status === 'friends' ? sinceMonthLabel(profile.friends_since) : null;
  const pill = status === 'friends' ? 'Friends' : status === 'outgoing' ? 'Requested' : null;
  const spinner = <span className="auth-spinner" aria-hidden="true" />;

  async function run(action: () => Promise<FriendStatus>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setOpen(false);
      onChange(next);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const add = () => run(async () => (await api.sharing.addFriend(profile.id)).status);
  const accept = () => run(async () => (await api.sharing.acceptFriend(profile.id)).status);
  const remove = () =>
    run(async () => {
      await api.sharing.removeFriend(profile.id);
      return 'none';
    });

  async function block() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sharing.blockMember(profile.id);
      setConfirmBlock(false);
      onBlocked();
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shared-follow profile-follow">
      <div className="profile-friend-actions">
        {status === 'none' && (
          <button
            type="button"
            className="profile-follow-button is-follow"
            disabled={busy}
            onClick={() => void add()}
          >
            {busy && spinner}
            <span>Add friend</span>
          </button>
        )}
        {status === 'incoming' && (
          <>
            <button
              type="button"
              className="profile-follow-button is-follow"
              disabled={busy}
              onClick={() => void accept()}
            >
              {busy && spinner}
              <span>Accept</span>
            </button>
            <button
              type="button"
              className="profile-follow-button"
              disabled={busy}
              onClick={() => void remove()}
            >
              <span>Decline</span>
            </button>
          </>
        )}
        <div className="profile-follow-menu-wrap">
          <button
            ref={trigger}
            type="button"
            className={`profile-follow-button${pill ? '' : ' is-more'}`}
            disabled={busy}
            aria-label={pill ? undefined : `More options for ${profile.display_name}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            onClick={() => {
              setError(null);
              setOpen(!open);
            }}
          >
            {pill ? (
              <>
                {busy ? spinner : status === 'friends' && <Icon name="check" />}
                <span>{pill}</span>
                <Icon name="chevron-down" />
              </>
            ) : (
              <Icon name="more" />
            )}
          </button>
          {open && (
            <div ref={menu} id={menuId} className="profile-follow-menu" role="menu">
              {since && <p>{since}</p>}
              {status === 'friends' && (
                <button type="button" role="menuitem" disabled={busy} onClick={() => void remove()}>
                  Remove friend
                </button>
              )}
              {status === 'outgoing' && (
                <button type="button" role="menuitem" disabled={busy} onClick={() => void remove()}>
                  Cancel request
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setConfirmBlock(true);
                }}
              >
                Block
              </button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {confirmBlock && (
        <PopupDialog
          title={`Block ${profile.display_name}?`}
          className="friend-block-dialog"
          onClose={() => setConfirmBlock(false)}
        >
          <p>
            They will no longer find you or see your profile, data and activity, and you stop being
            friends. You can unblock them in Social, under Find.
          </p>
          <div className="friend-block-actions">
            <button
              type="button"
              className="profile-secondary"
              onClick={() => setConfirmBlock(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="profile-danger"
              disabled={busy}
              onClick={() => void block()}
            >
              Block
            </button>
          </div>
        </PopupDialog>
      )}
    </div>
  );
}

function FriendRow({
  person,
  detail,
  onOpen,
  actions,
}: {
  person: { display_name: string; profile_photo_url: string | null };
  detail: string;
  onOpen?: () => void;
  actions?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className="friend-open"
        disabled={!onOpen}
        aria-label={onOpen ? `Open ${person.display_name}'s profile` : undefined}
        onClick={onOpen}
      >
        <ProfileAvatar className="shared-profile-avatar small" user={avatarUser(person)} />
        <span className="shared-connection-copy">
          <strong>{person.display_name}</strong>
          <small>{detail}</small>
        </span>
        {onOpen && !actions && <Icon name="chevron-right" />}
      </button>
      {actions && <span className="shared-connection-actions">{actions}</span>}
    </li>
  );
}

function FriendGroup({
  title,
  count,
  highlighted = false,
  children,
}: {
  title: string;
  count?: number;
  highlighted?: boolean;
  children: ReactNode[];
}) {
  return (
    <div className={`friend-group${highlighted ? ' friend-requests' : ''}`}>
      <h3>
        {title}
        {count !== undefined && <span>{count}</span>}
      </h3>
      <ul>{children}</ul>
    </div>
  );
}

export function PeopleSearch({
  active,
  refreshKey,
  onOpenProfile,
  onFriendChanged,
}: {
  active: boolean;
  refreshKey: string;
  onOpenProfile: (profile: SharedProfileSummary) => void;
  onFriendChanged: () => void;
}) {
  const id = useId();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState({ term: '', serial: 0 });
  const [results, setResults] = useState<SharedProfileSummary[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !submitted.term) return;
    let cancelled = false;
    setState('loading');
    setError(null);
    api.sharing
      .profiles(submitted.term)
      .then((profiles) => {
        if (cancelled) return;
        setResults(profiles.filter((profile) => !profile.is_you));
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(authErrorMessage(reason));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [active, submitted, refreshKey]);
  return (
    <div className="friend-group people-search">
      <h3>Search people</h3>
      <form
        className="people-search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim())
            setSubmitted((current) => ({ term: input.trim(), serial: current.serial + 1 }));
        }}
      >
        <label className="sr-only" htmlFor={id}>
          Account name or UUID
        </label>
        <input
          id={id}
          type="search"
          value={input}
          maxLength={100}
          autoComplete="off"
          placeholder="Account name or UUID"
          onChange={(event) => {
            const next = event.target.value;
            setInput(next);
            if (!next.trim()) {
              setSubmitted((current) => ({ term: '', serial: current.serial + 1 }));
              setResults([]);
              setState('idle');
              setError(null);
            }
          }}
        />
        <button
          type="submit"
          className="profile-primary"
          disabled={!input.trim() || (state === 'loading' && input.trim() === submitted.term)}
          aria-busy={state === 'loading'}
        >
          <Icon name="search" /> Search
        </button>
      </form>
      <p className="shared-card-empty">
        Search by display name, username or full UUID. Only shared profiles appear.
      </p>
      {state === 'loading' && (
        <p className="sharing-loading" role="status">
          Searching…
        </p>
      )}
      {state === 'error' && (
        <div className="sharing-load-error">
          <p className="inline-error" role="alert">
            {error ?? 'Could not search people.'}
          </p>
          <button
            type="button"
            className="profile-secondary"
            onClick={() => setSubmitted((current) => ({ ...current, serial: current.serial + 1 }))}
          >
            Try again
          </button>
        </div>
      )}
      {state === 'ready' && (
        <>
          <p className="people-search-summary" role="status">
            {results.length} {results.length === 1 ? 'account' : 'accounts'} found for “
            {submitted.term}”.
          </p>
          {results.length === 0 ? (
            <p className="shared-card-empty">No shared accounts found. Check the name or UUID.</p>
          ) : (
            <ul>
              {results.map((profile) => (
                <FriendRow
                  key={profile.id}
                  person={profile}
                  detail={friendStatusLabel(profile)}
                  onOpen={() => onOpenProfile(profile)}
                  actions={<FriendButton profile={profile} onChange={onFriendChanged} />}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Social's Find tab: requests waiting for you, people search, your requests and blocks. */
export function FindPanel({
  active,
  connections,
  state,
  error,
  onRetry,
  onChanged,
  onOpenProfile,
  onChooseSharing,
}: {
  active: boolean;
  connections: FriendConnections | null;
  state: FriendConnectionsState;
  error: string | null;
  onRetry: () => void;
  onChanged: () => void;
  onOpenProfile: (profile: Pick<SharedProfileSummary, 'id' | 'display_name'>) => void;
  onChooseSharing: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);

  function blockedGroup(blocked: SharingConnection[]) {
    return (
      <FriendGroup title="Blocked" count={blocked.length}>
        {blocked.map((person) => (
          <FriendRow
            key={person.id}
            person={person}
            detail={`Blocked ${longDate(person.since.slice(0, 10))}`}
            actions={
              <button
                type="button"
                className="profile-secondary"
                disabled={busyId !== null}
                aria-label={`Unblock ${person.display_name}`}
                onClick={() => void respond(person, 'unblock')}
              >
                Unblock
              </button>
            }
          />
        ))}
      </FriendGroup>
    );
  }

  async function respond(person: SharingConnection, action: 'accept' | 'remove' | 'unblock') {
    if (busyId) return;
    setBusyId(person.id);
    setActionError(null);
    try {
      if (action === 'accept') await api.sharing.acceptFriend(person.id);
      else if (action === 'unblock') await api.sharing.unblockMember(person.id);
      else await api.sharing.removeFriend(person.id);
      onChanged();
      setSearchVersion((version) => version + 1);
    } catch (reason) {
      setActionError(authErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  if (!connections || state === 'locked') {
    if (state === 'locked') {
      return (
        <>
          <SharingLocked onChooseSharing={onChooseSharing} />
          {(connections?.blocked.length ?? 0) > 0 && (
            <section className="settings-panel panel sharing-connections find-panel">
              {actionError && (
                <p className="inline-error" role="alert">
                  {actionError}
                </p>
              )}
              {blockedGroup(connections!.blocked)}
            </section>
          )}
        </>
      );
    }
    return state === 'error' ? (
      <LoadProblem message={error ?? 'Could not load your friends.'} onRetry={onRetry} />
    ) : (
      <p className="sharing-loading" role="status">
        Loading friend requests…
      </p>
    );
  }
  const open = (person: SharingConnection) => () => onOpenProfile(person);
  const people = [
    ...connections.friends,
    ...connections.requests,
    ...connections.sent,
    ...connections.blocked,
  ];
  return (
    <section
      className="settings-panel panel sharing-connections find-panel"
      aria-label="Find friends"
    >
      {actionError && (
        <p className="inline-error" role="alert">
          {actionError}
        </p>
      )}
      {connections.requests.length > 0 && (
        <FriendGroup title="Friend requests" count={connections.requests.length} highlighted>
          {connections.requests.map((person) => (
            <FriendRow
              key={person.id}
              person={person}
              detail={`Asked ${longDate(person.since.slice(0, 10))}`}
              onOpen={open(person)}
              actions={
                <>
                  <button
                    type="button"
                    className="profile-primary"
                    disabled={busyId !== null}
                    aria-label={`Accept ${person.display_name}`}
                    onClick={() => void respond(person, 'accept')}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="profile-secondary"
                    disabled={busyId !== null}
                    aria-label={`Decline ${person.display_name}`}
                    onClick={() => void respond(person, 'remove')}
                  >
                    Decline
                  </button>
                </>
              }
            />
          ))}
        </FriendGroup>
      )}
      <PeopleSearch
        active={active}
        refreshKey={`${searchVersion}:${people.map((person) => person.id).join(',')}`}
        onOpenProfile={onOpenProfile}
        onFriendChanged={onChanged}
      />
      {connections.sent.length > 0 && (
        <FriendGroup title="Sent requests" count={connections.sent.length}>
          {connections.sent.map((person) => (
            <FriendRow
              key={person.id}
              person={person}
              detail={`Sent ${longDate(person.since.slice(0, 10))}`}
              onOpen={open(person)}
              actions={
                <button
                  type="button"
                  className="profile-secondary"
                  disabled={busyId !== null}
                  aria-label={`Cancel request to ${person.display_name}`}
                  onClick={() => void respond(person, 'remove')}
                >
                  Cancel
                </button>
              }
            />
          ))}
        </FriendGroup>
      )}
      {connections.blocked.length > 0 && blockedGroup(connections.blocked)}
    </section>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      className="shared-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

/** The goal line within the charted dates, labelled like the Body screen's. */
function bodyWeightGoalPath(
  goals: SharedGoals | null,
  startDate: string,
  endDate: string,
  weightUnit: WeightUnit,
): GoalPath | null {
  const goal = goals?.body_weight;
  const clipped = goal ? clipBodyWeightGoalPath(goal, startDate, endDate) : null;
  if (!goal || !clipped) return null;
  return {
    startDate: clipped.start_date,
    startValue: weightFromKg(clipped.start_weight_kg, weightUnit),
    endDate: clipped.target_date,
    endValue: weightFromKg(clipped.target_weight_kg, weightUnit),
    label: `Goal ${formatWeight(goal.target_weight_kg, weightUnit)}`,
  };
}

function BodyWeightCard({
  measurements,
  goals,
}: {
  measurements: SharedBodyMeasurement[];
  goals: SharedGoals | null;
}) {
  const weightUnit = useWeightUnit();
  const latest = measurements[0];
  const recent = useMemo(() => {
    if (!latest) return [];
    const earliest = addDays(latest.measurement_date, -BODY_WEIGHT_CHART_DAYS);
    return measurements
      .filter((item) => item.measurement_date >= earliest)
      .map((item) => ({ date: item.measurement_date, value: item.weight_kg }))
      .reverse();
  }, [latest, measurements]);
  const latestFat = measurements.find((item) => item.body_fat_pct !== null)?.body_fat_pct ?? null;
  const change = recent.length > 1 ? recent[recent.length - 1].value - recent[0].value : null;

  return (
    <section className="pulse-card shared-card" aria-labelledby="shared-body-weight-title">
      <header className="pulse-card-header">
        <h2 id="shared-body-weight-title">Body weight</h2>
        {latest && <span>{dayMonth(latest.measurement_date)}</span>}
      </header>
      {!latest ? (
        <p className="shared-card-empty">No weigh-ins yet.</p>
      ) : (
        <>
          <dl className="shared-stat-row">
            <div>
              <dt>Latest</dt>
              <dd className="num">{formatWeight(latest.weight_kg, weightUnit, 1)}</dd>
            </div>
            {change !== null && (
              <div>
                <dt>{BODY_WEIGHT_CHART_DAYS} days</dt>
                <dd className="num">
                  {change > 0 ? '+' : change < 0 ? '−' : ''}
                  {formatWeight(Math.abs(change), weightUnit, 1)}
                </dd>
              </div>
            )}
            {latestFat !== null && (
              <div>
                <dt>Body fat</dt>
                <dd className="num">{latestFat}%</dd>
              </div>
            )}
          </dl>
          {recent.length > 1 && (
            <TrendChart
              points={recent.map((point) => ({
                ...point,
                value: weightFromKg(point.value, weightUnit),
              }))}
              label={`Body weight over the last ${BODY_WEIGHT_CHART_DAYS} days`}
              seriesLabel="Body weight"
              unit={weightUnit}
              area={false}
              goalPath={bodyWeightGoalPath(
                goals,
                recent[0].date,
                recent[recent.length - 1].date,
                weightUnit,
              )}
              height={170}
            />
          )}
        </>
      )}
    </section>
  );
}

function GoalsCard({ goals, latestWeight }: { goals: SharedGoals; latestWeight: number | null }) {
  const weightUnit = useWeightUnit();
  const goal = goals.body_weight;
  const span =
    goal && bodyGoalKind(goal) !== 'maintain' ? goal.start_weight_kg - goal.target_weight_kg : 0;
  const progress =
    goal && latestWeight !== null && span !== 0
      ? (goal.start_weight_kg - latestWeight) / span
      : null;

  return (
    <section className="pulse-card shared-card" aria-labelledby="shared-goals-title">
      <header className="pulse-card-header">
        <h2 id="shared-goals-title">Goals</h2>
      </header>
      <div className="shared-goal">
        <strong>Body weight</strong>
        {goal ? (
          <>
            <span>
              {bodyGoalKind(goal) === 'maintain'
                ? `Maintain ${formatWeight(goal.target_weight_kg, weightUnit, 1)} until ${longDate(goal.target_date)}`
                : `${formatWeight(goal.start_weight_kg, weightUnit, 1)} → ${formatWeight(goal.target_weight_kg, weightUnit, 1)} by ${longDate(goal.target_date)}`}
            </span>
            {progress !== null && (
              <>
                <ProgressBar value={progress} label="Body-weight goal progress" />
                <small>{Math.round(Math.min(Math.max(progress, 0), 1) * 100)}% of the way</small>
              </>
            )}
          </>
        ) : (
          <span>No body-weight goal set.</span>
        )}
      </div>
      <div className="shared-goal">
        <strong>Weekly Zone 2 cardio</strong>
        <span>
          {goals.zone2.completed_minutes} of {goals.zone2.goal_minutes} min this week
        </span>
        <ProgressBar value={goals.zone2.percentage / 100} label="Weekly Zone 2 cardio progress" />
      </div>
    </section>
  );
}

export interface SharedWorkoutListProps {
  workouts: TrackedWorkout[];
  personalRecords: PersonalRecord[];
  onFilterMachine?: (photo: MachinePhoto) => void;
  renderWorkoutAction?: (workout: TrackedWorkout) => ReactNode;
}

function SharedConsistencyCalendar({
  data,
  onDayClick,
}: {
  data: SharedConsistency;
  onDayClick: (date: string) => void;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const colors = builtinTypeColors(data.workout_types);
  return (
    <ConsistencyCard streak={data.current_streak} trainingDays={data.training_days}>
      <WorkoutCalendar
        entries={data.heatmap}
        types={data.workout_types}
        categoryColors={colors}
        hiddenCategories={hidden}
        readOnly
        onDayClick={onDayClick}
      />
      <WorkoutCalendarLegend
        presentTypes={calendarLegendTypes(data.heatmap, data.workout_types)}
        hiddenCategories={hidden}
        categoryColors={colors}
        onToggle={(id) =>
          setHidden((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
      />
    </ConsistencyCard>
  );
}

function ProfileStats({ profile }: { profile: SharedProfile }) {
  if (!profile.can_view) return null;
  return (
    <dl className="shared-stat-row">
      <div>
        <dt>Workouts</dt>
        <dd className="num">{(profile.workout_count ?? 0).toLocaleString('en-GB')}</dd>
      </div>
      <div>
        <dt>Last 30 days</dt>
        <dd className="num">{profile.recent_workout_count ?? 0}</dd>
      </div>
      <div>
        <dt>Last workout</dt>
        <dd className="num">
          {profile.last_workout_date ? dayMonth(profile.last_workout_date) : '–'}
        </dd>
      </div>
    </dl>
  );
}

export function SharedProfileScreen({
  onOpenMember,
  dataRevision = null,
  profileId,
  renderWorkouts,
  onChooseSharing,
  active = true,
  ownProfile,
}: {
  onOpenMember?: (person: { id: string; display_name: string }) => void;
  dataRevision?: string | null;
  profileId: string;
  active?: boolean;
  ownProfile?: { user: User; onSaved: (user: User) => void };
  /** The workout history list, drawn with the same cards as the account's own history. */
  renderWorkouts: (props: SharedWorkoutListProps) => ReactNode;
  onChooseSharing: () => void;
}) {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [workouts, setWorkouts] = useState<TrackedWorkout[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [reactions, setReactions] = useState<Record<string, WorkoutReactions>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filters, setFilters] = useState<WorkoutFilters>({
    category: '',
    exercise_id: '',
    machine_photo_id: '',
    start_date: '',
    end_date: '',
  });
  const [filterOptions, setFilterOptions] = useState<SharedWorkoutFilterOptions>({
    exercises: [],
    machines: [],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const invalidDates = Boolean(
    filters.start_date && filters.end_date && filters.start_date > filters.end_date,
  );
  const queryKey = JSON.stringify([profileId, attempt, filters, active, dataRevision]);
  const currentQuery = useRef(queryKey);
  currentQuery.current = queryKey;

  useEffect(() => {
    if (!active) return;
    if (invalidDates) {
      setLoadingWorkouts(false);
      return;
    }
    let cancelled = false;
    setLoadingWorkouts(true);
    setLoadingMore(false);
    setMoreError(null);
    async function load() {
      const nextProfile = await api.sharing.profile(profileId);
      // A friends-only profile of a non-friend shares only its name and photo.
      const [page, options] = nextProfile.can_view
        ? await Promise.all([
            api.sharing.workouts(profileId, 0, SHARED_WORKOUT_PAGE_SIZE, filters),
            api.sharing.workoutFilters(profileId),
          ])
        : [
            { workouts: [], personal_records: [], total: 0 },
            { exercises: [], machines: [] },
          ];
      if (cancelled) return;
      setProfile(nextProfile);
      setWorkouts(page.workouts);
      setRecords(page.personal_records);
      setReactions('reactions' in page ? (page.reactions ?? {}) : {});
      setPicking(null);
      setTotal(page.total);
      setFilterOptions(options);
      setState('ready');
    }
    load()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState(loadStateFor(reason));
        setError(authErrorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkouts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, attempt, filters, invalidDates, active, dataRevision]);

  async function loadMore() {
    if (loadingMore || loadingWorkouts || invalidDates) return;
    const requestedQuery = queryKey;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.sharing.workouts(
        profileId,
        workouts.length,
        SHARED_WORKOUT_PAGE_SIZE,
        filters,
      );
      if (currentQuery.current !== requestedQuery) return;
      setWorkouts((current) => [
        ...current,
        ...page.workouts.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setRecords((current) => [...current, ...page.personal_records]);
      setReactions((current) => ({ ...current, ...page.reactions }));
      setTotal(page.total);
    } catch (reason) {
      if (currentQuery.current === requestedQuery) setMoreError(authErrorMessage(reason));
    } finally {
      if (currentQuery.current === requestedQuery) setLoadingMore(false);
    }
  }

  function friendChanged(status: FriendStatus) {
    if (!profile) return;
    // Gaining or losing access to a friends-only profile changes what it shows.
    setProfile({ ...profile, friend_status: status, friends_since: null });
    setAttempt((count) => count + 1);
  }

  const ownIdentity =
    ownProfile?.user.id === profileId ? (
      <ProfileIdentity user={ownProfile.user} onSaved={ownProfile.onSaved}>
        {profile?.is_you && <ProfileStats profile={profile} />}
      </ProfileIdentity>
    ) : null;

  if (state === 'locked') {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        <SharingLocked onChooseSharing={onChooseSharing} />
      </section>
    );
  }
  if (state === 'blocked' && profile) {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        <section className="settings-panel panel">
          <header>
            <div>
              <p className="section-kicker">BLOCKED</p>
              <h2>You blocked {profile.display_name}</h2>
            </div>
          </header>
          <p>
            They can no longer find you or see your profile. Unblock them in Social, under Find.
          </p>
        </section>
      </section>
    );
  }
  if (state === 'missing') {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        <section className="settings-panel panel">
          <header>
            <div>
              <p className="section-kicker">SHARING</p>
              <h2>This profile is no longer shared</h2>
            </div>
          </header>
          <p>Its owner has made it private, so their training is hidden again.</p>
        </section>
      </section>
    );
  }
  if (state === 'error' || !profile) {
    return (
      <section className="settings-screen shared-profile-screen content-page">
        {ownIdentity}
        {state === 'error' ? (
          <LoadProblem
            message={error ?? 'Could not load this profile.'}
            onRetry={() => {
              setState('loading');
              setAttempt((count) => count + 1);
            }}
          />
        ) : (
          <p className="sharing-loading" role="status">
            Loading profile…
          </p>
        )}
      </section>
    );
  }

  const memberSince = formatMemberSince(profile.member_since);
  const latestWeight = profile.body_weight?.[0]?.weight_kg ?? null;

  return (
    <section className="settings-screen shared-profile-screen content-page">
      {ownIdentity ?? (
        <section className="settings-panel panel profile-summary" aria-label="Shared profile">
          <div className="profile-summary-main">
            <ProfileAvatar className="profile-avatar" user={avatarUser(profile)} />
            <div className="profile-summary-copy">
              <strong>
                {profile.display_name}
                {profile.is_you && <span className="profile-badge">You</span>}
              </strong>
              {memberSince && (
                <span className="shared-status-chips profile-joined">
                  <small>Joined {memberSince}</small>
                </span>
              )}
              <ProfileFriendControl
                profile={profile}
                onChange={friendChanged}
                onBlocked={() => setState('blocked')}
              />
            </div>
          </div>
          <ProfileAccountId accountId={profile.id} />
          <ProfileStats profile={profile} />
        </section>
      )}
      {!profile.can_view ? (
        <section className="settings-panel panel sharing-locked">
          <header>
            <div>
              <p className="section-kicker">FRIENDS ONLY</p>
              <h2>
                {profile.friend_status === 'outgoing'
                  ? 'Friend request sent'
                  : profile.friend_status === 'incoming'
                    ? `${profile.display_name} sent you a friend request`
                    : `Add ${profile.display_name} as a friend to see their training`}
              </h2>
            </div>
          </header>
          <p>
            {profile.friend_status === 'outgoing'
              ? `Their workouts appear here once ${profile.display_name} accepts your request.`
              : profile.friend_status === 'incoming'
                ? 'Accept it to see each other’s training.'
                : `${profile.display_name} shares with friends only. Send a friend request and their workouts appear here once they accept.`}
          </p>
        </section>
      ) : (
        <>
          {profile.consistency && (
            <SharedConsistencyCalendar
              key={profile.id}
              data={profile.consistency}
              onDayClick={(date) => {
                setFilters({
                  category: '',
                  exercise_id: '',
                  machine_photo_id: '',
                  start_date: date,
                  end_date: date,
                });
                setFiltersOpen(true);
                document
                  .getElementById('shared-workouts-title')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          )}
          {profile.training_time && (
            <TrainingTimeCard
              allTime={profile.training_time}
              pastYear={profile.training_time_past_year}
            />
          )}
          {profile.body_weight && (
            <BodyWeightCard measurements={profile.body_weight} goals={profile.goals} />
          )}
          {profile.goals && <GoalsCard goals={profile.goals} latestWeight={latestWeight} />}
          {profile.cardio_sessions && (
            <ProfileCardioCard
              profileId={profile.id}
              sessions={profile.cardio_sessions}
              total={profile.cardio_total ?? profile.cardio_sessions.length}
              active={active}
            />
          )}
          <section
            className="history-screen shared-workouts"
            aria-labelledby="shared-workouts-title"
          >
            <header className="history-week-header shared-workouts-header">
              <h2 id="shared-workouts-title">Workouts</h2>
              <span className="num">{plural(total, 'workout')}</span>
            </header>
            <SharedWorkoutFilters
              filters={filters}
              options={filterOptions}
              open={filtersOpen}
              onToggle={setFiltersOpen}
              onChange={setFilters}
            />
            {invalidDates ? (
              <p className="inline-error" role="alert">
                From date must not be after To date.
              </p>
            ) : loadingWorkouts ? (
              <p className="sharing-loading" role="status">
                Loading workouts…
              </p>
            ) : workouts.length === 0 ? (
              <p className="shared-card-empty">
                {Object.values(filters).some(Boolean)
                  ? 'No workouts match these filters.'
                  : 'No workouts logged yet.'}
              </p>
            ) : (
              renderWorkouts({
                workouts,
                personalRecords: records,
                renderWorkoutAction: (workout) => (
                  <WorkoutReactionControl
                    ownWorkout={profile.is_you}
                    onOpenMember={onOpenMember}
                    workoutId={workout.id}
                    subject={`${profile.display_name}’s ${workout.name}`}
                    reactions={reactions[workout.id] ?? { counts: [], yours: null }}
                    open={picking === workout.id}
                    showSummary
                    onOpenChange={(value) =>
                      setPicking((current) =>
                        value ? workout.id : current === workout.id ? null : current,
                      )
                    }
                    onChange={(value) =>
                      setReactions((current) => ({ ...current, [workout.id]: value }))
                    }
                  />
                ),
                onFilterMachine: (photo) => {
                  setFilters((current) => ({ ...current, machine_photo_id: photo.id }));
                  setFiltersOpen(true);
                },
              })
            )}
            {moreError && (
              <p className="inline-error" role="alert">
                {moreError}
              </p>
            )}
            {!invalidDates && !loadingWorkouts && workouts.length < total && (
              <button
                type="button"
                className="show-more-button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading…' : `Show more · ${total - workouts.length} older`}
              </button>
            )}
          </section>
        </>
      )}
    </section>
  );
}
