import { validBlockColor } from './blockColors';
import { blockDay, blockOn, weeksEnd } from './trainingBlocks';
import type { TrainingBlock, TrainingBlockInput, TrainingBlocks } from './types';

// The rules of the training block form (name, colour, start and planned end), and of starting
// the next block or a deload week from a block's summary.

export type StartPreset = 'today' | 'january' | 'custom';
export type PlanPreset = 'none' | '8' | '12' | 'custom';

/** Which planned-end choice a saved planned end matches. */
export function planFor(start: string, end: string | null | undefined): PlanPreset {
  if (!end) return 'none';
  if (end === weeksEnd(start, 8)) return '8';
  return end === weeksEnd(start, 12) ? '12' : 'custom';
}

/** Which start choice a saved start matches. */
export function presetFor(start: string, today: string): StartPreset {
  if (start === today) return 'today';
  return start === `${today.slice(0, 4)}-01-01` ? 'january' : 'custom';
}

export interface BlockFormDraft {
  name: string;
  /** Null uses the app's palette. */
  color: string | null;
  start: string;
  preset: StartPreset;
  plan: PlanPreset;
  /** The custom planned end, kept while another choice is picked. */
  planEnd: string;
}

/** The form for a new block, or filled from a saved one. */
export function blockFormDraft(block: TrainingBlock | null, today: string): BlockFormDraft {
  const start = block?.start_date ?? today;
  return {
    name: block?.name ?? '',
    color: validBlockColor(block?.color),
    start,
    preset: presetFor(start, today),
    plan: planFor(start, block?.planned_end_date),
    planEnd: block?.planned_end_date ?? weeksEnd(start, 4),
  };
}

/** The inclusive planned end the form describes, or null for no set date. */
export function draftPlannedEnd(draft: Pick<BlockFormDraft, 'start' | 'plan' | 'planEnd'>) {
  if (draft.plan === 'none') return null;
  return draft.plan === 'custom' ? draft.planEnd : weeksEnd(draft.start, Number(draft.plan));
}

/** What the form saves. */
export function blockFormInput(draft: BlockFormDraft): TrainingBlockInput {
  return {
    name: draft.name.trim(),
    start_date: draft.start,
    planned_end_date: draftPlannedEnd(draft),
    color: draft.color,
  };
}

/** The start choices, each with its date shown under it. */
export function blockStartOptions(draft: Pick<BlockFormDraft, 'start' | 'preset'>, today: string) {
  const january = `${today.slice(0, 4)}-01-01`;
  return [
    { value: 'today', label: 'Today', detail: blockDay(today, false), date: today },
    { value: 'january', label: '1 January', detail: january.slice(0, 4), date: january },
    {
      value: 'custom',
      label: 'Custom',
      detail: draft.preset === 'custom' ? blockDay(draft.start, true) : '',
      date: draft.start,
    },
  ] as const satisfies readonly {
    value: StartPreset;
    label: string;
    detail: string;
    date: string;
  }[];
}

/** The planned-end choices, each with the day it ends. */
export function blockPlanOptions(draft: Pick<BlockFormDraft, 'start' | 'plan' | 'planEnd'>) {
  return [
    { value: 'none', label: 'No set date', detail: '' },
    { value: '8', label: '8 weeks', detail: blockDay(weeksEnd(draft.start, 8), false) },
    { value: '12', label: '12 weeks', detail: blockDay(weeksEnd(draft.start, 12), false) },
    {
      value: 'custom',
      label: 'Custom',
      detail: draft.plan === 'custom' ? blockDay(draft.planEnd, false) : '',
    },
  ] as const satisfies readonly { value: PlanPreset; label: string; detail: string }[];
}

/**
 * The block to show after creating one: "current" when the new block covers today, else its
 * id, or null if the saved blocks have no block starting that day.
 */
export function createdBlockSelection(next: TrainingBlocks, start: string, today: string) {
  const created = next.blocks.find((item) => item.start_date === start);
  if (!created) return null;
  return created.id === blockOn(next.blocks, today)?.id ? 'current' : created.id;
}

/** The form's title. */
export const blockFormTitle = (editing: boolean) => (editing ? 'Edit block' : 'New training block');

/** Asked before removing a block. */
export const blockRemoveMessage = (name: string) =>
  `Remove “${name}”? Workouts stay saved. Block records will follow the remaining dates.`;

export type NextBlockPlan = 'none' | '8' | '12';

/** A next block's planned-end choices, from today. */
export function nextBlockPlanOptions(today: string) {
  return (
    [
      { id: 'none', label: 'No set date' },
      { id: '8', label: '8 weeks' },
      { id: '12', label: '12 weeks' },
    ] as const
  ).map((item) => ({
    ...item,
    detail: item.id === 'none' ? '' : blockDay(weeksEnd(today, Number(item.id)), false),
  }));
}

/** The next block, starting today. */
export function nextBlockInput(name: string, plan: NextBlockPlan, today: string) {
  return {
    name: name.trim(),
    start_date: today,
    planned_end_date: plan === 'none' ? null : weeksEnd(today, Number(plan)),
  } satisfies TrainingBlockInput;
}

/** A deload week's last day. */
export const deloadEnd = (today: string) => weeksEnd(today, 1);

/** A 7-day deload block starting today. */
export function deloadBlockInput(today: string) {
  return {
    name: 'Deload week',
    start_date: today,
    planned_end_date: deloadEnd(today),
    deload: true,
  } satisfies TrainingBlockInput;
}

/** What starting a deload week does. */
export const deloadMessage = (today: string) =>
  `A 7-day deload block starts today and runs to ${blockDay(deloadEnd(today), false)}. Start your next block when it ends.`;
