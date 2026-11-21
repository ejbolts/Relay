/**
 * How long a pop-up that closes by itself stays on screen. Hovering, pressing or focusing a
 * toast pauses it.
 * - `quick`: frequent, easily redone actions mid-workout, such as deleting a set.
 * - `standard`: everyday confirmations, and the default for toasts.
 * - `important`: warnings, records, and undoing what is hard to redo, such as a deleted workout.
 * - `critical`: errors, so there is time to read what went wrong.
 */
export const POPUP_MS = {
  quick: 2500,
  standard: 3000,
  important: 5000,
  critical: 7000,
} as const;

export type PopupDuration = keyof typeof POPUP_MS;
