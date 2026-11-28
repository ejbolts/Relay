import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { useNow } from './presence';
import {
  inviteCountdownLabel,
  memberName,
  partnerSummary,
  type TrainMember,
  type TrainSession,
} from './trainTogether';
import { formatPartnerSetValue } from './trainTogetherFormat';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import { partnerCssVars, type PartnerPalette } from './trainTogetherTheme';
import type { WeightUnit } from './weightUnits';
import './trainTogether.css';

function partnerTickerText(
  partner: TrainMember,
  now: number,
  weightUnit: WeightUnit,
): { text: string; totalSetsDone: number; setSignature: string } {
  if (!partner.workout) {
    return { text: 'No workout open', totalSetsDone: 0, setSignature: '' };
  }
  const summary = partnerSummary(partner.workout, now);
  const setValue = summary.lastSet ? formatPartnerSetValue(summary.lastSet, weightUnit) : null;
  let text: string;
  if (summary.movementKey && setValue) {
    text = `${summary.name} · ${setValue}`;
  } else if (summary.movementKey) {
    text = `${summary.name} · Starting`;
  } else {
    text = 'Starting workout';
  }
  const sig = `${summary.totalSetsDone}:${summary.movementKey ?? ''}:${setValue ?? ''}`;
  return { text, totalSetsDone: summary.totalSetsDone, setSignature: sig };
}

/**
 * Entry point beside "Workout details" before a session starts.
 * Shows "Waiting · M:SS" while an invite code is live and no partner has joined yet.
 */
export function TrainTogetherEntryButton({
  waitingSeconds,
  onClick,
}: {
  waitingSeconds: number;
  onClick: () => void;
}) {
  const waiting = waitingSeconds > 0;
  return (
    <button
      type="button"
      className={`tt-entry-btn${waiting ? ' is-waiting' : ''}`}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      {waiting ? (
        <>
          <span className="tt-waiting-dot" aria-hidden="true" />
          <span className="num">Waiting · {inviteCountdownLabel(waitingSeconds)}</span>
        </>
      ) : (
        <>
          <Icon name="people" />
          <span>Train together</span>
        </>
      )}
    </button>
  );
}

/**
 * Option A "Live Deck": 2.5px gradient link hairline and compact partner ticker strip anchored
 * directly beneath the live workout header.
 */
export function TrainTogetherDeck({
  session,
  partners,
  palettes,
  weightUnit,
  recentlyJoinedIds,
  onLogForPartner,
  onOpenSession,
}: {
  session: TrainSession;
  partners: TrainMember[];
  palettes: PartnerPalette[];
  weightUnit: WeightUnit;
  recentlyJoinedIds: ReadonlySet<string>;
  onLogForPartner: (partnerId: string) => void;
  onOpenSession: () => void;
}) {
  const now = useNow(partners.length > 0, 30_000);
  const prevSigsRef = useRef<Map<string, string>>(new Map());
  const [flashingIds, setFlashingIds] = useState<ReadonlySet<string>>(() => new Set());
  const flashTimerRef = useRef<number | null>(null);

  const entries = partners.map((partner, index) => ({
    partner,
    palette: palettes[index],
    name: memberName(partner),
    ...partnerTickerText(partner, now, weightUnit),
  }));

  const signatureKey = entries.map((e) => `${e.partner.user_id}=${e.setSignature}`).join('|');

  useEffect(() => {
    const prev = prevSigsRef.current;
    const changed: string[] = [];
    for (const entry of entries) {
      const id = entry.partner.user_id;
      const before = prev.get(id);
      if (before !== undefined && before !== entry.setSignature && entry.totalSetsDone > 0) {
        changed.push(id);
      }
      prev.set(id, entry.setSignature);
    }
    const currentIds = new Set(entries.map((e) => e.partner.user_id));
    for (const id of [...prev.keys()]) {
      if (!currentIds.has(id)) prev.delete(id);
    }
    if (changed.length > 0) {
      setFlashingIds(new Set(changed));
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        setFlashingIds(new Set());
        flashTimerRef.current = null;
      }, 650);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureKey]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  if (entries.length === 0) return null;

  const stops = ['var(--p-accent)', ...entries.map((e) => e.palette?.accent ?? 'var(--p-accent)')];
  const hairlineGradient = `linear-gradient(90deg, ${stops.join(', ')})`;

  return (
    <div className="tt-deck-wrap" aria-label="Training together">
      <div
        className="tt-link-hairline"
        style={{ background: hairlineGradient }}
        aria-hidden="true"
      />
      <div className="tt-live-deck">
        {entries.length === 1 ? (
          (() => {
            const { partner, palette, name, text, totalSetsDone } = entries[0];
            const hasWorkout = partner.workout !== null;
            const vars = palette ? (partnerCssVars(palette) as CSSProperties) : undefined;
            const flashing = flashingIds.has(partner.user_id);
            return (
              <div className="tt-deck-partner-row" style={vars}>
                <TrainTogetherAvatar
                  person={partner}
                  size="lg"
                  palette={palette}
                  live={hasWorkout}
                  pulse={recentlyJoinedIds.has(partner.user_id)}
                />
                <div className="tt-deck-partner-copy">
                  <div className="tt-deck-name-line">
                    <span className="tt-deck-name">{name}</span>
                    {hasWorkout && (
                      <span className="tt-deck-sets-pill num">
                        {totalSetsDone} {totalSetsDone === 1 ? 'set' : 'sets'}
                      </span>
                    )}
                  </div>
                  <div
                    className={`tt-deck-ticker${hasWorkout ? '' : ' is-muted'}${flashing ? ' is-flashing' : ''}`}
                  >
                    {text}
                  </div>
                </div>
                <div className="tt-deck-actions">
                  {hasWorkout && (
                    <button
                      type="button"
                      className="tt-deck-log-btn"
                      data-tt-log-for={partner.user_id}
                      onClick={() => onLogForPartner(partner.user_id)}
                    >
                      <span>Log for {name}</span>
                      <Icon name="chevron-right" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="tt-deck-qr-btn"
                    aria-label="Train together session"
                    aria-haspopup="dialog"
                    onClick={onOpenSession}
                  >
                    <Icon name="qr" />
                  </button>
                </div>
              </div>
            );
          })()
        ) : (
          <>
            <div className="tt-deck-multi-head">
              <span className="tt-deck-multi-title num">
                Training together · {session.members.length}/{session.max_members}
              </span>
              <button
                type="button"
                className="tt-deck-session-btn"
                aria-haspopup="dialog"
                onClick={onOpenSession}
              >
                Session
              </button>
            </div>
            {entries.map(({ partner, palette, name, text }) => {
              const hasWorkout = partner.workout !== null;
              const vars = palette ? (partnerCssVars(palette) as CSSProperties) : undefined;
              const flashing = flashingIds.has(partner.user_id);
              return (
                <div
                  key={partner.user_id}
                  className={`tt-deck-mini-row${flashing ? ' is-flashing' : ''}`}
                  style={vars}
                >
                  <TrainTogetherAvatar
                    person={partner}
                    size="md"
                    palette={palette}
                    live={hasWorkout}
                    pulse={recentlyJoinedIds.has(partner.user_id)}
                  />
                  <div className={`tt-deck-ticker-inline${hasWorkout ? '' : ' is-muted'}`}>
                    <b>{name}</b> · {text}
                  </div>
                  {hasWorkout && (
                    <button
                      type="button"
                      className="tt-deck-mini-cta"
                      data-tt-log-for={partner.user_id}
                      aria-label={`Log for ${name}`}
                      onClick={() => onLogForPartner(partner.user_id)}
                    >
                      <span>Log</span>
                      <Icon name="chevron-right" />
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
