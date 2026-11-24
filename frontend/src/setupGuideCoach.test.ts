import { describe, expect, it, vi } from 'vitest';
import {
  blocksCoachSteps,
  NEW_SPLIT_STEPS,
  normaliseCoachSteps,
  normaliseFirstStep,
  normaliseStepAfterToggle,
  splitConfirmCoach,
  splitEditorCoach,
  splitEditorFirstStage,
  splitEditorGuide,
  splitEditorIndex,
  splitEditorNextStage,
  splitEditorPreviousStage,
  splitGuideFlow,
  splitPageCoach,
  splitSavedOutcome,
} from './setupGuideCoach';
import { setupGuideRun } from './setupGuideRun';
import { SPLIT_GUIDE_COPY } from './splitGuideCopy';
import type { Routine, RoutineDay } from './types';

const lift = { name: 'Bench press', sessions: 6, latestTopKg: 80, bestKg: 85 };
const day = (movements: Partial<RoutineDay['movements'][number]>[] = []): RoutineDay =>
  ({
    workout_type_id: 'upper',
    workout_type: null,
    movements: movements.map((movement) => ({ exercise_id: 'bench', ...movement })),
  }) as RoutineDay;
const rest = { workout_type_id: null, workout_type: null, movements: [] } as RoutineDay;
const routine = (days: RoutineDay[], id = 'r1') => ({ id, days }) as Routine;

describe('split coaching', () => {
  it('builds a new split without an active one and adds rep ranges to an active one', () => {
    expect(splitGuideFlow(null)).toBe('new');
    expect(splitGuideFlow('r1')).toBe('edit');
  });

  it('plans days in a new split, and in an active split without exercises', () => {
    expect(splitEditorGuide('new', routine([day([{}])]))).toEqual({
      flow: 'new',
      plan: true,
      offset: 1,
      total: NEW_SPLIT_STEPS,
    });
    expect(splitEditorGuide('edit', routine([day([{}])]))).toMatchObject({ plan: false, total: 3 });
    expect(splitEditorGuide('edit', routine([day(), rest]))).toMatchObject({
      plan: true,
      total: 4,
    });
  });

  it('starts on the templates, or on Edit split for the active split', () => {
    const facts = { rotation: ['Upper', 'Lower'] };
    const fresh = splitPageCoach({ facts }, 'new', null, []);
    expect(fresh).toMatchObject({ index: 0, total: NEW_SPLIT_STEPS });
    expect(fresh.step.target).toBe('split.templates');
    expect(fresh.step.body).toContain('Upper, Lower');
    const active = splitPageCoach({ facts }, 'edit', 'r1', [routine([day([{}])])]);
    expect(active.step).toMatchObject({
      target: 'split.edit',
      routineId: 'r1',
      title: 'Open your split',
    });
    expect(active.total).toBe(3);
    // Without the split in hand yet, the editor's shortest guide is assumed.
    expect(splitPageCoach({ facts }, 'edit', 'r1', null).total).toBe(3);
  });

  it('asks for Use split on the saved split once the editor saved a new one', () => {
    const place = splitPageCoach({ facts: { rotation: [] }, useRoutineId: 'r2' }, 'new', null, []);
    expect(place).toMatchObject({ index: NEW_SPLIT_STEPS - 2, total: NEW_SPLIT_STEPS });
    expect(place.step).toMatchObject({
      title: SPLIT_GUIDE_COPY.use.title,
      target: 'split.use',
      routineId: 'r2',
    });
    expect(splitConfirmCoach()).toMatchObject({
      index: NEW_SPLIT_STEPS - 1,
      step: { title: 'Pick a start date', target: 'split.confirm' },
    });
    expect(splitConfirmCoach().step.next).toBeUndefined();
  });

  it('steps through planning, a rep range and saving in the editor', () => {
    const guide = splitEditorGuide('new', routine([day()]));
    expect(splitEditorFirstStage(guide)).toBe('plan');
    expect(splitEditorFirstStage(undefined)).toBe('reps');
    expect(['plan', 'reps', 'save'].map((s) => splitEditorIndex(guide, s as 'plan'))).toEqual([
      1, 2, 3,
    ]);
    const edit = splitEditorGuide('edit', routine([day([{}])]));
    expect(splitEditorIndex(edit, 'reps')).toBe(1);
    expect(splitEditorIndex(edit, 'save')).toBe(2);
    expect(splitEditorNextStage('plan')).toBe('reps');
    expect(splitEditorNextStage('reps')).toBe('save');
    expect(splitEditorPreviousStage(guide, 'save')).toBe('reps');
    expect(splitEditorPreviousStage(guide, 'reps')).toBe('plan');
    expect(splitEditorPreviousStage(edit, 'reps')).toBeNull();
    expect(splitEditorPreviousStage(guide, 'plan')).toBeNull();
  });

  it('waits for exercises, then a rep range, before Next', () => {
    const guide = splitEditorGuide('new', routine([day()]));
    const weight = (kg: number) => `${kg} kg`;
    const empty = splitEditorCoach('plan', guide, routine([day(), rest]), null, weight);
    expect(empty).toMatchObject({ target: 'split.days', next: { disabled: true } });
    const planned = routine([day([{ rep_range: null }])]);
    expect(splitEditorCoach('plan', guide, planned, null, weight).next).toEqual({
      disabled: false,
    });
    expect(splitEditorCoach('reps', guide, planned, null, weight)).toMatchObject({
      body: SPLIT_GUIDE_COPY.reps.body,
      target: 'split.reps',
      next: { disabled: true },
    });
    const ranged = routine([day([{ rep_range: { min: 8, max: 12 } }])]);
    const reps = splitEditorCoach('reps', guide, ranged, lift, weight);
    expect(reps.next).toEqual({ disabled: false });
    expect(reps.body).toContain('stay at 80 kg on Bench press');
    const save = splitEditorCoach('save', guide, ranged, lift, weight);
    expect(save).toMatchObject({ target: 'split.save', body: SPLIT_GUIDE_COPY.save.body });
    expect(save.next).toBeUndefined();
    expect(splitEditorCoach('save', { ...guide, flow: 'edit' }, ranged, lift, weight).body).toBe(
      'Tap Save. Your next workout shows the target as you log.',
    );
  });

  it('finishes on saving the active split and otherwise moves on to Use split', () => {
    expect(splitSavedOutcome('r1', 'r1', false)).toEqual({ finish: true });
    expect(splitSavedOutcome('r9', 'current-split', true)).toEqual({ finish: true });
    expect(splitSavedOutcome('r2', null, false)).toEqual({ finish: false, useRoutineId: 'r2' });
  });
});

describe('training block coaching', () => {
  it('follows the block form and waits for a name', () => {
    const steps = blocksCoachSteps(lift, '');
    expect(steps.map((step) => step.target)).toEqual([
      'blocks.name',
      'blocks.start',
      'blocks.end',
      'blocks.submit',
    ]);
    expect(steps[0].title).toBe('Name this phase');
    expect(steps[0].next).toEqual({ disabled: true });
    expect(blocksCoachSteps(lift, '  Strength ')[0].next).toEqual({ disabled: false });
    expect(steps[3].body).toContain('Bench press records start fresh');
    expect(steps[3].next).toBeUndefined();
    expect(blocksCoachSteps(null, 'x')[3].body).toContain('and records start fresh');
  });
});

describe('machine weights coaching', () => {
  const base = {
    exerciseName: 'Leg press',
    enabled: false,
    referenceId: 'a',
    machines: [
      { id: 'a', machine_kg: null, reference_kg: null },
      { id: 'b', machine_kg: 100, reference_kg: 80 },
    ],
    suggested: () => true,
  };

  it('starts on the switch, or past it when normalising is on', () => {
    expect(normaliseFirstStep(false)).toBe(0);
    expect(normaliseFirstStep(true)).toBe(1);
    expect(normaliseStepAfterToggle(0, true)).toBe(1);
    expect(normaliseStepAfterToggle(2, true)).toBe(2);
    expect(normaliseStepAfterToggle(2, false)).toBe(0);
  });

  it('waits for the switch and for every machine to have both weights', () => {
    const steps = normaliseCoachSteps(base);
    expect(steps.map((step) => step.target)).toEqual([
      'normalise.switch',
      'normalise.reference',
      'normalise.match',
      'normalise.save',
    ]);
    expect(steps[0].body).toContain('Your Leg press machines');
    expect(steps[0].next).toEqual({ disabled: true });
    expect(normaliseCoachSteps({ ...base, enabled: true })[0].next).toEqual({ disabled: false });
    expect(steps[2].next).toEqual({ disabled: false });
    expect(steps[2].body).toContain('worked out each match');
    const missing = normaliseCoachSteps({
      ...base,
      machines: [...base.machines, { id: 'c', machine_kg: 50, reference_kg: null }],
      suggested: (id) => id !== 'c',
    });
    expect(missing[2].next).toEqual({ disabled: true });
    expect(missing[2].body).toContain('enter both weights for any without sessions');
    expect(steps[3].next).toBeUndefined();
  });
});

describe('setupGuideRun', () => {
  const facts = { lift: null, rotation: [] };

  it('runs one guide at a time and finishes it only when saved', () => {
    const run = setupGuideRun();
    const listener = vi.fn();
    const finished = vi.fn();
    run.subscribe(listener);
    const stop = run.onFinished(finished);
    run.start('split', facts);
    expect(run.get()).toEqual({ id: 'split', facts });
    run.update('blocks', { useRoutineId: 'x' });
    expect(run.get()?.useRoutineId).toBeUndefined();
    run.update('split', { useRoutineId: 'r2' });
    expect(run.get()?.useRoutineId).toBe('r2');
    run.finish('blocks');
    expect(run.get()?.id).toBe('split');
    run.finish('split');
    expect(run.get()).toBeNull();
    expect(finished).toHaveBeenCalledWith('split');
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    run.start('blocks', facts);
    run.finish('blocks');
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('marks nothing when a guide is left part way', () => {
    const run = setupGuideRun();
    const finished = vi.fn();
    run.onFinished(finished);
    run.start('normalise', facts);
    run.exit('split');
    expect(run.get()?.id).toBe('normalise');
    run.exit();
    expect(run.get()).toBeNull();
    expect(finished).not.toHaveBeenCalled();
  });
});
