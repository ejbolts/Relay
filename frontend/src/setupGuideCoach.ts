import {
  blocksGuideSteps,
  splitTemplateStep,
  type FavouriteLift,
  type GuideFacts,
} from './setupGuideSteps';
import { SPLIT_GUIDE_COPY } from './splitGuideCopy';
import type { Routine } from './types';

/**
 * The setup guides' coaching inside each feature's own screens: which step shows, what it says,
 * which control it is about and when it moves on. Shared by the web, which highlights a control
 * by its selector, and the app, which highlights the control marked with the same target.
 */

/** The control a coach step is about. Each client maps it to its own control. */
export type CoachTarget =
  | 'split.templates'
  | 'split.edit'
  | 'split.use'
  | 'split.days'
  | 'split.reps'
  | 'split.save'
  | 'split.confirm'
  | 'blocks.name'
  | 'blocks.start'
  | 'blocks.end'
  | 'blocks.submit'
  | 'normalise.switch'
  | 'normalise.reference'
  | 'normalise.match'
  | 'normalise.save';

export interface CoachStepPlan {
  title: string;
  body: string;
  target: CoachTarget;
  /** The split the control belongs to, for a control on one split's card. */
  routineId?: string;
  /**
   * Moves to the following step. Steps that finish by themselves (a switch turned on, a feature
   * saved or a sheet opened) have none.
   */
  next?: { disabled: boolean };
}

/** A step with its place in the guide. */
export interface CoachPlace {
  step: CoachStepPlan;
  index: number;
  total: number;
}

// Splits

/** With an active split the guide adds rep ranges to it; otherwise it builds and starts one. */
export type SplitGuideFlow = 'new' | 'edit';

export const splitGuideFlow = (activeId: string | null | undefined): SplitGuideFlow =>
  activeId ? 'edit' : 'new';

/** Template, plan days, rep range, save, then Use split and its confirmation. */
export const NEW_SPLIT_STEPS = 6;

export const splitHasExercises = (routine: Pick<Routine, 'days'>) =>
  routine.days.some((day) => day.workout_type_id !== null && day.movements.length > 0);

/** The editor's guide steps: planning days is skipped when an existing split already has them. */
export function splitEditorGuide(flow: SplitGuideFlow, routine: Pick<Routine, 'days'>) {
  const plan = flow === 'new' || !splitHasExercises(routine);
  return {
    flow,
    plan,
    offset: 1,
    total: flow === 'new' ? NEW_SPLIT_STEPS : 1 + (plan ? 1 : 0) + 2,
  };
}
export type SplitEditorGuide = ReturnType<typeof splitEditorGuide>;

/** The guide's step on the splits page itself, outside the editor. */
export function splitPageCoach(
  guide: { useRoutineId?: string; facts: Pick<GuideFacts, 'rotation'> },
  flow: SplitGuideFlow,
  activeId: string | null | undefined,
  routines: Pick<Routine, 'id' | 'days'>[] | null | undefined,
): CoachPlace {
  if (guide.useRoutineId)
    return {
      step: {
        title: SPLIT_GUIDE_COPY.use.title,
        body: SPLIT_GUIDE_COPY.use.body,
        target: 'split.use',
        routineId: guide.useRoutineId,
      },
      index: NEW_SPLIT_STEPS - 2,
      total: NEW_SPLIT_STEPS,
    };
  if (flow === 'edit') {
    const active = routines?.find((routine) => routine.id === activeId);
    return {
      step: {
        title: 'Open your split',
        body: 'Rep ranges live on each planned exercise. Tap Edit split.',
        target: 'split.edit',
        routineId: activeId ?? undefined,
      },
      index: 0,
      total: active ? splitEditorGuide('edit', active).total : 3,
    };
  }
  return {
    step: { ...splitTemplateStep(guide.facts.rotation), target: 'split.templates' },
    index: 0,
    total: NEW_SPLIT_STEPS,
  };
}

export type SplitEditorStage = 'plan' | 'reps' | 'save';

export const splitEditorFirstStage = (guide: SplitEditorGuide | undefined): SplitEditorStage =>
  guide?.plan ? 'plan' : 'reps';

/** Where the editor's stage sits among the guide's steps. */
export const splitEditorIndex = (guide: SplitEditorGuide, stage: SplitEditorStage) =>
  guide.offset +
  (stage === 'plan' ? 0 : stage === 'reps' ? Number(guide.plan) : Number(guide.plan) + 1);

/** The stage before this one, or null on the editor's first step. */
export function splitEditorPreviousStage(
  guide: SplitEditorGuide | undefined,
  stage: SplitEditorStage,
): SplitEditorStage | null {
  if (stage === 'save') return 'reps';
  if (stage === 'reps' && guide?.plan) return 'plan';
  return null;
}

/** The stage Next moves to. */
export const splitEditorNextStage = (stage: SplitEditorStage): SplitEditorStage =>
  stage === 'plan' ? 'reps' : 'save';

/**
 * The editor's current step. `weight` formats the favourite lift's latest top set in the
 * person's unit.
 */
export function splitEditorCoach(
  stage: SplitEditorStage,
  guide: SplitEditorGuide | undefined,
  value: Pick<Routine, 'days'>,
  lift: FavouriteLift | null | undefined,
  weight: (kg: number) => string,
): CoachStepPlan {
  if (stage === 'plan')
    return {
      title: SPLIT_GUIDE_COPY.plan.title,
      body: SPLIT_GUIDE_COPY.plan.body,
      target: 'split.days',
      next: { disabled: !splitHasExercises(value) },
    };
  if (stage === 'reps')
    return {
      title: SPLIT_GUIDE_COPY.reps.title,
      body: lift
        ? `Choose Reps on an exercise. With 8–12, stay at ${weight(lift.latestTopKg)} on ${lift.name} until every top set reaches 12 reps, then add weight. Relay says which while you log.`
        : SPLIT_GUIDE_COPY.reps.body,
      target: 'split.reps',
      next: {
        disabled: !value.days.some((item) => item.movements.some((m) => m.rep_range)),
      },
    };
  return {
    title: SPLIT_GUIDE_COPY.save.title,
    body:
      guide?.flow === 'new'
        ? SPLIT_GUIDE_COPY.save.body
        : 'Tap Save. Your next workout shows the target as you log.',
    target: 'split.save',
  };
}

/**
 * After the editor saves: saving the active split finishes the guide; a new one still needs
 * starting, so the guide moves on to Use split for it.
 */
export function splitSavedOutcome(
  savedId: string,
  activeId: string | null | undefined,
  legacyEdit: boolean,
): { finish: true } | { finish: false; useRoutineId: string } {
  return savedId === activeId || legacyEdit
    ? { finish: true }
    : { finish: false, useRoutineId: savedId };
}

/** The last step, in Use split's confirmation. */
export const splitConfirmCoach = (): CoachPlace => ({
  step: {
    title: 'Pick a start date',
    body: SPLIT_GUIDE_COPY.confirm.body,
    target: 'split.confirm',
  },
  index: NEW_SPLIT_STEPS - 1,
  total: NEW_SPLIT_STEPS,
});

// Training blocks

/** The training blocks guide inside a new block's form, in the order of the form. */
export function blocksCoachSteps(
  lift: FavouriteLift | null | undefined,
  name: string,
): CoachStepPlan[] {
  const copy = blocksGuideSteps(lift ?? null);
  return [
    { ...copy[0], target: 'blocks.name', next: { disabled: !name.trim() } },
    { ...copy[1], target: 'blocks.start', next: { disabled: false } },
    { ...copy[2], target: 'blocks.end', next: { disabled: false } },
    { ...copy[3], target: 'blocks.submit' },
  ];
}

// Machine weights

/** The machine weights guide starts on its switch, or past it when normalising is already on. */
export const normaliseFirstStep = (enabled: boolean) => (enabled ? 1 : 0);

/** Turning the switch on is the guide's first step; switching it off again returns there. */
export const normaliseStepAfterToggle = (step: number, enabled: boolean) =>
  !enabled ? 0 : step === 0 ? 1 : step;

interface CoachMachine {
  id: string;
  machine_kg?: number | null;
  reference_kg?: number | null;
}

export function normaliseCoachSteps({
  exerciseName,
  enabled,
  referenceId,
  machines,
  suggested,
}: {
  exerciseName: string;
  enabled: boolean;
  referenceId: string | null | undefined;
  /** The machines with their typed pairs so far. */
  machines: CoachMachine[];
  /** Whether Relay matched a machine from its history. */
  suggested: (machineId: string) => boolean;
}): CoachStepPlan[] {
  const spokes = machines.filter((machine) => machine.id !== referenceId);
  // Machines with no sessions yet have nothing to work a match out from.
  const unmatched = spokes.some((machine) => !suggested(machine.id));
  return [
    {
      title: 'Switch on Normalise weights',
      body: `Your ${exerciseName} machines weigh differently, so the same number is a different effort on each. This shows every session in one machine’s weights.`,
      target: 'normalise.switch',
      next: { disabled: !enabled },
    },
    {
      title: 'Check the reference machine',
      body: 'Relay picked the machine you use most and matched your other machines to it from your history. Tap Make reference on another machine to change it.',
      target: 'normalise.reference',
      next: { disabled: false },
    },
    {
      title: 'Match the weights',
      body: unmatched
        ? 'Relay matched the machines you’ve used from your history; enter both weights for any without sessions. Drag a slider to adjust a match and watch the preview.'
        : 'Relay worked out each match from your history. Drag the slider to adjust it and watch your sessions line up in the preview.',
      target: 'normalise.match',
      next: { disabled: spokes.some((machine) => !machine.machine_kg || !machine.reference_kg) },
    },
    {
      title: 'Save it',
      body: 'Your logged sets keep the weights you entered. Only the All machines chart is converted.',
      target: 'normalise.save',
    },
  ];
}
