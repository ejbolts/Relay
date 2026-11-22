import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PopupDialog } from './PopupDialog';
import './workoutEditGuard.css';

/** Asked before leaving a screen; returns true when it keeps the person there instead. */
export type LeaveGuard = () => boolean;

/**
 * While an editor has unsaved changes, leaving it (Back, the edge swipe or the browser's Back)
 * asks first. Discard leaves through `onDiscard`; Keep editing stays. Returns the dialog to render.
 */
export function useDiscardChangesGuard({
  guard,
  unsaved,
  onDiscard,
}: {
  guard: RefObject<LeaveGuard | null> | undefined;
  unsaved: boolean;
  onDiscard: () => void;
}): ReactNode {
  const [asking, setAsking] = useState(false);
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;
  const discardedRef = useRef(false);

  useEffect(() => {
    if (!guard) return;
    const ask: LeaveGuard = () => {
      if (discardedRef.current || !unsavedRef.current) return false;
      setAsking(true);
      return true;
    };
    guard.current = ask;
    return () => {
      if (guard.current === ask) guard.current = null;
    };
  }, [guard]);

  if (!asking) return null;
  return (
    <PopupDialog
      title="Discard changes?"
      className="workout-finish-dialog workout-discard-dialog discard-changes-dialog"
      size="compact"
      onClose={() => setAsking(false)}
      actionsClassName="workout-finish-actions"
      actions={
        <>
          <button type="button" autoFocus onClick={() => setAsking(false)}>
            Keep editing
          </button>
          <button
            type="button"
            className="popup-primary-action is-danger discard-workout-button"
            onClick={() => {
              discardedRef.current = true;
              setAsking(false);
              onDiscard();
            }}
          >
            Discard
          </button>
        </>
      }
    >
      {null}
    </PopupDialog>
  );
}
