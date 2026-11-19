import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  dialogOpener,
  focusDialogStart,
  restoreDialogOpener,
  trackInputModality,
} from './dialogFocus';
import { useSheetDismiss } from './useSheetDismiss';
import './popupDialog.css';

// Listen from the start, so the very first dialog knows how it was opened.
trackInputModality();

export function PopupDialog({
  title,
  titleBadge,
  kicker,
  className = '',
  closeLabel,
  headerActions,
  style,
  swipeToDismiss = false,
  onClose,
  children,
}: {
  title: string;
  /** Decoration shown beside the title, outside its accessible name. */
  titleBadge?: ReactNode;
  kicker?: string;
  className?: string;
  closeLabel?: ReactNode;
  /** Controls beside the close button, such as a screen's Save action. */
  headerActions?: ReactNode;
  style?: CSSProperties;
  swipeToDismiss?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Noted while rendering, before a field inside can take focus as it mounts.
  const [opener] = useState(dialogOpener);
  useSheetDismiss(dialogRef, swipeToDismiss, onClose);

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

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`popup-dialog ${className}`.trim()}
      style={style}
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <div>
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
        <button
          type="button"
          className="popup-dialog-close"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          {closeLabel ?? '×'}
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
