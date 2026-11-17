import { useEffect, useId, useState } from 'react';
import { api } from './api';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { useWeightUnit } from './trainingPreferencesContext';
import { useUserSession } from './userContext';
import { formatWeight, type WeightUnit } from './weightUnits';
import type { LiftBest, LiftComparison, LiftRanking, SharedProfileSummary } from './types';
import './liftComparison.css';

/** Lifts shown before the rest are asked for. */
const VISIBLE_LIFTS = 5;

type Member = Pick<SharedProfileSummary, 'id' | 'display_name' | 'profile_photo_url'>;
type Leader = 'you' | 'them' | 'level';

function leaderOf(lift: LiftComparison): Leader {
  if (lift.yours.estimated_1rm === lift.theirs.estimated_1rm) return 'level';
  return lift.yours.estimated_1rm > lift.theirs.estimated_1rm ? 'you' : 'them';
}

function estimate(best: LiftBest, unit: WeightUnit): string {
  return formatWeight(best.estimated_1rm, unit, 1);
}

function bestSet(best: LiftBest, unit: WeightUnit): string {
  return `${formatWeight(best.weight_kg, unit)} × ${best.reps}`;
}

function count(lifts: number): string {
  return `${lifts} ${lifts === 1 ? 'lift' : 'lifts'}`;
}

/** Your best lifts against another member's, on their profile. */
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
  const [lifts, setLifts] = useState<LiftComparison[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // The comparison is an extra: a profile that cannot answer it simply shows no card.
    api.sharing.lifts(member.id).then(
      (data) => {
        if (!cancelled) setLifts(data.lifts);
      },
      () => {
        if (!cancelled) setLifts([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [member.id, active, revision]);

  if (!lifts.length) return null;
  const leaders = lifts.map(leaderOf);
  const yours = leaders.filter((leader) => leader === 'you').length;
  const theirs = leaders.filter((leader) => leader === 'them').length;
  const level = lifts.length - yours - theirs;
  const shown = showAll ? lifts : lifts.slice(0, VISIBLE_LIFTS);
  const score = [
    `You lead ${count(yours)}`,
    `${member.display_name} leads ${count(theirs)}`,
    level ? `${count(level)} level` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="pulse-card shared-card head-to-head" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>Head to head</h2>
        <span>All-time est. 1RM</span>
      </header>
      <p className="head-to-head-score" aria-label={score}>
        <span className={`head-to-head-side${yours > theirs ? ' ahead' : ''}`} aria-hidden="true">
          {user && <ProfileAvatar className="profile-avatar" user={user} />}
          <b>You</b>
        </span>
        <strong className="num" aria-hidden="true">
          <span>{yours}</span>
          <i>–</i>
          <span>{theirs}</span>
        </strong>
        <span
          className={`head-to-head-side them${theirs > yours ? ' ahead' : ''}`}
          aria-hidden="true"
        >
          <b>{member.display_name}</b>
          <ProfileAvatar className="profile-avatar" user={{ ...member, username: '' }} />
        </span>
      </p>
      <ul className="head-to-head-lifts">
        {shown.map((lift) => {
          const leader = leaderOf(lift);
          const share =
            (lift.yours.estimated_1rm / (lift.yours.estimated_1rm + lift.theirs.estimated_1rm)) *
            100;
          const content = (
            <>
              <span className="head-to-head-values">
                <b className="num">{estimate(lift.yours, unit)}</b>
                <span>{lift.name}</span>
                <b className="num">{estimate(lift.theirs, unit)}</b>
              </span>
              <span className="head-to-head-bar" aria-hidden="true">
                <i style={{ width: `${share}%` }} />
                <i />
              </span>
              <span className="head-to-head-sets num">
                <small>{bestSet(lift.yours, unit)}</small>
                <small>{bestSet(lift.theirs, unit)}</small>
              </span>
            </>
          );
          const summary = `${lift.name}: you ${estimate(lift.yours, unit)}, ${member.display_name} ${estimate(lift.theirs, unit)}`;
          return (
            <li key={lift.yours.exercise_id} data-leader={leader}>
              {onOpenLift ? (
                <button
                  type="button"
                  aria-label={`${summary}. Show ${member.display_name}’s sessions`}
                  onClick={() => onOpenLift(lift.theirs.exercise_id)}
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
      {lifts.length > VISIBLE_LIFTS && !showAll && (
        <button type="button" className="show-more-button" onClick={() => setShowAll(true)}>
          Show all {lifts.length} lifts
        </button>
      )}
    </section>
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
