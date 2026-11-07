import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import './exerciseMerge.css';

export function ExerciseOptionsMenu({
  exerciseName,
  onMerge,
}: {
  exerciseName: string;
  onMerge: (trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
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
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
          item.current?.focus();
        }
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
          id={menuId}
          className="exercise-options-menu"
          role="menu"
          aria-label={`Options for ${exerciseName}`}
        >
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (trigger.current) onMerge(trigger.current);
            }}
          >
            <Icon name="link" />
            Merge with another exercise
          </button>
        </span>
      )}
    </span>
  );
}
