import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import './exerciseMerge.css';

export function ExerciseOptionsMenu({
  exerciseName,
  hidden = false,
  onRename,
  onMerge,
  onToggleHidden,
}: {
  exerciseName: string;
  hidden?: boolean;
  /** Custom exercises only. */
  onRename?: (trigger: HTMLButtonElement) => void;
  /** Custom exercises only. */
  onMerge?: (trigger: HTMLButtonElement) => void;
  onToggleHidden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  function choose(action?: (trigger: HTMLButtonElement) => void) {
    setOpen(false);
    if (action && trigger.current) action(trigger.current);
  }

  if (!onRename && !onMerge && !onToggleHidden) return null;

  return (
    <span
      ref={root}
      className="exercise-options"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const buttons = items();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="icon-button-pulse exercise-options-trigger"
        aria-label={`Options for ${exerciseName}`}
        title="Exercise options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <span
          ref={menu}
          id={menuId}
          className="exercise-options-menu"
          role="menu"
          aria-label={`Options for ${exerciseName}`}
        >
          {onRename && (
            <button type="button" role="menuitem" onClick={() => choose(onRename)}>
              <Icon name="edit" />
              Rename
            </button>
          )}
          {onMerge && (
            <button type="button" role="menuitem" onClick={() => choose(onMerge)}>
              <Icon name="link" />
              Merge with another exercise
            </button>
          )}
          {onToggleHidden && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggleHidden();
              }}
            >
              <Icon name={hidden ? 'reset' : 'hide'} />
              {hidden ? 'Show in exercise lists' : 'Hide from exercise lists'}
            </button>
          )}
        </span>
      )}
    </span>
  );
}
