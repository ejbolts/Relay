import { useEffect, useId, useState, type CSSProperties } from 'react';
import { api } from './api';
import { RoutinePanel } from './RoutinePanel';
import { useUserSession } from './userContext';
import { Icon } from './Icon';
import { WorkoutCalendar } from './WorkoutCalendar';
import { calendarMonths } from './calendarRange';
import { addDays, parseLocalDate, shortDate } from './trainingSummary';
import { splitPreview, splitPreviewLabel } from './trainingSplit';
import type { TrainingSplit } from './types';
import { localDate } from './utils';
import { useWorkoutTypes } from './workoutTypesContext';
import './trainingSplit.css';

export function TrainingSplitEditor({
  onSaved,
  initialRoutineId,
}: {
  onSaved: (split: TrainingSplit) => Promise<void>;
  initialRoutineId?: string;
}) {
  const [split, setSplit] = useState<TrainingSplit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { user } = useUserSession();
  useEffect(() => {
    let live = true;
    api.getTrainingSplit().then(
      (saved) => {
        if (live) {
          setSplit(saved);
          setLoaded(true);
          setError(null);
        }
      },
      (reason) => {
        if (live)
          setError(reason instanceof Error ? reason.message : 'Could not load your splits.');
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return (
    <section className="split-manager" aria-label="Your splits">
      {error ? (
        <div className="split-load-error" role="alert">
          {error}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !loaded ? (
        <p role="status">Loading splits...</p>
      ) : (
        <RoutinePanel
          ownerId={user?.id ?? 'my-splits'}
          own
          embedded
          heading="My splits"
          trainingSplit={split}
          initialOpenId={initialRoutineId}
          activeId={split?.enabled ? (split.routine_id ?? 'current-split') : null}
          renderPreview={(current) => (
            <SplitPreview key={`${current.routine_id}:${current.start_date}`} split={current} />
          )}
          onUsed={(updated) => {
            setSplit(updated);
            void onSaved(updated);
          }}
        />
      )}
    </section>
  );
}

export function SplitPreview({ split }: { split: TrainingSplit }) {
  const headingId = useId();
  const [calendarView, setCalendarView] = useState(false);
  const [previewWeek, setPreviewWeek] = useState(0);
  const { types } = useWorkoutTypes();
  const typeFor = (id: string | null | undefined) => types.find((t) => t.id === id);
  const colourFor = (id: string | null | undefined) => typeFor(id)?.color ?? 'var(--p-muted)';
  const labelFor = (id: string | null | undefined) =>
    id === null ? 'Rest' : id === undefined ? 'Not started' : (typeFor(id)?.name ?? 'Removed type');
  const today = localDate();
  const previewStart = addDays(
    split.start_date > today ? split.start_date : today,
    previewWeek * 7,
  );
  const preview = splitPreview(split, previewStart);
  const months = calendarView ? calendarMonths(today, 2) : [];
  const plannedDays = months.flatMap((month) =>
    splitPreview(split, month.first, month.cells.filter(Boolean).length).map(
      ({ date, typeId }) => ({
        date,
        label: labelFor(typeId),
        color: typeId === undefined ? undefined : colourFor(typeId),
      }),
    ),
  );
  const monthLabel = (date: string) =>
    parseLocalDate(date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  return (
    <section aria-labelledby={headingId}>
      <div className="split-section-heading split-preview-heading">
        <h2 id={headingId} className={calendarView ? 'sr-only' : undefined}>
          {calendarView ? 'Split calendar' : 'Next 7 days'}
        </h2>
        <span className="split-preview-controls">
          <button
            type="button"
            className="split-icon-button split-calendar-toggle"
            aria-label="Two-month calendar"
            title={calendarView ? 'Show next 7 days' : 'Show two-month calendar'}
            aria-pressed={calendarView}
            onClick={() => setCalendarView((current) => !current)}
          >
            <Icon name="calendar" />
          </button>
          {!calendarView && (
            <button
              type="button"
              className="split-icon-button"
              aria-label="Previous preview week"
              disabled={previewWeek === 0}
              onClick={() => setPreviewWeek((week) => Math.max(0, week - 1))}
            >
              <Icon name="chevron-left" />
            </button>
          )}
          <span>
            {calendarView
              ? `${monthLabel(months[0].first)} – ${monthLabel(months[1].first)}`
              : `${shortDate(previewStart)} – ${shortDate(addDays(previewStart, 6))}`}
          </span>
          {!calendarView && (
            <button
              type="button"
              className="split-icon-button"
              aria-label="Next preview week"
              onClick={() => setPreviewWeek((week) => week + 1)}
            >
              <Icon name="chevron-right" />
            </button>
          )}
        </span>
      </div>
      {calendarView ? (
        <div className="calendar-panel">
          <WorkoutCalendar preview={{ from: months[0].first, days: plannedDays }} />
        </div>
      ) : (
        <ol className="split-preview">
          {preview.map(({ date, typeId }) => (
            <li
              key={date}
              style={{ '--split-type-colour': colourFor(typeId) } as CSSProperties}
              aria-label={`${parseLocalDate(date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}: ${labelFor(typeId)}`}
            >
              <span>{parseLocalDate(date).toLocaleDateString('en-AU', { weekday: 'short' })}</span>
              <b>{parseLocalDate(date).getDate()}</b>
              <i aria-hidden="true" />
              <strong title={labelFor(typeId)}>{splitPreviewLabel(labelFor(typeId))}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
