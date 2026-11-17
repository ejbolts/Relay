import { useEffect, type ReactNode } from 'react';
import { TipSlot, useTips } from './Tips';
import { maintenanceRange } from './bodyMeasurementHistory';
import type { BodyWeightGoal, WeightMapping } from './types';

export function MachineWeightTip({
  mapping,
  children,
}: {
  mapping: WeightMapping | null;
  children: ReactNode;
}) {
  const { learn } = useTips();
  useEffect(() => {
    if (mapping?.enabled) learn('normalise');
  }, [mapping?.enabled, learn]);
  const usedMachines = mapping?.machines.filter((machine) => machine.workout_count > 0).length ?? 0;
  return (
    <TipSlot id="normalise" eligible={!mapping?.enabled && usedMachines >= 2}>
      {children}
    </TipSlot>
  );
}

export function BodyWeightTip({
  measurementCount,
  goals,
  ready,
}: {
  measurementCount: number;
  goals: BodyWeightGoal[];
  ready: boolean;
}) {
  const { learn } = useTips();
  const usedMaintenance = goals.some((goal) => maintenanceRange(goal) !== null);
  useEffect(() => {
    if (ready && usedMaintenance) learn('maintenance');
  }, [ready, usedMaintenance, learn]);
  return <TipSlot id="maintenance" eligible={ready && measurementCount >= 3 && !usedMaintenance} />;
}
