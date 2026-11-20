/**
 * Where focus goes when a PopupDialog opens and closes.
 *
 * React applies `autoFocus` by calling focus() while a field mounts, which is before the dialog
 * opens, so the browser ignores it and showModal() then focuses the first control: the close
 * button. And React removes the dialog before the browser could hand focus back to the control
 * that opened it, so focus would fall to the page.
 */

let lastInputWasPointer = false;
let tracking = false;
// Safari does not focus a tapped button, so the control a dialog opened from is remembered here.
let lastTapped: { element: Element; at: number } | null = null;
const TAP_OPENER_MS = 1000;

/** Notes whether a tap or the keyboard came last, so a tapped-open dialog doesn't ring its close button. */
export function trackInputModality() {
  if (tracking || typeof document === 'undefined' || !document.addEventListener) return;
  tracking = true;
  document.addEventListener(
    'pointerdown',
    (event) => {
      lastInputWasPointer = true;
      // Only controls that are pressed, never text fields, so closing can't open the keyboard.
      const control =
        event.target instanceof Element
          ? event.target.closest('button, a[href], summary, [role="button"]')
          : null;
      lastTapped = control ? { element: control, at: Date.now() } : null;
    },
    true,
  );
  document.addEventListener('keydown', () => (lastInputWasPointer = false), true);
}

function wantsAutoFocus(element: Element): boolean {
  if (element.hasAttribute('data-autofocus') || element.hasAttribute('autofocus')) return true;
  // React keeps `autoFocus` as a prop rather than writing the attribute, so read it from there.
  const propsKey = Object.keys(element).find((key) => key.startsWith('__reactProps$'));
  const props: unknown = propsKey
    ? (element as unknown as Record<string, unknown>)[propsKey]
    : null;
  return Boolean(props && typeof props === 'object' && 'autoFocus' in props && props.autoFocus);
}

/** The control a dialog is opening from: the focused one, or one tapped a moment ago. */
export function dialogOpener(): Element | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (active && active !== document.body) return active;
  if (lastTapped && lastTapped.element.isConnected && Date.now() - lastTapped.at < TAP_OPENER_MS)
    return lastTapped.element;
  return null;
}

/** Call straight after showModal(): focuses the field marked to start with, if there is one. */
export function focusDialogStart(dialog: HTMLDialogElement) {
  const target = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      '[data-autofocus], [autofocus], input, select, textarea, button',
    ),
  ).find(wantsAutoFocus);
  if (target) {
    target.focus();
    if (document.activeElement === target) return;
  }
  // After a tap, start on the dialog itself: the close button stays one Tab away, without a ring.
  if (lastInputWasPointer && dialog.contains(document.activeElement)) {
    dialog.focus({ preventScroll: true });
  }
}

/** Marks a control that holds focus without a ring; popupDialog.css hides its outline. */
export const QUIET_FOCUS_ATTRIBUTE = 'data-quiet-focus';

/**
 * Hides the ring on a control focused for a tap user, as iPhone Safari draws one for any focus
 * a script moves. It comes back once a key is pressed, and goes when the control loses focus.
 */
function focusQuietly(element: HTMLElement) {
  element.setAttribute(QUIET_FOCUS_ATTRIBUTE, '');
  const clear = () => {
    element.removeAttribute(QUIET_FOCUS_ATTRIBUTE);
    element.removeEventListener('blur', clear);
    document.removeEventListener('keydown', clear, true);
  };
  element.addEventListener('blur', clear);
  document.addEventListener('keydown', clear, true);
  element.focus({ preventScroll: true });
  if (document.activeElement !== element) clear();
}

/** Gives focus back to the control that opened the dialog, unless something else has taken it. */
export function restoreDialogOpener(opener: Element | null, dialog: Element) {
  if (!(opener instanceof HTMLElement) || !opener.isConnected || dialog.contains(opener)) return;
  const active = document.activeElement;
  if (active && active !== document.body && !dialog.contains(active)) return;
  if (lastInputWasPointer) focusQuietly(opener);
  else opener.focus({ preventScroll: true });
}
