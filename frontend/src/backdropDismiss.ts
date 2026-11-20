import { useRef } from 'react';

type BackdropEvent = {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  clientX?: number;
  clientY?: number;
};

const onBackdropElement = (event: BackdropEvent) => event.target === event.currentTarget;

/**
 * For a native `<dialog>`: presses on its `::backdrop` and on its own padding or margins all
 * target the dialog element, so only a point outside the dialog's box counts as the backdrop.
 */
export function outsideDialogBox(event: BackdropEvent): boolean {
  const dialog = event.currentTarget;
  if (event.target !== dialog || !(dialog instanceof Element)) return false;
  if (event.clientX === undefined || event.clientY === undefined) return false;
  const box = dialog.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}

/**
 * Closes a popup when a tap both starts and ends on its backdrop. Closing on the click rather than
 * on pointerdown matters on touch screens: the browser sends the click after the finger lifts, so a
 * backdrop removed at pointerdown lets that click fall through to whatever was underneath it.
 * A press that starts inside the popup and ends outside (selecting text, a drag) never closes it.
 */
export function backdropDismissHandlers(
  pressStartedOnBackdrop: { current: boolean },
  onDismiss: () => void,
  isBackdrop: (event: BackdropEvent) => boolean = onBackdropElement,
) {
  return {
    onPointerDown: (event: BackdropEvent) => {
      pressStartedOnBackdrop.current = isBackdrop(event);
    },
    onClick: (event: BackdropEvent) => {
      const startedOnBackdrop = pressStartedOnBackdrop.current;
      pressStartedOnBackdrop.current = false;
      if (startedOnBackdrop && isBackdrop(event)) onDismiss();
    },
  };
}

export function useBackdropDismiss(onDismiss: () => void) {
  const pressStartedOnBackdrop = useRef(false);
  return backdropDismissHandlers(pressStartedOnBackdrop, onDismiss);
}
