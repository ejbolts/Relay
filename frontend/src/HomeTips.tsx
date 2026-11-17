import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useTips } from './Tips';
import { multiMachineExerciseId } from './machineUsage';
import { useTrainingBlocks } from './trainingBlocksContext';
import { daysBetween } from './trainingSummary';
import { localDate } from './utils';
import { tipAction, TIP_DEFINITIONS, type TipId } from './tipsState';
import type { TrackedWorkout } from './types';

/** The most new tips the bulb counts out loud; beyond it, it says "3+". */
const COUNTED_TIPS = 3;

/**
 * Tips at the end of Home's date line: amber with a count while tips are unread, grey once read.
 * Home lists features worth opening, each with a button that opens it. How-to hints for a
 * control (dragging a set, swiping to delete) appear beside that control instead.
 */
export function HomeTips({
  workouts,
  createdAt,
  hasSplit,
  measurementCount = 0,
}: {
  workouts: TrackedWorkout[];
  createdAt?: string;
  hasSplit: boolean;
  measurementCount?: number;
}) {
  const tips = useTips();
  const { learn, readHome } = tips;
  const blocks = useTrainingBlocks();
  const real = useMemo(() => workouts.filter((workout) => !workout.is_sample), [workouts]);
  const weeks = useMemo(
    () =>
      new Set(
        real.map((workout) => {
          const date = new Date(`${workout.workout_date}T12:00:00`);
          date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
          return date.toISOString().slice(0, 10);
        }),
      ).size,
    [real],
  );
  useEffect(() => {
    if (blocks.config.blocks.length) learn('blocks');
  }, [blocks.config.blocks.length, learn]);
  useEffect(() => {
    if (hasSplit) learn('split');
  }, [hasSplit, learn]);
  const experienced = real.length >= 3;
  const oldEnough = !!createdAt && daysBetween(createdAt.slice(0, 10), localDate()) >= 7;
  // Comparing machines only helps once one exercise has been logged on two of them.
  const machineExerciseId = useMemo(() => multiMachineExerciseId(real), [real]);
  const eligible = useMemo(() => {
    // Most useful first: features that change what the app can tell you, then personal touches.
    const pool: TipId[] = [
      ...(machineExerciseId ? ['normalise' as const] : []),
      ...(weeks >= 4 && !blocks.loading && !blocks.error && blocks.config.blocks.length === 0
        ? ['blocks' as const]
        : []),
      ...(experienced && !hasSplit ? ['split' as const] : []),
      ...(hasSplit && weeks >= 3 ? ['repRange' as const] : []),
      ...(measurementCount >= 3 ? ['maintenance' as const] : []),
      ...(oldEnough ? ['home' as const] : []),
      'friends',
      'appearance',
    ];
    const done = tips.state.homeDone ?? [];
    return pool.filter(
      (id) =>
        tips.state.seen[id] !== 'learned' &&
        tips.state.seen[id] !== 'dismissed' &&
        !done.includes(id),
    );
  }, [
    machineExerciseId,
    measurementCount,
    weeks,
    blocks.loading,
    blocks.error,
    blocks.config.blocks.length,
    oldEnough,
    experienced,
    hasSplit,
    tips.state.seen,
    tips.state.homeDone,
  ]);
  const read = tips.state.homeRead ?? [];
  const unread = eligible.filter((id) => !read.includes(id));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 0, arrow: 24 });
  const popId = useId();
  const titleId = useId();
  // Stays on Home while tips are on, so tips are always one tap away.
  const shown = tips.state.enabled && tips.environment.ready;
  const current = eligible.length ? eligible[Math.min(index, eligible.length - 1)] : undefined;
  const showing = open && shown && tips.environment.page === 'dashboard';
  useEffect(() => {
    if (showing && current) readHome(current);
  }, [showing, current, readHome]);
  useLayoutEffect(() => {
    if (!showing) return;
    const measure = () => {
      const target = button.current?.getBoundingClientRect();
      const box = popover.current?.getBoundingClientRect();
      if (!target || !box) return;
      // Line up with the page gutter and point the arrow at the bulb.
      const edge = button.current?.closest('.page-header')?.getBoundingClientRect().left ?? 12;
      const left = Math.max(12, Math.min(window.innerWidth - box.width - 12, edge));
      setPosition({ left, top: target.bottom + 8, arrow: target.left + target.width / 2 - left });
    };
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !button.current?.contains(event.target) &&
        !popover.current?.contains(event.target)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [showing]);
  if (!shown) return null;
  const definition = current ? TIP_DEFINITIONS[current] : null;
  const tip = definition
    ? {
        title: definition.title,
        body: 'homeBody' in definition ? definition.homeBody : definition.body,
      }
    : { title: "You're all caught up", body: 'New tips appear here as you use more of Relay.' };
  const action = current ? tipAction(current) : null;
  const toggle = () => {
    // Open on the first unread tip, or the first tip once everything has been read.
    if (!showing) setIndex(Math.max(0, eligible.indexOf(unread[0])));
    setOpen(!showing);
  };
  const gotIt = () => {
    // Put away here only: the same tip can still appear beside the control it describes.
    if (current) tips.doneHome(current);
    setOpen(false);
    button.current?.focus();
  };
  const count = unread.length > COUNTED_TIPS ? `${COUNTED_TIPS}+` : String(unread.length);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`home-tip-button${unread.length ? ' is-unread' : ''}`}
        aria-label={unread.length ? `Tips, ${unread.length} new` : 'Tips'}
        aria-expanded={showing}
        aria-controls={popId}
        onClick={toggle}
      >
        <Icon name="bulb" />
        <span aria-hidden="true">{unread.length ? count : 'Tips'}</span>
      </button>
      {showing &&
        createPortal(
          <aside
            ref={popover}
            id={popId}
            role="dialog"
            aria-labelledby={titleId}
            className="relay-tip-popover home-tip-popover"
            style={
              {
                left: position.left,
                top: position.top,
                '--home-tip-arrow': `${position.arrow}px`,
              } as CSSProperties
            }
          >
            <strong id={titleId}>{tip.title}</strong>
            <p>{tip.body}</p>
            {current && action && (
              <button
                type="button"
                className="home-tip-action"
                onClick={() => {
                  setOpen(false);
                  tips.act(
                    current,
                    current === 'normalise' ? (machineExerciseId ?? undefined) : undefined,
                  );
                }}
              >
                {action.label}
                <Icon name="chevron-right" />
              </button>
            )}
            <footer>
              {current && eligible.length > 1 && (
                <span
                  className="home-tip-dots"
                  role="img"
                  aria-label={`Tip ${eligible.indexOf(current) + 1} of ${eligible.length}`}
                >
                  {eligible.map((id) => (
                    <i key={id} className={id === current ? 'is-current' : undefined} />
                  ))}
                </span>
              )}
              <span className="home-tip-actions">
                {current && eligible.length > 1 && (
                  <button
                    type="button"
                    className="relay-tip-link"
                    onClick={() => setIndex((eligible.indexOf(current) + 1) % eligible.length)}
                  >
                    Next
                  </button>
                )}
                <button type="button" className="home-tip-done" onClick={gotIt}>
                  {current ? 'Got it' : 'Done'}
                </button>
              </span>
            </footer>
          </aside>,
          document.body,
        )}
    </>
  );
}
