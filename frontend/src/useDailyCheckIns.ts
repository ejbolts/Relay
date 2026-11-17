import { useRef, useState } from 'react';
import type { UndoBodyweightCheckIn } from './bodyweightCheckIn';

/** All Home check-in variants write the same daily record and share one active Undo. */
export function useDailyCheckIns(
  saveWeight: (weight: number, bodyFat?: number) => Promise<UndoBodyweightCheckIn>,
  saveFat?: (fat: number) => Promise<UndoBodyweightCheckIn>,
) {
  const locked = useRef(false);
  const undoVersionRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);
  async function serialize<T>(action: () => Promise<T>, invalidateUndo = true): Promise<T> {
    if (locked.current) throw new Error('A check-in is being saved. Try again in a moment.');
    locked.current = true;
    setBusy(true);
    if (invalidateUndo) {
      undoVersionRef.current++;
      setUndoVersion(undoVersionRef.current);
    }
    try {
      return await action();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function save(
    action: () => Promise<UndoBodyweightCheckIn>,
  ): Promise<UndoBodyweightCheckIn> {
    const undo = await serialize(action);
    return () => serialize(undo, false);
  }
  return {
    busy,
    undoVersion,
    undoVersionRef,
    onSave: (weight: number, bodyFat?: number) =>
      save(() => (bodyFat === undefined ? saveWeight(weight) : saveWeight(weight, bodyFat))),
    onSaveBodyFat: saveFat ? (fat: number) => save(() => saveFat(fat)) : undefined,
  };
}
