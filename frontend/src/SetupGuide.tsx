import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { multiMachineExerciseId } from './machineUsage';
import { PopupDialog } from './PopupDialog';
import { progressionTarget } from './repProgression';
import {
  favouriteLift,
  latestWorkoutPlan,
  machineComparison,
  onSetupGuide,
  openSetupGuide,
  recentRotation,
  SETUP_GUIDE_IDS,
  type GuideMachine,
  type MachineComparison,
  type SetupGuideId,
} from './setupGuides';
import { useTips } from './Tips';
import { useTrainingBlocks } from './trainingBlocksContext';
import { useWeightUnit } from './trainingPreferencesContext';
import type { TipId } from './tipsState';
import type { TrackedSet, TrackedWorkout } from './types';
import { formatWeight, weightFromKg, weightToKg, type WeightUnit } from './weightUnits';
import './setupGuide.css';

interface GuideStep {
  icon: IconName;
  title: string;
  body: string;
  visual?: ReactNode;
}

interface GuideContent {
  title: string;
  /** The tip whose button and progress this guide shares. */
  tip: TipId;
  steps: GuideStep[];
  action: { label: string; exerciseId?: string };
}

/** The nearest weight people actually load: 2.5 kg, or 5 lb when training in pounds. */
function loadable(kg: number, unit: WeightUnit): number {
  if (unit === 'lb')
    return weightToKg(Math.max(5, Math.round(weightFromKg(kg, 'lb') / 5) * 5), 'lb');
  return Math.max(2.5, Math.round(kg / 2.5) * 2.5);
}

const weight = (kg: number, unit: WeightUnit) => formatWeight(kg, unit, 1);

function MachineList({
  machines,
  unit,
  reference = false,
}: {
  machines: GuideMachine[];
  unit: WeightUnit;
  reference?: boolean;
}) {
  return (
    <ul className="setup-guide-machines">
      {machines.slice(0, 4).map((machine, index) => (
        <li key={machine.id} className={reference && index === 0 ? 'is-reference' : undefined}>
          <span>
            {reference && index === 0 && <em>★ Reference</em>}
            <strong>{machine.caption}</strong>
          </span>
          <small>
            {machine.sessions} {machine.sessions === 1 ? 'session' : 'sessions'}
            {machine.topKg !== null && ` · top ${weight(machine.topKg, unit)}`}
          </small>
        </li>
      ))}
    </ul>
  );
}

function MachineEquation({
  comparison,
  unit,
}: {
  comparison: MachineComparison | null;
  unit: WeightUnit;
}) {
  const [reference, other] = comparison?.machines ?? [];
  const otherKg = loadable(other?.topKg ?? 50, unit);
  const referenceKg = loadable(reference?.topKg ?? 70, unit);
  return (
    <div className="setup-guide-equation" aria-hidden="true">
      <span>
        <small>{other?.caption ?? 'Another machine'}</small>
        <b>{weight(otherKg, unit)}</b>
      </span>
      <i>=</i>
      <span className="is-reference">
        <small>★ {reference?.caption ?? 'Your usual machine'}</small>
        <b>{weight(referenceKg, unit)}</b>
      </span>
    </div>
  );
}

function normaliseGuide(workouts: TrackedWorkout[], unit: WeightUnit): GuideContent {
  const exerciseId = multiMachineExerciseId(workouts);
  const comparison = exerciseId ? machineComparison(workouts, exerciseId) : null;
  const lift = comparison?.exerciseName;
  return {
    title: 'Compare machines',
    tip: 'normalise',
    steps: [
      {
        icon: 'trend',
        title: 'One lift, several machines',
        body: comparison
          ? `You’ve logged ${lift} on ${comparison.machines.length} machines. Their stacks weigh differently, so the same number is a different effort on each and your progress chart jumps between them.`
          : 'Machines for the same lift rarely have matching stacks, so the same number is a different effort on each and your progress chart jumps between them.',
        visual: comparison && <MachineList machines={comparison.machines} unit={unit} />,
      },
      {
        icon: 'trophy',
        title: 'Choose a reference machine',
        body: 'Pick the machine you use most. The All machines chart shows every session in its weights.',
        visual: comparison && <MachineList machines={comparison.machines} unit={unit} reference />,
      },
      {
        icon: 'level',
        title: 'Match one weight per machine',
        body: 'For each other machine, enter a weight and what feels the same on the reference. Relay suggests a match from your sessions and previews the joined-up chart.',
        visual: <MachineEquation comparison={comparison} unit={unit} />,
      },
      {
        icon: 'check',
        title: 'Your logged weights stay put',
        body: comparison
          ? 'Only the All machines chart is converted. Sets, records and history keep the weights you entered, and you can switch it off at any time.'
          : 'Only the All machines chart is converted. Once you log one exercise on two saved machines, open it in Exercises and choose Normalise.',
      },
    ],
    action: comparison
      ? { label: `Set up ${lift}`, exerciseId: comparison.exerciseId }
      : { label: 'Open Exercises' },
  };
}

function BlockRecords({ workouts, unit }: { workouts: TrackedWorkout[]; unit: WeightUnit }) {
  const lift = favouriteLift(workouts);
  const best = lift?.bestKg ?? 100;
  const name = lift?.name ?? 'Bench press';
  return (
    <ul className="setup-guide-records">
      <li>
        <em className="is-block">Block PR</em>
        <span>
          {name} {weight(loadable(best * 0.85, unit), unit)}
          <small>Best since this block started</small>
        </span>
      </li>
      <li>
        <em>All-time PR</em>
        <span>
          {name} {weight(loadable(best + 2.5, unit), unit)}
          <small>Best you’ve ever lifted</small>
        </span>
      </li>
    </ul>
  );
}

const BLOCK_MOMENTS = [
  'Starting a new programme',
  'Back after 10 or more days off',
  'Switching between cutting and bulking',
  'Three weeks without a new record',
];

function BlockWeeks() {
  return (
    <div className="setup-guide-weeks" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className={index < 3 ? 'is-done' : index === 3 ? 'is-now' : undefined} />
      ))}
      <small>Week 4 of 12 · 56 days left</small>
    </div>
  );
}

function blocksGuide(
  workouts: TrackedWorkout[],
  unit: WeightUnit,
  hasBlocks: boolean,
): GuideContent {
  const lift = favouriteLift(workouts);
  return {
    title: 'Training blocks',
    tip: 'blocks',
    steps: [
      {
        icon: 'calendar',
        title: 'A phase with its own start',
        body: 'A training block is a named stretch of training, such as Strength or a cut, with a start date and an optional planned end. Every workout and record stays in your history.',
      },
      {
        icon: 'trophy',
        title: 'Records that fit the phase',
        body: lift
          ? `Your best ${lift.name} is ${weight(lift.bestKg, unit)}. In a new block your first session sets a fresh baseline, so beating it earns a Block PR even below your all-time best.`
          : 'In a new block your first session of each lift sets a fresh baseline, so beating it earns a Block PR even below your all-time best.',
        visual: <BlockRecords workouts={workouts} unit={unit} />,
      },
      {
        icon: 'next',
        title: 'When to start one',
        body: 'These are good moments. Relay’s weekly review suggests a block when it spots one.',
        visual: (
          <ul className="setup-guide-moments">
            {BLOCK_MOMENTS.map((moment) => (
              <li key={moment}>
                <Icon name="check" />
                {moment}
              </li>
            ))}
          </ul>
        ),
      },
      {
        icon: 'timer',
        title: 'Pick the dates',
        body: 'Start today, on 1 January or on a past date to include recent workouts, and plan an end after 8 or 12 weeks if you like. Home then shows your week and compares it with your last block.',
        visual: <BlockWeeks />,
      },
    ],
    action: { label: hasBlocks ? 'Start a new block' : 'Start a block' },
  };
}

function Rotation({ names }: { names: string[] }) {
  const shown = names.length >= 2 ? names : ['Upper', 'Lower', 'Rest', 'Upper', 'Lower'];
  return (
    <ol className="setup-guide-rotation">
      {shown.map((name, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <li aria-hidden="true" className="setup-guide-rotation-arrow">
              <Icon name="chevron-right" />
            </li>
          )}
          <li>{name}</li>
        </Fragment>
      ))}
      <li aria-hidden="true" className="setup-guide-rotation-arrow">
        <Icon name="chevron-right" />
      </li>
      <li className="is-next">Up next</li>
    </ol>
  );
}

const SESSION_REPS = [
  [10, 9, 8],
  [12, 11, 10],
  [12, 12, 12],
];

function Progression({ name, kg, unit }: { name: string; kg: number; unit: WeightUnit }) {
  const range = { min: 8, max: 12 };
  return (
    <table className="setup-guide-progression">
      <caption>
        {name} · {weight(kg, unit)} · 8–12 reps
      </caption>
      <thead>
        <tr>
          <th scope="col">Session</th>
          <th scope="col">Reps</th>
          <th scope="col">Next time</th>
        </tr>
      </thead>
      <tbody>
        {SESSION_REPS.map((reps, index) => {
          const sets = reps.map(
            (count) =>
              ({
                reps: count,
                weight_kg: kg,
                warmup: false,
                set_type: 'normal',
                completed: true,
              }) as Pick<TrackedSet, 'reps' | 'weight_kg' | 'warmup' | 'set_type' | 'completed'>,
          );
          const target = progressionTarget(range, sets, unit);
          const up = target.kind === 'increase' && target.nextWeightKg !== null;
          return (
            <tr key={index} className={up ? 'is-up' : undefined}>
              <th scope="row">{index + 1}</th>
              <td>{reps.join(', ')}</td>
              <td>
                {up && target.kind === 'increase'
                  ? `Go up to ${weight(target.nextWeightKg!, unit)}`
                  : `Stay at ${weight(kg, unit)}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PlannedDay({ workouts }: { workouts: TrackedWorkout[] }) {
  const plan = latestWorkoutPlan(workouts) ?? {
    name: 'Push',
    exercises: [
      { name: 'Bench press', sets: 3 },
      { name: 'Overhead press', sets: 3 },
      { name: 'Triceps pushdown', sets: 2 },
    ],
  };
  return (
    <div className="setup-guide-day">
      <strong>{plan.name}</strong>
      <ul>
        {plan.exercises.map((exercise) => (
          <li key={exercise.name}>
            <span>{exercise.name}</span>
            <small>
              {exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function splitGuide(workouts: TrackedWorkout[], unit: WeightUnit, hasSplit: boolean): GuideContent {
  const rotation = recentRotation(workouts);
  const lift = favouriteLift(workouts);
  const kg = loadable(lift?.latestTopKg ?? 60, unit);
  const name = lift?.name ?? 'Bench press';
  return {
    title: 'Splits and rep ranges',
    tip: hasSplit ? 'repRange' : 'split',
    steps: [
      {
        icon: 'calendar',
        title: 'Save the order you train in',
        body:
          rotation.length >= 2
            ? `Your recent workouts went ${rotation.join(', ')}. Save that order as a split, rest days included, and Up next on Home always knows what comes next.`
            : 'Save the order you train in as a split, rest days included, and Up next on Home always knows what comes next. Templates such as Upper / Lower and Push Pull Legs get you started.',
        visual: <Rotation names={rotation} />,
      },
      {
        icon: 'edit',
        title: 'Plan each day',
        body: 'Add exercises and set counts to a day. Starting that workout fills them in, with your last weights ready.',
        visual: <PlannedDay workouts={workouts} />,
      },
      {
        icon: 'up',
        title: 'Give exercises a rep range',
        body: `With a range such as 8–12, stay at ${weight(kg, unit)} on ${name} until every top set reaches 12 reps, then add weight. Relay shows which to do as you log.`,
        visual: <Progression name={name} kg={kg} unit={unit} />,
      },
    ],
    action: { label: hasSplit ? 'Open your split' : 'Set up your split' },
  };
}

/** A step-by-step guide to one feature, ending with a button that opens it. */
export function SetupGuide({
  id,
  workouts,
  onClose,
}: {
  id: SetupGuideId;
  workouts: TrackedWorkout[];
  onClose: () => void;
}) {
  const tips = useTips();
  const { engage } = tips;
  const unit = useWeightUnit();
  const blocks = useTrainingBlocks();
  const hasSplit = tips.state.seen.split === 'learned';
  const hasBlocks = blocks.config.blocks.length > 0;
  const guide = useMemo(
    () =>
      id === 'normalise'
        ? normaliseGuide(workouts, unit)
        : id === 'blocks'
          ? blocksGuide(workouts, unit, hasBlocks)
          : splitGuide(workouts, unit, hasSplit),
    [id, workouts, unit, hasBlocks, hasSplit],
  );
  const [index, setIndex] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const step = guide.steps[index];
  const last = index === guide.steps.length - 1;
  useEffect(() => {
    // Reading the guide counts as opening its tip, so the tip need not appear by itself again.
    engage(guide.tip);
  }, [engage, guide.tip]);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    const body = document.querySelector('.setup-guide-body');
    if (body) body.scrollTop = 0;
  }, [index]);
  return (
    <PopupDialog
      title={guide.title}
      kicker={`SETUP GUIDE · ${index + 1} OF ${guide.steps.length}`}
      className="setup-guide"
      onClose={onClose}
    >
      <div className="setup-guide-body">
        <div className="setup-guide-step" key={index}>
          <span className="setup-guide-glyph">
            <Icon name={step.icon} />
          </span>
          <h3 ref={titleRef} tabIndex={-1}>
            {step.title}
          </h3>
          <p>{step.body}</p>
          {step.visual && <div className="setup-guide-visual">{step.visual}</div>}
        </div>
        <div
          className="setup-guide-progress"
          role="img"
          aria-label={`Step ${index + 1} of ${guide.steps.length}`}
        >
          {guide.steps.map((item, itemIndex) => (
            <span key={item.title} className={itemIndex <= index ? 'complete' : undefined} />
          ))}
        </div>
      </div>
      <footer className="popup-dialog-actions">
        {/* Later steps keep Back in this place; the header's close button still leaves. */}
        {index === 0 ? (
          <button type="button" className="setup-guide-close" onClick={onClose}>
            Not now
          </button>
        ) : (
          <button type="button" className="setup-guide-back" onClick={() => setIndex(index - 1)}>
            Back
          </button>
        )}
        {last ? (
          <button
            type="button"
            className="popup-primary-action"
            onClick={() => {
              onClose();
              tips.act(guide.tip, guide.action.exerciseId);
            }}
          >
            {guide.action.label}
          </button>
        ) : (
          <button
            type="button"
            className="popup-primary-action"
            onClick={() => setIndex(index + 1)}
          >
            Next <span aria-hidden="true">→</span>
          </button>
        )}
      </footer>
    </PopupDialog>
  );
}

/** Opens whichever guide was asked for, from a tip, Settings or anywhere else. */
export function SetupGuideHost({ workouts }: { workouts: TrackedWorkout[] }) {
  const [open, setOpen] = useState<SetupGuideId | null>(null);
  useEffect(() => onSetupGuide(setOpen), []);
  if (!open) return null;
  return <SetupGuide key={open} id={open} workouts={workouts} onClose={() => setOpen(null)} />;
}

const GUIDE_ROWS: Record<SetupGuideId, { title: string; icon: IconName }> = {
  normalise: { title: 'Compare machines', icon: 'level' },
  blocks: { title: 'Training blocks', icon: 'calendar' },
  split: { title: 'Splits and rep ranges', icon: 'up' },
};

/** Whether the feature a guide explains is already set up. */
function guideDone(id: SetupGuideId, seen: Partial<Record<TipId, string>>, hasBlocks: boolean) {
  if (id === 'normalise') return seen.normalise === 'learned';
  if (id === 'blocks') return hasBlocks || seen.blocks === 'learned';
  return seen.split === 'learned' && seen.repRange === 'learned';
}

export function SetupGuidesSettings() {
  const tips = useTips();
  const blocks = useTrainingBlocks();
  const hasBlocks = blocks.config.blocks.length > 0;
  return (
    <section className="settings-panel panel" aria-labelledby="setup-guides-settings-title">
      <header>
        <h2 id="setup-guides-settings-title">Setup guides</h2>
      </header>
      <ul className="setup-guide-list">
        {SETUP_GUIDE_IDS.map((id) => {
          const row = GUIDE_ROWS[id];
          const done = guideDone(id, tips.state.seen, hasBlocks);
          return (
            <li key={id}>
              <button type="button" onClick={() => openSetupGuide(id)}>
                <span className="setup-guide-list-glyph">
                  <Icon name={row.icon} />
                </span>
                <strong>{row.title}</strong>
                {done && <span className="setup-guide-list-done">Set up</span>}
                <Icon name="chevron-right" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
