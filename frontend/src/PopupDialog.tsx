import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { backdropDismissHandlers, outsideDialogBox } from './backdropDismiss';
import {
  dialogOpener,
  focusDialogStart,
  restoreDialogOpener,
  trackInputModality,
} from './dialogFocus';
import { Icon } from './Icon';
import { motionReduced } from './motion';
import { useSheetDismiss } from './useSheetDismiss';

// Listen from the start, so the very first dialog knows how it was opened.
trackInputModality();

/**
 * - `dialog`: a centred card for decisions, confirmations and short forms.
 * - `sheet`: a card at the bottom for content and pickers; swipe down, ×, Escape or the backdrop
 *   slide it away.
 * - `screen`: a full-screen editor or viewer with a back button instead of ×.
 */
export type PopupVariant = 'dialog' | 'sheet' | 'screen';
/** `compact` confirmations, `regular` forms, `wide` long content; `tall` gives a sheet a fixed height. */
export type PopupSize = 'compact' | 'regular' | 'wide' | 'tall';

/** How long a sheet takes to slide away before `onClose` runs. Matches `popupDialog.css`. */
export const SHEET_CLOSE_MS = 240;

export function PopupDialog({
  variant = 'dialog',
  size,
  title,
  titleBadge,
  kicker,
  className = '',
  closeLabel,
  headerActions,
  onBack,
  actions,
  actionsClassName = '',
  busy = false,
  role,
  describedBy,
  dismissOnBackdrop,
  style,
  swipeToDismiss = false,
  onClose,
  children,
}: {
  variant?: PopupVariant;
  size?: PopupSize;
  title: string;
  /** Decoration shown beside the title, outside its accessible name. */
  titleBadge?: ReactNode;
  kicker?: string;
  className?: string;
  /** @deprecated Replaces the × icon; the close control is always × in the standard header. */
  closeLabel?: ReactNode;
  /** Controls beside the close button, such as a screen's Save action. */
  headerActions?: ReactNode;
  /** A nested view: shows a back chevron before the title, and Escape or phone Back call it. */
  onBack?: () => void;
  /** Buttons for the sticky footer, in the order tertiary, secondary, primary. */
  actions?: ReactNode;
  /** Extra classes for the footer, for hooks that tests or guides select. */
  actionsClassName?: string;
  /** While saving: ×, back, the backdrop, Escape, phone Back and swiping all do nothing. */
  busy?: boolean;
  role?: 'dialog' | 'alertdialog';
  /** The id of the element that describes the decision, such as an alert dialog's message. */
  describedBy?: string;
  /** Whether a tap on the backdrop closes it. Defaults to true, and to false for screens. */
  dismissOnBackdrop?: boolean;
  style?: CSSProperties;
  /** @deprecated Use `variant="sheet"`, which can always be swiped away. */
  swipeToDismiss?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Noted while rendering, before a field inside can take focus as it mounts.
  const [opener] = useState(dialogOpener);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const latest = useRef({ busy, onClose, onBack });
  latest.current = { busy, onClose, onBack };
  const pressStartedOutside = useRef(false);
  const isSheet = variant === 'sheet';
  const isScreen = variant === 'screen';

  /** Closes the popup, sliding a sheet away first. */
  const dismiss = useCallback(() => {
    if (latest.current.busy || closingRef.current) return;
    if (!isSheet || motionReduced()) {
      latest.current.onClose();
      return;
    }
    closingRef.current = true;
    // Marked straight away too, so a swipe that ends here keeps the sheet where it was let go.
    dialogRef.current?.classList.add('is-closing');
    setClosing(true);
  }, [isSheet]);

  useSheetDismiss(dialogRef, (isSheet || swipeToDismiss) && !busy && !closing, dismiss);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      latest.current.onClose();
      // Normally the sheet is gone now. If the page kept it open, it comes back into place.
      closingRef.current = false;
      setClosing(false);
      dialogRef.current?.style.removeProperty('--sheet-offset');
    }, SHEET_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  // A layout effect, so the dialog is still in the page when it closes and focus can go back.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    focusDialogStart(dialog);
    return () => {
      if (dialog.open) dialog.close();
      restoreDialogOpener(opener, dialog);
    };
  }, [opener]);

  const backdrop = backdropDismissHandlers(pressStartedOutside, dismiss, outsideDialogBox);
  const backdropCloses = dismissOnBackdrop ?? !isScreen;
  const goBack = onBack ?? (isScreen ? dismiss : undefined);
  const classes = [
    'popup-dialog',
    `popup-dialog--${variant}`,
    size && `popup-dialog--${size}`,
    closing && 'is-closing',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <dialog
      ref={dialogRef}
      className={classes}
      style={style}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      tabIndex={-1}
      onCancel={(event) => {
        // Escape, and phone Back through overlayBack, step back before they close.
        event.preventDefault();
        if (latest.current.busy) return;
        if (latest.current.onBack) latest.current.onBack();
        else dismiss();
      }}
      onPointerDown={backdropCloses ? backdrop.onPointerDown : undefined}
      onClick={backdropCloses ? backdrop.onClick : undefined}
    >
      <header className="popup-dialog-header">
        {isSheet && <span className="sheet-grabber" aria-hidden="true" />}
        {goBack && (
          <button
            type="button"
            className="popup-dialog-back"
            aria-label="Back"
            disabled={busy}
            onClick={goBack}
          >
            <Icon name="chevron-left" />
          </button>
        )}
        <div className="popup-dialog-heading">
          {kicker && <p className="section-kicker">{kicker}</p>}
          {titleBadge ? (
            <div className="popup-dialog-title-row">
              <h2 id={titleId}>{title}</h2>
              {titleBadge}
            </div>
          ) : (
            <h2 id={titleId}>{title}</h2>
          )}
        </div>
        {headerActions}
        {!isScreen && (
          <button
            type="button"
            className="popup-dialog-close"
            aria-label={`Close ${title}`}
            disabled={busy}
            onClick={dismiss}
          >
            {closeLabel ?? <Icon name="close" />}
          </button>
        )}
      </header>
      {children}
      {actions && (
        <footer className={`popup-dialog-actions popup-dialog-footer ${actionsClassName}`.trim()}>
          {actions}
        </footer>
      )}
    </dialog>,
    document.body,
  );
}
