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
import { api } from './api';
import { weightGoalReached } from './bodyMeasurementHistory';
import { Icon } from './Icon';
import { homeTipCopy, homeTipCount, homeTipFacts, homeTipList } from './homeTipList';
import { useTips } from './Tips';
import { useTrainingBlocks } from './trainingBlocksContext';
import { localDate } from './utils';
import { tipAction } from './tipsState';
import { GUIDE_FOR_TIP, openSetupGuide } from './setupGuides';
import type { BodyWeightGoal, TrackedWorkout } from './types';

/**
 * Tips at the end of Home's date line: amber with a count while tips are unread, grey once read.
 * Home lists features worth opening, each with a button that opens it. How-to hints for a
 * control (dragging a set, swiping to delete) appear beside that control instead.
 */
export function HomeTips({
  workouts,
  createdAt,
  hasSplit,
  latestWeightKg = null,
}: {
  workouts: TrackedWorkout[];
  createdAt?: string;
  hasSplit: boolean;
  /** The latest weigh-in, which decides whether the weight goal has been reached. */
  latestWeightKg?: number | null;
}) {
  const tips = useTips();
  const { learn, readHome } = tips;
  const blocks = useTrainingBlocks();
  useEffect(() => {
    if (blocks.config.blocks.length) learn('blocks');
  }, [blocks.config.blocks.length, learn]);
  useEffect(() => {
    if (hasSplit) learn('split');
  }, [hasSplit, learn]);
  // A maintenance range is worth raising once a loss or gain goal is reached, as on Body.
  const hasWeighIn = latestWeightKg !== null;
  const [goals, setGoals] = useState<BodyWeightGoal[] | null>(null);
  useEffect(() => {
    if (!hasWeighIn) return;
    let cancelled = false;
    void api
      .listBodyWeightGoals()
      .then((loaded) => {
        if (!cancelled) setGoals(loaded);
      })
      // Without the goals the tip simply stays out of the list.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasWeighIn]);
  const goalReached = weightGoalReached(
    goals?.find((goal) => goal.active),
    latestWeightKg,
  );
  const blockCount = blocks.loading || blocks.error ? null : blocks.config.blocks.length;
  // Read on every render, so Home left open across midnight sees the new day.
  const today = localDate();
  const facts = useMemo(
    () => homeTipFacts({ workouts, createdAt, today, blockCount, hasSplit, goalReached }),
    [workouts, createdAt, today, blockCount, hasSplit, goalReached],
  );
  const { machineExerciseId } = facts;
  const eligible = useMemo(() => homeTipList(facts, tips.state), [facts, tips.state]);
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
  const tip = homeTipCopy(current);
  const action = current ? tipAction(current) : null;
  const guide = current ? GUIDE_FOR_TIP[current] : undefined;
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
  const count = homeTipCount(unread.length);
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
            {current && guide ? (
              <button
                type="button"
                className="home-tip-action"
                onClick={() => {
                  // The guide ends with the tip's own button, after explaining the feature.
                  setOpen(false);
                  openSetupGuide(guide);
                }}
              >
                Show me how
                <Icon name="chevron-right" />
              </button>
            ) : (
              current &&
              action && (
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
              )
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
