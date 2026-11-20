import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { api } from './api';
import { rankExerciseSearchMatches } from './exerciseSearch';
import { FuzzyHighlightedText } from './FuzzyHighlightedText';
import { Icon } from './Icon';
import { useFlipAnimation, useHeightAnimation } from './motionHooks';
import { PaginationControls } from './PaginationControls';
import { PopupDialog } from './PopupDialog';
import { ProfileAvatar } from './ProfileAvatar';
import { useWeightUnit } from './trainingPreferencesContext';
import { Toast } from './Toast';
import { useUserSession } from './userContext';
import { formatWeight, type WeightUnit } from './weightUnits';
import type { LiftBest, LiftComparison, LiftRanking, SharedProfileSummary } from './types';
import './liftComparison.css';

/** The most lifts a head to head can show. */
const MAX_LIFTS = 20;
/** Lifts on each page of the picker: as many as fit the sheet on a phone without scrolling. */
const PAGE_SIZE = 6;
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
 * Your best lifts against another member's, on their profile. It starts empty each time the
 * profile opens: the lifts you choose belong to this visit, so another member's profile, or this
 * one opened again, starts afresh.
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
  const [lifts, setLifts] = useState<LiftComparison[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  // While the sheet is open the card keeps the lifts it had, then takes the new choice as the
  // sheet closes, so the lifts you added are seen arriving instead of changing behind it.
  const [held, setHeld] = useState<string[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const card = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const shownIds = held ?? selected;
  const shownKey = shownIds.join('|');
  const announceAdded = useFlipAnimation(card, shownKey);
  useHeightAnimation(card, shownKey);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // The comparison is an extra: a profile that cannot answer it simply shows no card. The
    // server also returns a saved choice of lifts, which is ignored: each visit starts empty.
    api.sharing.lifts(member.id).then(
      (next) => {
        if (!cancelled) setLifts(next.lifts);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [member.id, active, revision]);

  if (!lifts) return null;
  const byId = new Map(lifts.map((lift) => [lift.exercise_id, lift]));
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
      {chosen.length === 0 && (
        // What the card will look like, until lifts are chosen.
        <div className="head-to-head-template" aria-hidden="true">
          <div className="head-to-head-score">
            <span className="head-to-head-side">
              {user && <ProfileAvatar className="profile-avatar" user={user} />}
              <b>You</b>
            </span>
            <strong className="num">
              <span>?</span>
              <i>–</i>
              <span>?</span>
            </strong>
            <span className="head-to-head-side them">
              <b>{member.display_name}</b>
              <ProfileAvatar className="profile-avatar" user={{ ...member, username: '' }} />
            </span>
          </div>
          <div className="head-to-head-ghost">
            <span className="head-to-head-ghost-values">
              <b>?</b>
              <i />
              <b>?</b>
            </span>
            <span className="head-to-head-ghost-bar" />
          </div>
        </div>
      )}
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
          setHeld(selected);
          setPicking(true);
        }}
      >
        {chosen.length ? 'Edit lifts' : 'Choose lifts'}
      </button>
      {picking && (
        <LiftPicker
          member={member}
          you={user}
          lifts={lifts}
          selected={selected}
          onChange={setSelected}
          onClose={() => {
            const before = held ?? [];
            announceAdded();
            setFresh(selected.filter((id) => !before.includes(id)));
            setHeld(null);
            setPicking(false);
            requestAnimationFrame(() => opener.current?.focus());
          }}
        />
      )}
    </section>
  );
}

/** Search your exercises and tick the ones to compare, with both of your bests beside each. */
function LiftPicker({
  member,
  you,
  lifts,
  selected,
  onChange,
  onClose,
}: {
  member: Member;
  you: Parameters<typeof ProfileAvatar>[0]['user'] | null;
  lifts: LiftComparison[];
  selected: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
  onClose: () => void;
}) {
  const unit = useWeightUnit();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Unselect all can be undone while its toast is up, back to the lifts it cleared.
  const [cleared, setCleared] = useState<{ lifts: string[]; serial: number } | null>(null);

  /** Offers Undo for the lifts Unselect all cleared, or with null withdraws the offer. */
  function offerUndo(previous: string[] | null) {
    setCleared((current) =>
      previous === null ? null : { lifts: previous, serial: (current?.serial ?? 0) + 1 },
    );
  }

  function search(next: string) {
    setQuery(next);
    setPage(0);
  }

  // Chosen lifts lead, then the ones you have both logged, then theirs, then yours, then the rest.
  // The order is fixed while the sheet is open, so a lift stays under your finger when you tick it.
  const [ordered] = useState(() => {
    const rank = (lift: LiftComparison) => {
      const position = selected.indexOf(lift.exercise_id);
      if (position >= 0) return position;
      const logged = lift.yours && lift.theirs ? 0 : lift.theirs ? 1 : lift.yours ? 2 : 3;
      return selected.length + logged;
    };
    return lifts
      .map((lift) => ({ ...lift, id: lift.exercise_id }))
      .sort((first, second) => rank(first) - rank(second) || first.name.localeCompare(second.name));
  });
  const shown = query.trim() ? rankExerciseSearchMatches(ordered, query, []) : ordered;
  const full = selected.length >= MAX_LIFTS;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const onPage = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <PopupDialog
      variant="sheet"
      size="tall"
      title="Lifts to compare"
      className="lift-picker"
      onClose={onClose}
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
            onChange={(event) => search(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                search('');
                input.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </label>
        <div className="lift-picker-toolbar">
          <span className="num">
            <b>{selected.length}</b> of {MAX_LIFTS} chosen
          </span>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => {
              offerUndo(selected);
              onChange([]);
            }}
          >
            Unselect all
          </button>
        </div>
        <ul ref={list} className="lift-picker-list" aria-label="Your exercises">
          {onPage.map((lift) => {
            const chosen = selected.includes(lift.exercise_id);
            return (
              <li key={lift.exercise_id}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  disabled={full && !chosen}
                  onClick={() => {
                    offerUndo(null);
                    // From the latest choice, so quick taps in a row all count.
                    onChange((current) =>
                      current.includes(lift.exercise_id)
                        ? current.filter((id) => id !== lift.exercise_id)
                        : current.length >= MAX_LIFTS
                          ? current
                          : [...current, lift.exercise_id],
                    );
                  }}
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
                  {(lift.yours || lift.theirs) && (
                    <span className="lift-picker-preview">
                      {lift.yours && (
                        <span className="lift-picker-best">
                          <span className="sr-only">You: </span>
                          {you && <ProfileAvatar className="profile-avatar" user={you} />}
                          <b className="num">{estimate(lift.yours, unit)}</b>
                        </span>
                      )}
                      {lift.theirs && (
                        <span className="lift-picker-best">
                          <span className="sr-only">{member.display_name}: </span>
                          <ProfileAvatar
                            className="profile-avatar"
                            user={{ ...member, username: '' }}
                          />
                          <b className="num">{estimate(lift.theirs, unit)}</b>
                        </span>
                      )}
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
        <PaginationControls
          label="lifts"
          className="is-sheet-footer"
          currentPage={current + 1}
          totalPages={pages}
          onPageChange={(next) => setPage(next - 1)}
          scrollTarget={list}
        />
      </div>
      {cleared && (
        <Toast
          id={cleared.serial}
          message="Lifts cleared"
          action={{
            label: 'Undo',
            run: () => {
              onChange(cleared.lifts);
              offerUndo(null);
            },
          }}
          dismissLabel="Dismiss lifts cleared notification"
          onDismiss={() => offerUndo(null)}
        />
      )}
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
