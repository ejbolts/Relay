import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { progressExerciseMatches } from './exerciseSearch';
import { FuzzyHighlightedText } from './FuzzyHighlightedText';
import { Icon } from './Icon';
import type { Exercise } from './types';
import './routineExerciseSearch.css';

/** Adds an exercise to a split day or workout type through a fuzzy search, not a long list. */
export function RoutineExerciseSearch({
  day,
  target = `day ${day}`,
  label = 'Exercise',
  exercises,
  disabled,
  onAdd,
}: {
  day?: number;
  /** What the exercise is added to in labels, such as "day 2" or "Push". */
  target?: string;
  label?: string;
  exercises: Exercise[];
  disabled: boolean;
  onAdd: (exercise: Exercise) => void;
}) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const blurFrameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(
    () =>
      progressExerciseMatches(
        exercises.filter((exercise) => !exercise.hidden),
        query,
      ),
    [exercises, query],
  );

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      fieldRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.children[activeIndex];
    if (!list || !(option instanceof HTMLElement)) return;
    const bounds = list.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [activeIndex, matches]);

  useEffect(
    () => () => {
      if (blurFrameRef.current !== null) window.cancelAnimationFrame(blurFrameRef.current);
    },
    [],
  );

  function close(restoreFocus: boolean) {
    if (blurFrameRef.current !== null) {
      window.cancelAnimationFrame(blurFrameRef.current);
      blurFrameRef.current = null;
    }
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    if (restoreFocus) window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  function choose(exercise: Exercise) {
    onAdd(exercise);
    close(true);
  }

  if (!open) {
    return (
      <button
        ref={openerRef}
        type="button"
        className="routine-add-exercise"
        aria-label={`Add exercise to ${target}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" />
        {label}
      </button>
    );
  }

  return (
    <div
      ref={fieldRef}
      className="routine-exercise-search"
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return;
        }
        if (blurFrameRef.current !== null) window.cancelAnimationFrame(blurFrameRef.current);
        // iOS may blur without a relatedTarget while an option is being tapped,
        // so wait for that click before collapsing the search.
        blurFrameRef.current = window.requestAnimationFrame(() => {
          blurFrameRef.current = null;
          close(false);
        });
      }}
    >
      <div className="routine-exercise-search-box">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          enterKeyHint="go"
          autoComplete="off"
          aria-label={`Search exercises to add to ${target}`}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          aria-activedescendant={matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          placeholder="Search exercises"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (matches[activeIndex]) choose(matches[activeIndex]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            }
          }}
        />
        <button
          type="button"
          className="routine-exercise-search-close"
          aria-label="Close exercise search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => close(true)}
        >
          <Icon name="close" />
        </button>
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={`Exercises to add to ${target}`}
        className="routine-exercise-search-results"
      >
        {matches.map((exercise, index) => (
          <button
            type="button"
            role="option"
            id={`${listId}-${index}`}
            key={exercise.id}
            tabIndex={-1}
            aria-selected={index === activeIndex}
            className={index === activeIndex ? 'active' : undefined}
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse') setActiveIndex(index);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(exercise)}
          >
            <strong>
              <FuzzyHighlightedText value={exercise.name} query={query} />
            </strong>
            <small>
              {exercise.muscle_group}
              {exercise.equipment ? ` · ${exercise.equipment}` : ''}
            </small>
          </button>
        ))}
        {!matches.length && <p role="status">No exercises match “{query.trim()}”.</p>}
      </div>
    </div>
  );
}
