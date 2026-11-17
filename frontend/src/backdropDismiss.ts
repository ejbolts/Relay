import { useRef } from 'react';

type BackdropEvent = { target: EventTarget | null; currentTarget: EventTarget | null };

/**
 * Closes a popup when a tap both starts and ends on its backdrop. Closing on the click rather than
 * on pointerdown matters on touch screens: the browser sends the click after the finger lifts, so a
 * backdrop removed at pointerdown lets that click fall through to whatever was underneath it.
 */
export function backdropDismissHandlers(
  pressStartedOnBackdrop: { current: boolean },
  onDismiss: () => void,
) {
  return {
    onPointerDown: (event: BackdropEvent) => {
      pressStartedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event: BackdropEvent) => {
      const startedOnBackdrop = pressStartedOnBackdrop.current;
      pressStartedOnBackdrop.current = false;
      if (startedOnBackdrop && event.target === event.currentTarget) onDismiss();
    },
  };
}

export function useBackdropDismiss(onDismiss: () => void) {
  const pressStartedOnBackdrop = useRef(false);
  return backdropDismissHandlers(pressStartedOnBackdrop, onDismiss);
}
