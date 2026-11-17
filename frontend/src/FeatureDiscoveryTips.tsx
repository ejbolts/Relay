import { useEffect, type ReactNode } from 'react';
import { TipSlot, useTips } from './Tips';
import { maintenanceRange } from './bodyMeasurementHistory';
import type { BodyWeightGoal, WeightMapping } from './types';

export function MachineWeightTip({
  mapping,
  onOpen,
  children,
}: {
  mapping: WeightMapping | null;
  /** Opens Machine weights from the tip, which sits on the control that does the same. */
  onOpen?: () => void;
  children: ReactNode;
}) {
  const { learn } = useTips();
  useEffect(() => {
    if (mapping?.enabled) learn('normalise');
  }, [mapping?.enabled, learn]);
  const usedMachines = mapping?.machines.filter((machine) => machine.workout_count > 0).length ?? 0;
  return (
    <TipSlot id="normalise" eligible={!mapping?.enabled && usedMachines >= 2} onAction={onOpen}>
      {children}
    </TipSlot>
  );
}

/**
 * Suggests a maintenance range at the moment it is the natural next step: the weight has reached
 * the goal that was being worked towards.
 */
export function BodyWeightTip({
  goalReached,
  goals,
  ready,
  onSetGoal,
}: {
  /** The latest weigh-in has reached the active loss or gain goal. */
  goalReached: boolean;
  goals: BodyWeightGoal[];
  ready: boolean;
  /** Opens the goal form on Maintain. */
  onSetGoal: () => void;
}) {
  const { learn } = useTips();
  const usedMaintenance = goals.some((goal) => maintenanceRange(goal) !== null);
  useEffect(() => {
    if (ready && usedMaintenance) learn('maintenance');
  }, [ready, usedMaintenance, learn]);
  return (
    <TipSlot
      id="maintenance"
      eligible={ready && goalReached && !usedMaintenance}
      onAction={onSetGoal}
    />
  );
}
