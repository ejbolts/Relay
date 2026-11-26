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

/** What a toast is for. Without one it is `action` when it offers an action, else `status`. */
export type ToastVariant = 'status' | 'action' | 'warning' | 'error' | 'celebrate';

/** How long each variant stays unless its owner picks a `duration`. */
const VARIANT_DURATION: Record<ToastVariant, PopupDuration> = {
  status: 'standard',
  action: 'standard',
  warning: 'important',
  celebrate: 'important',
  error: 'critical',
};

/** A message longer than this gets at least `important`, so there is time to read it. */
const LONG_MESSAGE_LENGTH = 90;

/**
 * How long a toast stays, in milliseconds: its variant's time, or the `duration` its owner
 * picked (`quick` for frequent small undos, `important` for big ones). The web and the app
 * both time their toasts with this.
 */
export function toastDuration(
  variant: ToastVariant,
  message: string,
  duration?: PopupDuration,
): number {
  const ms = POPUP_MS[duration ?? VARIANT_DURATION[variant]];
  return message.length > LONG_MESSAGE_LENGTH ? Math.max(ms, POPUP_MS.important) : ms;
}
