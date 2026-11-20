import { useEffect, useRef, useState } from 'react';
import { InlineConfirmButton } from './InlineConfirmButton';
import { leavesMenu } from './menuDismiss';
import './bodyMeasurementHistory.css';

/**
 * A check-in row's ⋮ menu. Choosing Edit or Delete closes it, as do a tap outside and Escape, so
 * only one is open at a time and it never covers the edit form.
 */
export function BodyHistoryRowMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (leavesMenu(root.current, event)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      root.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <details
      ref={root}
      className="body-row-menu"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label={label}>⋮</summary>
      {/* Rendered only while open, so a Delete left waiting for confirmation starts over. */}
      {open && (
        <div className="body-history-actions">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <InlineConfirmButton
            label="Delete"
            confirmLabel="Delete check-in"
            className="body-row-menu-delete"
            onConfirm={async () => {
              await onDelete();
              setOpen(false);
            }}
          />
        </div>
      )}
    </details>
  );
}
