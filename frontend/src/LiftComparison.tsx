import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { api } from './api';
import { rankExerciseSearchMatches } from './exerciseSearch';
import { FuzzyHighlightedText } from './FuzzyHighlightedText';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import { useFlipAnimation, useHeightAnimation } from './motionHooks';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import { useWeightUnit } from './trainingPreferencesContext';
import { useUserSession } from './userContext';
import { formatWeight, type WeightUnit } from './weightUnits';
import type {
  LiftBest,
  LiftComparison,
  LiftComparisons,
  LiftRanking,
  SharedProfileSummary,
} from './types';
import './liftComparison.css';

/** The most lifts a head to head can show, as the server allows. */
const MAX_LIFTS = 20;
/** Matches the sheet's slide-down in liftComparison.css. */
const CLOSE_MS = 240;
/** The gap between one new lift rising into the card and the next, as useFlipAnimation spaces them. */
const ENTER_STAGGER_MS = 80;

type Member = Pick<SharedProfileSummary, 'id' | 'display_name' | 'profile_photo_url'>;
type Leader = 'you' | 'them' | 'level';

/** Who leads a lift both members have logged. */
function leaderOf(lift: LiftComparison): Leader | null {
  if (!lift.yours || !lift.theirs) return null;
  if (lift.yours.estimated_1rm === lift.theirs.estimated_1rm) return 'level';
  return lift.yours.estimated_1rm > lift.theirs.estimated_1rm ? 'you' : 'them';
}

/** Normalised machine weights are approximate, as they are on the progress screen. */
function approx(best: LiftBest): string {
  return best.normalised ? '≈ ' : '';
}

function estimate(best: LiftBest, unit: WeightUnit): string {
  return `${approx(best)}${formatWeight(best.estimated_1rm, unit, 1)}`;
}

function bestSet(best: LiftBest, unit: WeightUnit): string {
  return `${approx(best)}${formatWeight(best.weight_kg, unit)} × ${best.reps}`;
}

function count(lifts: number): string {
  return `${lifts} ${lifts === 1 ? 'lift' : 'lifts'}`;
}

/**
 * Your best lifts against another member's, on their profile. It starts empty: you choose the
 * lifts, and the same choice then shows for every member you compare with.
 */
export function HeadToHeadCard({
  member,
  active,
  revision = null,
  onOpenLift,
}: {
  member: Member;
  active: boolean;
  revision?: string | null;
  /** Shows the member's sessions of one of their exercises. */
  onOpenLift?: (exerciseId: string) => void;
}) {
  const unit = useWeightUnit();
  const { user } = useUserSession();
  const titleId = useId();
  const [data, setData] = useState<LiftComparisons | null>(null);
  const [picking, setPicking] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // While the sheet is open the card keeps the lifts it had, then takes the new choice as the
  // sheet closes, so the lifts you added are seen arriving instead of changing behind it.
  const [held, setHeld] = useState<string[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const card = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const shownIds = held ?? data?.selected ?? [];
  const shownKey = shownIds.join('|');
  const announceAdded = useFlipAnimation(card, shownKey);
  useHeightAnimation(card, shownKey);
  // Choices save one at a time, newest only, so quick taps cannot land out of order.
  const saved = useRef<string[]>([]);
  const latest = useRef(0);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const started = latest.current;
    // The comparison is an extra: a profile that cannot answer it simply shows no card.
    api.sharing.lifts(member.id).then(
      (next) => {
        if (cancelled) return;
        // A choice made while this was read is newer than what it holds.
        if (started === latest.current) saved.current = next.selected;
        setData((current) =>
          current && started !== latest.current ? { ...next, selected: current.selected } : next,
        );
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [member.id, active, revision]);

  function choose(next: string[]) {
    const serial = ++latest.current;
    setSaveFailed(false);
    setData((current) => current && { ...current, selected: next });
    saving.current = saving.current.then(async () => {
      if (serial !== latest.current) return;
      try {
        saved.current = (await api.sharing.chooseLifts(next)).exercise_ids;
      } catch {
        if (serial !== latest.current) return;
        setData((current) => current && { ...current, selected: saved.current });
        setSaveFailed(true);
      }
    });
  }

  if (!data) return null;
  const byId = new Map(data.lifts.map((lift) => [lift.exercise_id, lift]));
  const chosen = shownIds.flatMap((id) => byId.get(id) ?? []);
  const leaders = chosen.map(leaderOf);
  const yours = leaders.filter((leader) => leader === 'you').length;
  const theirs = leaders.filter((leader) => leader === 'them').length;
  const level = leaders.filter((leader) => leader === 'level').length;
  const score = [
    `You lead ${count(yours)}`,
    `${member.display_name} leads ${count(theirs)}`,
    level ? `${count(level)} level` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section ref={card} className="pulse-card shared-card head-to-head" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Head to head</h2>
        {chosen.length > 0 && <span>All-time est. 1RM</span>}
      </header>
      {yours + theirs + level > 0 && (
        <p className="head-to-head-score" aria-label={score} data-flip-key="score">
          <span className={`head-to-head-side${yours > theirs ? ' ahead' : ''}`} aria-hidden="true">
            {user && <ProfileAvatar className="profile-avatar" user={user} />}
            <b>You</b>
          </span>
          <strong className="num" aria-hidden="true">
            <span className={yours > theirs ? 'ahead' : undefined}>{yours}</span>
            <i>–</i>
            <span className={theirs > yours ? 'ahead' : undefined}>{theirs}</span>
          </strong>
          <span
            className={`head-to-head-side them${theirs > yours ? ' ahead' : ''}`}
            aria-hidden="true"
          >
            <b>{member.display_name}</b>
            <ProfileAvatar className="profile-avatar" user={{ ...member, username: '' }} />
          </span>
        </p>
      )}
      {chosen.length > 0 && (
        <ul className="head-to-head-lifts">
          {chosen.map((lift) => {
            const share =
              lift.yours && lift.theirs
                ? (lift.yours.estimated_1rm /
                    (lift.yours.estimated_1rm + lift.theirs.estimated_1rm)) *
                  100
                : null;
            const content = (
              <>
                <span className="head-to-head-values">
                  <b className="num">{lift.yours ? estimate(lift.yours, unit) : '–'}</b>
                  <span>{lift.name}</span>
                  <b className="num">{lift.theirs ? estimate(lift.theirs, unit) : '–'}</b>
                </span>
                <span className="head-to-head-bar" aria-hidden="true">
                  {share !== null && <i style={{ width: `${share}%` }} />}
                  <i />
                </span>
                <span className="head-to-head-sets num">
                  <small>{lift.yours ? bestSet(lift.yours, unit) : 'No sets yet'}</small>
                  <small>{lift.theirs ? bestSet(lift.theirs, unit) : 'No sets yet'}</small>
                </span>
              </>
            );
            const summary = `${lift.name}: you ${lift.yours ? estimate(lift.yours, unit) : 'no sets yet'}, ${member.display_name} ${lift.theirs ? estimate(lift.theirs, unit) : 'no sets yet'}`;
            const theirExercise = lift.theirs?.exercise_id;
            const arrival = fresh.indexOf(lift.exercise_id);
            return (
              <li
                key={lift.exercise_id}
                data-leader={leaderOf(lift) ?? 'none'}
                data-flip-key={lift.exercise_id}
                className={arrival >= 0 ? 'is-new' : undefined}
                style={
                  arrival >= 0
                    ? ({
                        '--enter-delay': `${Math.min(arrival, 5) * ENTER_STAGGER_MS}ms`,
                      } as CSSProperties)
                    : undefined
                }
              >
                {onOpenLift && theirExercise ? (
                  <button
                    type="button"
                    aria-label={`${summary}. Show ${member.display_name}’s sessions`}
                    onClick={() => onOpenLift(theirExercise)}
                  >
                    {content}
                  </button>
                ) : (
                  <div aria-label={summary}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        ref={opener}
        type="button"
        className="show-more-button"
        aria-haspopup="dialog"
        data-flip-key="choose"
        onClick={() => {
          setHeld(data.selected);
          setPicking(true);
        }}
      >
        {chosen.length ? 'Edit lifts' : 'Choose lifts'}
      </button>
      {picking && (
        <LiftPicker
          member={member}
          lifts={data.lifts}
          selected={data.selected}
          saveFailed={saveFailed}
          onChange={choose}
          onClose={() => {
            const before = held ?? [];
            announceAdded();
            setFresh(data.selected.filter((id) => !before.includes(id)));
            setHeld(null);
            setPicking(false);
            requestAnimationFrame(() => opener.current?.focus());
          }}
        />
      )}
    </section>
  );
}

/** Search your exercises and tick the ones to compare, with the member's best beside each. */
function LiftPicker({
  member,
  lifts,
  selected,
  saveFailed,
  onChange,
  onClose,
}: {
  member: Member;
  lifts: LiftComparison[];
  selected: string[];
  saveFailed: boolean;
  onChange: (selected: string[]) => void;
  onClose: () => void;
}) {
  const unit = useWeightUnit();
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** Slides the sheet back down before it unmounts. */
  function dismiss() {
    if (closeTimer.current !== null) return;
    if (motionReduced()) return onClose();
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }
  // Chosen lifts lead, then the ones the member has logged. The order is fixed while the sheet is
  // open, so a lift stays under your finger when you tick it.
  const [ordered] = useState(() => {
    const rank = (lift: LiftComparison) => {
      const position = selected.indexOf(lift.exercise_id);
      if (position >= 0) return position;
      return selected.length + (lift.theirs ? 0 : 1);
    };
    return lifts
      .map((lift) => ({ ...lift, id: lift.exercise_id }))
      .sort((first, second) => rank(first) - rank(second) || first.name.localeCompare(second.name));
  });
  const shown = query.trim() ? rankExerciseSearchMatches(ordered, query, []) : ordered;
  const full = selected.length >= MAX_LIFTS;

  return (
    <PopupDialog
      title="Lifts to compare"
      className={`lift-picker${closing ? ' is-closing' : ''}`}
      closeLabel="Done"
      swipeToDismiss
      onClose={dismiss}
    >
      <div className="lift-picker-body">
        <label className="lift-picker-search">
          <Icon name="search" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search your exercises"
            placeholder="Search exercises"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </label>
        {saveFailed && (
          <p className="inline-error" role="alert">
            Your lifts could not be saved. Try again.
          </p>
        )}
        {full && (
          <p className="lift-picker-limit" role="status">
            {MAX_LIFTS} lifts is the most a head to head shows.
          </p>
        )}
        <ul className="lift-picker-list" aria-label="Your exercises">
          {shown.map((lift) => {
            const chosen = selected.includes(lift.exercise_id);
            return (
              <li key={lift.exercise_id}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  disabled={full && !chosen}
                  onClick={() =>
                    onChange(
                      chosen
                        ? selected.filter((id) => id !== lift.exercise_id)
                        : [...selected, lift.exercise_id],
                    )
                  }
                >
                  <span className="lift-picker-check" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  <span className="lift-picker-copy">
                    <strong>
                      <FuzzyHighlightedText value={lift.name} query={query} />
                    </strong>
                    <small>
                      {lift.muscle_group}
                      {lift.equipment ? ` · ${lift.equipment}` : ''}
                    </small>
                  </span>
                  {lift.theirs && (
                    <span className="lift-picker-preview">
                      <span className="sr-only">{member.display_name}: </span>
                      <ProfileAvatar
                        className="profile-avatar"
                        user={{ ...member, username: '' }}
                      />
                      <span className="num">
                        <b>{estimate(lift.theirs, unit)}</b>
                        <small>{bestSet(lift.theirs, unit)}</small>
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {!shown.length && (
          <p className="lift-picker-empty" role="status">
            No exercises match “{query.trim()}”.
          </p>
        )}
      </div>
    </PopupDialog>
  );
}

/** One of your lifts, ranked against the friends who have logged it. */
export function LiftLeaderboardCard({
  exerciseId,
  revision = null,
  onOpenMember,
}: {
  exerciseId: string;
  revision?: string | null;
  onOpenMember?: (member: Member) => void;
}) {
  const unit = useWeightUnit();
  const titleId = useId();
  const [loaded, setLoaded] = useState<{ exerciseId: string; entries: LiftRanking[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Friends are an extra here: an account that shares with nobody simply sees no ranking.
    api.sharing.liftLeaderboard(exerciseId).then(
      (data) => {
        if (!cancelled) setLoaded({ exerciseId, entries: data.entries });
      },
      () => {
        if (!cancelled) setLoaded({ exerciseId, entries: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [exerciseId, revision]);

  const entries = loaded?.exerciseId === exerciseId ? loaded.entries : [];
  if (!entries.length) return null;
  return (
    <section className="pulse-card lift-leaderboard" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Friends</h2>
        <span>All-time est. 1RM</span>
      </header>
      <ol>
        {entries.map((entry, index) => {
          const name = entry.is_you ? 'You' : entry.member.display_name;
          const content = (
            <>
              <span className="lift-leaderboard-rank num" aria-hidden="true">
                {index + 1}
              </span>
              <ProfileAvatar className="profile-avatar" user={{ ...entry.member, username: '' }} />
              <span className="lift-leaderboard-name">
                <strong>{name}</strong>
                <small className="num">{bestSet(entry.best, unit)}</small>
              </span>
              <b className="num">{estimate(entry.best, unit)}</b>
              {!entry.is_you && onOpenMember && <Icon name="chevron-right" />}
            </>
          );
          return (
            <li key={entry.member.id} className={entry.is_you ? 'is-you' : undefined}>
              {!entry.is_you && onOpenMember ? (
                <button
                  type="button"
                  aria-label={`${index + 1}. ${name}, ${estimate(entry.best, unit)}. Open profile`}
                  onClick={() => onOpenMember(entry.member)}
                >
                  {content}
                </button>
              ) : (
                <div aria-label={`${index + 1}. ${name}, ${estimate(entry.best, unit)}`}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
