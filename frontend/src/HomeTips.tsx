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
import { useTrainingBlocks } from './trainingBlocksContext';
import { daysBetween } from './trainingSummary';
import { localDate } from './utils';
import { runningAsInstalledApp } from './homeScreenGuideState';
import { TIP_DEFINITIONS, type TipId } from './tipsState';
import type { TrackedWorkout } from './types';

/** A bulb beside Home's date: amber while a tip is unread, grey once read, gone when none are left. */
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
  const weeks = new Set(
    workouts
      .filter((workout) => !workout.is_sample)
      .map((workout) => {
        const date = new Date(`${workout.workout_date}T12:00:00`);
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        return date.toISOString().slice(0, 10);
      }),
  ).size;
  useEffect(() => {
    if (blocks.config.blocks.length) learn('blocks');
  }, [blocks.config.blocks.length, learn]);
  useEffect(() => {
    if (hasSplit) learn('split');
  }, [hasSplit, learn]);
  const experienced = workouts.filter((workout) => !workout.is_sample).length >= 3;
  const oldEnough = !!createdAt && daysBetween(createdAt.slice(0, 10), localDate()) >= 7;
  const real = workouts.filter((workout) => !workout.is_sample);
  const exercises = real
    .flatMap((workout) => workout.movements ?? [])
    .map((movement) => movement.exercise);
  const hasMachines = exercises.some((exercise) => /machine|cable/i.test(exercise.equipment ?? ''));
  const hasBarbell = exercises.some((exercise) => /barbell/i.test(exercise.equipment ?? ''));
  const hasCardio = exercises.some((exercise) => exercise.kind === 'cardio');
  const eligible = useMemo(() => {
    const pool: TipId[] = [
      'reorder',
      'swipe',
      ...(hasBarbell ? ['plates' as const] : []),
      ...(hasMachines ? ['normalise' as const, 'mergeMachines' as const, 'machine' as const] : []),
      ...(measurementCount >= 3 ? ['maintenance' as const] : []),
      ...(hasCardio ? ['cardio' as const] : []),
      ...(real.length >= 5 ? ['swap' as const] : []),
      ...(weeks >= 4 && !blocks.loading && !blocks.error && blocks.config.blocks.length === 0
        ? ['blocks' as const]
        : []),
      ...(oldEnough ? ['home' as const] : []),
      ...(experienced && !hasSplit ? ['split' as const] : []),
      'friends',
      ...(typeof window !== 'undefined' && runningAsInstalledApp() ? ['back' as const] : []),
    ];
    return pool.filter(
      (id) => tips.state.seen[id] !== 'learned' && tips.state.seen[id] !== 'dismissed',
    );
  }, [
    hasBarbell,
    hasMachines,
    hasCardio,
    measurementCount,
    real.length,
    weeks,
    blocks.loading,
    blocks.error,
    blocks.config.blocks.length,
    oldEnough,
    experienced,
    hasSplit,
    tips.state.seen,
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
  // Before a first saved workout, Home stays free of tips.
  const shown =
    tips.state.enabled &&
    tips.environment.ready &&
    tips.environment.workoutCount > 0 &&
    eligible.length > 0;
  const current = eligible[Math.min(index, eligible.length - 1)];
  const showing = open && shown && tips.environment.page === 'dashboard' && !!current;
  useEffect(() => {
    if (showing) readHome(current);
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
  const tip = TIP_DEFINITIONS[current];
  const toggle = () => {
    // Open on the first unread tip, or the first tip once everything has been read.
    if (!showing) setIndex(Math.max(0, eligible.indexOf(unread[0])));
    setOpen(!showing);
  };
  const gotIt = () => {
    tips.dismissTip(current);
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`home-tip-button${unread.length ? ' is-unread' : ''}`}
        aria-label={unread.length ? 'Tip, new' : 'Tip'}
        aria-expanded={showing}
        aria-controls={popId}
        onClick={toggle}
      >
        <Icon name="bulb" />
        <span aria-hidden="true">Tip</span>
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
            <footer>
              {eligible.length > 1 && (
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
                {eligible.length > 1 && (
                  <button
                    type="button"
                    className="relay-tip-link"
                    onClick={() => setIndex((eligible.indexOf(current) + 1) % eligible.length)}
                  >
                    Next
                  </button>
                )}
                <button type="button" className="home-tip-done" onClick={gotIt}>
                  Got it
                </button>
              </span>
            </footer>
          </aside>,
          document.body,
        )}
    </>
  );
}
