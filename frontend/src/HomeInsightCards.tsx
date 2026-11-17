import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from './api';
import { cardioDistanceGroups } from './cardioTrend';
import {
  bodyGoalProgress,
  distancePeriodStart,
  freshnessLabel,
  freshnessLevel,
  ordinal,
  spotlightSummary,
  weekStandings,
  type MuscleFreshness,
} from './homeInsights';
import type {
  CardioDistancePeriod,
  CardioDistanceSettings,
  ExerciseSpotlightSettings,
} from './homeLayout';
import { PresenceAvatar } from './PresenceAvatar';
import { presenceStatus } from './presence';
import { ProfileAvatar } from './ProfileAvatar';
import { Sparkline } from './PulseCharts';
import { shortDate } from './trainingSummary';
import type {
  BodyMeasurement,
  BodyWeightGoal,
  CardioSession,
  ExerciseLibrarySummary,
  FriendActivity,
  FriendFeedItem,
  TrackedWorkout,
  User,
} from './types';
import { formatWeight, formatWeightNumber, weightFromKg, type WeightUnit } from './weightUnits';
import './homeInsights.css';

type Read<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: T };

/** Loads once the card is shown, and again whenever `revision` changes. */
function useRead<T>(load: () => Promise<T>, revision: unknown, enabled = true): Read<T> {
  const [state, setState] = useState<Read<T>>({ kind: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void load()
      .then((value) => {
        if (!cancelled) setState({ kind: 'ready', value });
      })
      .catch(() => {
        if (!cancelled)
          setState((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
      });
    return () => {
      cancelled = true;
    };
    // `load` is a module-level function; the revision decides when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, enabled]);
  return state;
}

const listGoals = () => api.listBodyWeightGoals();
const loadCardio = () => api.cardioOverview().then((overview) => overview.sessions);

function daysLeftLabel(days: number, ended: boolean): string {
  if (ended) return 'Target date passed';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  if (days < 14) return `${days} days left`;
  return `${Math.round(days / 7)} weeks left`;
}

export function BodyGoalCard({
  measurements,
  today,
  weightUnit,
  revision,
  onOpenBody,
}: {
  measurements: BodyMeasurement[];
  today: string;
  weightUnit: WeightUnit;
  revision?: unknown;
  onOpenBody: () => void;
}) {
  const titleId = useId();
  const goals = useRead<BodyWeightGoal[]>(listGoals, revision);
  const goal = goals.kind === 'ready' ? (goals.value.find((item) => item.active) ?? null) : null;
  const latest = measurements[0] ?? null;
  const progress = goal && latest ? bodyGoalProgress(goal, latest.weight_kg, today) : null;
  const weight = (kg: number, decimals = 1) => formatWeightNumber(kg, weightUnit, decimals);
  const chip = !progress
    ? null
    : progress.kind === 'maintain'
      ? {
          text:
            progress.status === 'in'
              ? 'In range'
              : progress.status === 'above'
                ? 'Above range'
                : 'Below range',
          tone: progress.status === 'in' ? 'good' : 'warn',
        }
      : progress.ahead_kg === 0 || progress.ahead_kg === null
        ? { text: 'On track', tone: 'good' }
        : {
            text: `${weight(Math.abs(progress.ahead_kg))} ${weightUnit} ${progress.ahead_kg > 0 ? 'ahead' : 'behind'}`,
            tone: progress.ahead_kg > 0 ? 'good' : 'warn',
          };

  return (
    <section className="pulse-card insight-card body-goal-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Body goal</h2>
        <button type="button" className="text-link" onClick={onOpenBody}>
          Body
        </button>
      </header>
      {goals.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading your goal…</p>
      ) : goals.kind === 'error' ? (
        <p className="pulse-empty-line">Your goal could not be loaded.</p>
      ) : !goal ? (
        <p className="pulse-empty-line">Set a body-weight goal on Body to follow it here.</p>
      ) : !progress ? (
        <p className="pulse-empty-line">Log your weight to see your progress.</p>
      ) : (
        <>
          <div className="insight-headline">
            <strong className="insight-value num">
              {weight(progress.current_kg)}
              <small> {weightUnit}</small>
            </strong>
            {chip && <span className={`insight-chip is-${chip.tone}`}>{chip.text}</span>}
          </div>
          {progress.done !== null ? (
            <>
              <div
                className="body-goal-track insight-full-only"
                role="progressbar"
                aria-label="Progress to your goal"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.done * 100)}
              >
                <i style={{ width: `${progress.done * 100}%` }} />
                <b style={{ left: `${progress.elapsed * 100}%` }} aria-hidden="true" />
              </div>
              <p className="insight-row insight-full-only num">
                <span>Start {weight(goal.start_weight_kg)}</span>
                <span>
                  Goal {formatWeight(goal.target_weight_kg, weightUnit, 1)} by{' '}
                  {shortDate(goal.target_date)}
                </span>
              </p>
              <GoalRing
                done={progress.done}
                value={weight(progress.changed_kg)}
                of={`of ${weight(progress.planned_kg)} ${weightUnit}`}
              />
            </>
          ) : (
            <p className="insight-row num">
              <span>
                {progress.range
                  ? `${weight(progress.range[0])}–${formatWeight(progress.range[1], weightUnit, 1)}`
                  : formatWeight(goal.target_weight_kg, weightUnit, 1)}
              </span>
              <span>until {shortDate(goal.target_date)}</span>
            </p>
          )}
          <p className="insight-foot">
            {daysLeftLabel(progress.days_left, today > goal.target_date)}
          </p>
        </>
      )}
    </section>
  );
}

function GoalRing({ done, value, of }: { done: number; value: string; of: string }) {
  const circumference = 2 * Math.PI * 42;
  return (
    <svg className="body-goal-ring insight-compact-only" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="42" className="ring-track" />
      <circle
        cx="50"
        cy="50"
        r="42"
        className="ring-fill"
        strokeDasharray={`${done * circumference} ${circumference}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" className="ring-value">
        {value}
      </text>
      <text x="50" y="66" className="ring-of">
        {of}
      </text>
    </svg>
  );
}

export function ExerciseSpotlightCard({
  summaries,
  names,
  settings,
  weightUnit,
  onOpenProgress,
}: {
  /** null while the exercise library loads. */
  summaries: ExerciseLibrarySummary[] | null;
  names: ReadonlyMap<string, string>;
  settings: ExerciseSpotlightSettings;
  weightUnit: WeightUnit;
  onOpenProgress: (exerciseId?: string) => void;
}) {
  const titleId = useId();
  const summary = summaries ? spotlightSummary(summaries, settings.exercise_id) : null;
  const name = summary ? (names.get(summary.exercise_id) ?? 'Exercise') : 'Exercise spotlight';
  const approx = summary?.normalised ? '≈' : '';
  const change = summary?.change_kg ?? null;
  return (
    <section className="pulse-card insight-card spotlight-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>{name}</h2>
        <button
          type="button"
          className="text-link"
          onClick={() => onOpenProgress(summary?.exercise_id)}
        >
          Progress
        </button>
      </header>
      {!summaries ? (
        <p className="pulse-empty-line">Loading your lifts…</p>
      ) : !summary ? (
        <p className="pulse-empty-line">Log a strength workout to spotlight a lift here.</p>
      ) : (
        <>
          <p className="insight-label">Est. 1RM</p>
          <div className="insight-headline">
            <strong className="insight-value num">
              {approx}
              {formatWeightNumber(summary.latest_estimated_1rm ?? 0, weightUnit, 1)}
              <small> {weightUnit}</small>
            </strong>
            {change !== null && (
              <span
                className={`insight-change num ${change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}`}
              >
                {change > 0 ? '+' : change < 0 ? '−' : '±'}
                {formatWeight(Math.abs(change), weightUnit, 1)}
              </span>
            )}
          </div>
          <Sparkline
            values={summary.trend.map((point) => weightFromKg(point.estimated_1rm, weightUnit))}
            label={`${name} estimated one-rep max, last 8 weeks`}
            height={48}
          />
          <p className="insight-foot">
            {summary.trend.length > 1
              ? `8 weeks to ${shortDate(summary.last_date)}`
              : `Last trained ${shortDate(summary.last_date)}`}
          </p>
        </>
      )}
    </section>
  );
}

export function ExerciseSpotlightSettingsForm({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[];
  value: ExerciseSpotlightSettings;
  onChange: (change: Partial<ExerciseSpotlightSettings>) => void;
}) {
  const name = useId();
  const chosen = options.some((option) => option.id === value.exercise_id)
    ? value.exercise_id
    : null;
  return (
    <div className="cardio-card-settings">
      <fieldset>
        <legend>Exercise</legend>
        <div className="cardio-card-track">
          {[{ id: null, name: 'Most trained' }, ...options].map((option) => (
            <label key={option.id ?? 'auto'}>
              <input
                type="radio"
                name={name}
                checked={chosen === option.id}
                onChange={() => onChange({ exercise_id: option.id })}
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function MuscleFreshnessCard({ muscles }: { muscles: MuscleFreshness[] }) {
  const titleId = useId();
  const ready = muscles.filter((item) => freshnessLevel(item.days) === 'fresh').length;
  return (
    <section className="pulse-card insight-card freshness-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Muscle freshness</h2>
      </header>
      {muscles.length === 0 ? (
        <p className="pulse-empty-line">Log a workout to see which muscles are fresh.</p>
      ) : (
        <>
          <ul className="freshness-list">
            {muscles.map((item) => (
              <li key={item.muscle} className={`is-${freshnessLevel(item.days)}`}>
                <span>{item.muscle}</span>
                <b className="num">
                  <span className="insight-full-only">{freshnessLabel(item.days)}</span>
                  <span className="insight-compact-only">{freshnessLabel(item.days, true)}</span>
                </b>
              </li>
            ))}
          </ul>
          {muscles.length > 3 && (
            <p className="insight-foot insight-compact-only">
              {ready > 3 ? `+${ready - 3} more fresh` : `+${muscles.length - 3} more`}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function CardioDistanceCard({
  settings,
  today,
  weekStartDay,
  revision,
  onOpenCardio,
}: {
  settings: CardioDistanceSettings;
  today: string;
  weekStartDay: number;
  revision?: unknown;
  onOpenCardio: () => void;
}) {
  const titleId = useId();
  const sessions = useRead<CardioSession[]>(loadCardio, revision);
  const start = distancePeriodStart(settings.period, today, weekStartDay);
  const groups =
    sessions.kind === 'ready'
      ? cardioDistanceGroups(sessions.value, start, today).filter((group) => group.distance > 0)
      : [];
  const period = periodName(settings.period, today);
  const longest = Math.max(...groups.map((group) => group.distance), 0.1);
  return (
    <section className="pulse-card insight-card distance-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Cardio distance</h2>
        <button type="button" className="text-link" onClick={onOpenCardio}>
          Cardio
        </button>
      </header>
      <p className="insight-label">{period}</p>
      {sessions.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading your cardio…</p>
      ) : sessions.kind === 'error' ? (
        <p className="pulse-empty-line">Your cardio could not be loaded.</p>
      ) : groups.length === 0 ? (
        <p className="pulse-empty-line">
          No distance logged {settings.period === 'week' ? 'this week' : 'this month'}.
        </p>
      ) : (
        <ul className="distance-list">
          {groups.map((group, index) => (
            <li
              key={group.key}
              style={{ '--distance-color': `var(--distance-${(index % 5) + 1})` } as CSSProperties}
            >
              <span className="distance-name">
                <i aria-hidden="true" />
                {group.label}
              </span>
              <b className="num">
                {Number(group.distance.toFixed(1)).toLocaleString('en-GB')}
                <small> km</small>
              </b>
              <small className="distance-sessions">
                {group.sessions} {group.sessions === 1 ? 'session' : 'sessions'}
              </small>
              <span
                className="distance-bar"
                aria-hidden="true"
                style={{ width: `${(group.distance / longest) * 100}%` }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function periodName(period: CardioDistancePeriod, today: string): string {
  if (period === 'week') return 'This week';
  return new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(`${today}T12:00:00`));
}

export function CardioDistanceSettingsForm({
  value,
  onChange,
}: {
  value: CardioDistanceSettings;
  onChange: (change: Partial<CardioDistanceSettings>) => void;
}) {
  const name = useId();
  return (
    <div className="cardio-card-settings">
      <fieldset>
        <legend>Period</legend>
        <div className="cardio-card-track">
          {(
            [
              ['week', 'This week'],
              ['month', 'This month'],
            ] as const
          ).map(([period, label]) => (
            <label key={period}>
              <input
                type="radio"
                name={name}
                checked={value.period === period}
                onChange={() => onChange({ period })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

type FriendsRead = { locked: true } | { locked: false; friends: FriendActivity[] };
const loadFriends = (): Promise<FriendsRead> =>
  api.sharing
    .friends()
    .then((result): FriendsRead =>
      result.locked ? { locked: true } : { locked: false, friends: result.friends },
    )
    .catch((reason: unknown) => {
      if (reason instanceof ApiError && reason.code === 'sharing_required')
        return { locked: true } as const;
      throw reason;
    });

export function FriendsWeekCard({
  active,
  you,
  workouts,
  today,
  weekStartDay,
  revision,
  onOpenFriend,
  onOpenSocial,
  onChooseSharing,
}: {
  active: boolean;
  you: Pick<User, 'display_name' | 'username' | 'profile_photo_url'>;
  workouts: TrackedWorkout[];
  today: string;
  weekStartDay: number;
  revision?: unknown;
  onOpenFriend?: (friend: FriendFeedItem['friend']) => void;
  onOpenSocial?: () => void;
  onChooseSharing?: () => void;
}) {
  const titleId = useId();
  const friends = useRead(loadFriends, `${revision ?? ''}:${active}`, active);
  const rows = useMemo(
    () =>
      friends.kind === 'ready' && !friends.value.locked
        ? weekStandings(
            friends.value.friends,
            {
              id: 'you',
              display_name: you.display_name,
              profile_photo_url: you.profile_photo_url ?? null,
            },
            workouts,
            today,
            weekStartDay,
          )
        : [],
    [friends, you.display_name, you.profile_photo_url, workouts, today, weekStartDay],
  );
  const locked = friends.kind === 'ready' && friends.value.locked;
  const rank = (days: number) => 1 + rows.filter((row) => row.days > days).length;
  const me = rows.find((row) => row.is_you);
  const leader = rows[0];
  const runnerUp = rows.find((row) => !row.is_you);
  const summary = !me
    ? ''
    : leader && !leader.is_you
      ? `${leader.days - me.days} ${leader.days - me.days === 1 ? 'day' : 'days'} behind ${leader.display_name}`
      : runnerUp && runnerUp.days === me.days
        ? `Level with ${runnerUp.display_name}`
        : runnerUp
          ? `${me.days - runnerUp.days} ${me.days - runnerUp.days === 1 ? 'day' : 'days'} ahead`
          : '';

  return (
    <section className="pulse-card insight-card friends-week-card" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Friends this week</h2>
        <button
          type="button"
          className="text-link"
          onClick={locked ? (onChooseSharing ?? onOpenSocial) : onOpenSocial}
        >
          {locked ? 'Share' : 'Social'}
        </button>
      </header>
      {friends.kind === 'loading' ? (
        <p className="pulse-empty-line">Loading your friends…</p>
      ) : friends.kind === 'error' ? (
        <p className="pulse-empty-line">Your friends could not be loaded.</p>
      ) : locked ? (
        <p className="pulse-empty-line">Share your profile to compare weeks with friends.</p>
      ) : rows.length < 2 ? (
        <p className="pulse-empty-line">Add friends to compare your weeks.</p>
      ) : (
        <>
          <p className="week-board-summary insight-compact-only">
            <span className="insight-label">Your rank</span>
            <strong className="insight-value num">
              {ordinal(rank(me?.days ?? 0))}
              <small> of {rows.length}</small>
            </strong>
            {summary && <span className="insight-foot">{summary}</span>}
          </p>
          <ol className="week-board">
            {rows.map((row) => {
              const content = (
                <>
                  <span className="week-board-rank num">{rank(row.days)}</span>
                  {row.friend ? (
                    <PresenceAvatar
                      user={{ ...row, username: row.display_name }}
                      status={presenceStatus(row.friend.presence)}
                    />
                  ) : (
                    <span className="presence-avatar">
                      <ProfileAvatar className="shared-profile-avatar small" user={you} />
                    </span>
                  )}
                  <span className="week-board-name">{row.is_you ? 'You' : row.display_name}</span>
                  <b className="num">
                    {row.days} {row.days === 1 ? 'day' : 'days'}
                  </b>
                </>
              );
              return (
                <li key={row.id} className={row.is_you ? 'is-you' : undefined}>
                  {row.friend && onOpenFriend ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenFriend({
                          id: row.id,
                          display_name: row.display_name,
                          profile_photo_url: row.profile_photo_url,
                          presence: row.friend?.presence,
                        })
                      }
                    >
                      {content}
                    </button>
                  ) : (
                    <div>{content}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
