import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { BodyFigure } from './BodyFigure';
import { loadBodyFigure, saveBodyFigure } from './bodyFigurePreference';
import type { BodyFigureKind } from './bodyFigureShapes';
import { BODY_SIZE_FIELDS, type BodySizeField, type BodySizeLog } from './bodySizes';
import { Icon } from './Icon';
import { PopupDialog } from './PopupDialog';
import { HelpPopup } from './HelpPopup';
import { SEX_LABELS } from './profileDisplay';
import './profileSex.css';
import type { Sex } from './types';
import { useWeightUnit } from './trainingPreferencesContext';
import { useUserSession } from './userContext';
import { localDate } from './utils';
import './bodySizes.css';

type Draft = Record<BodySizeField, string>;

const emptyLog = (date: string) =>
  ({
    ...Object.fromEntries(BODY_SIZE_FIELDS.map(([key]) => [key, null])),
    measurement_date: date,
  }) as BodySizeLog;
const newestFirst = (a: BodySizeLog, b: BodySizeLog) =>
  b.measurement_date.localeCompare(a.measurement_date);

const shortDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
const dayAndMonth = (date: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`),
  );

export function BodySizesCard({ dataRevision = null }: { dataRevision?: string | null }) {
  const weightUnit = useWeightUnit();
  const unit = weightUnit === 'lb' ? 'in' : 'cm';
  const factor = unit === 'in' ? 2.54 : 1;
  const editText = (cm: number) => String(Number((cm / factor).toFixed(2)));
  const [logs, setLogs] = useState<BodySizeLog[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(localDate());
  const [draft, setDraft] = useState<Draft>({} as Draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [visible, setVisible] = useState(5);
  const [historyPart, setHistoryPart] = useState<BodySizeField | 'all'>('all');
  const [retry, setRetry] = useState(0);
  // The entry drawn on the figure: the latest one until another is stepped to or saved.
  const [shownDate, setShownDate] = useState<string | null>(null);
  const session = useUserSession();
  const user = session.user;
  const userId = user?.id ?? null;
  const [chosenFigure, setFigure] = useState<BodyFigureKind>(() => loadBodyFigure(userId));
  // The sex set on the profile decides the outline; the choice is only offered until it is set.
  const profileSex = user?.sex ?? null;
  const figure = profileSex ?? chosenFigure;
  // Picking an outline before the profile has a sex offers to save it as the account's sex.
  const [offeredSex, setOfferedSex] = useState<Sex | null>(null);
  const [savingSex, setSavingSex] = useState(false);
  const [sexError, setSexError] = useState<string | null>(null);
  // The measurement being typed straight onto the figure, and why it was not accepted.
  const [inlineField, setInlineField] = useState<BodySizeField | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Each save replaces a whole day, so saves run one after another and a later one cannot undo
  // an earlier change.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  // The measurement tapped on the figure, so the form opens on that field.
  const [focusField, setFocusField] = useState<BodySizeField | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!editing || !focusField) return;
    const field = form.current?.elements.namedItem(focusField);
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.select();
    }
  }, [editing, focusField]);

  useEffect(() => {
    let cancelled = false;
    void api
      .listBodySizes()
      .then((items) => {
        if (!cancelled) {
          setLogs(items);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'Could not load measurements.');
      });
    return () => {
      cancelled = true;
    };
  }, [dataRevision, retry]);

  function chooseDate(nextDate: string) {
    setDate(nextDate);
    const row = logs?.find((item) => item.measurement_date === nextDate);
    setDraft(
      Object.fromEntries(
        BODY_SIZE_FIELDS.map(([key]) => [key, row?.[key] == null ? '' : editText(row[key])]),
      ) as Draft,
    );
    setError(null);
  }

  function queueSave(payload: BodySizeLog) {
    const result = saveQueue.current.then(() => api.saveBodySizes(payload));
    saveQueue.current = result.catch(() => undefined);
    return result;
  }

  /**
   * Saves one measurement typed on the figure into today's entry, starting it if needed, so an
   * earlier entry is only changed through Edit.
   */
  function saveOnFigure(field: BodySizeField, typed: string): boolean {
    const day = localDate();
    const entry = logs?.find((row) => row.measurement_date === day) ?? emptyLog(day);
    const text = typed.trim().replace(',', '.');
    // What the box started with, so confirming it unchanged saves nothing.
    const original = figureValues[field];
    if (!text || (original != null && text === editText(original))) {
      setInlineField(null);
      setInlineError(null);
      return true;
    }
    const value = Number(text) * factor;
    if (!Number.isFinite(value) || value <= 0 || value > 300) {
      const label = BODY_SIZE_FIELDS.find(([key]) => key === field)![1];
      setInlineError(
        `${label} must be above 0 and up to ${Number((300 / factor).toFixed(2))} ${unit}.`,
      );
      return false;
    }
    const next = { ...entry, [field]: value };
    setLogs((items) =>
      [next, ...(items ?? []).filter((row) => row.measurement_date !== day)].sort(newestFirst),
    );
    setShownDate(day);
    setInlineField(null);
    setInlineError(null);
    queueSave(next).catch((reason) => {
      setInlineError(reason instanceof Error ? reason.message : 'Could not save measurement.');
      // Reload, so the figure shows what is actually stored.
      setRetry((count) => count + 1);
    });
    return true;
  }

  async function save() {
    // Starts from the stored entry, so a part no longer offered here (ankle) is kept.
    const stored = logs?.find((row) => row.measurement_date === date);
    const payload = { ...stored, measurement_date: date } as BodySizeLog;
    for (const [key, label] of BODY_SIZE_FIELDS) {
      const text = draft[key]?.trim();
      // Keep untouched measurements exact when displaying rounded inches.
      const original = stored?.[key];
      const unchanged = original != null && text === editText(original);
      payload[key] = unchanged ? original : text ? Number(text) * factor : null;
      if (
        payload[key] !== null &&
        (!Number.isFinite(payload[key]) || payload[key]! <= 0 || payload[key]! > 300)
      ) {
        setError(
          `${label} must be above 0 and up to ${Number((300 / factor).toFixed(2))} ${unit}.`,
        );
        return;
      }
    }
    if (!BODY_SIZE_FIELDS.some(([key]) => payload[key] !== null)) {
      setError('Enter at least one body measurement.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await queueSave(payload);
      setLogs((items) =>
        [saved, ...(items ?? []).filter((row) => row.measurement_date !== date)].sort(newestFirst),
      );
      setShownDate(saved.measurement_date);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save measurements.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSex() {
    if (!offeredSex) return;
    setSavingSex(true);
    setSexError(null);
    try {
      session.updateUser(await api.updateProfile({ sex: offeredSex }));
      setOfferedSex(null);
    } catch (reason) {
      setSexError(reason instanceof Error ? reason.message : 'Could not save your sex.');
    } finally {
      setSavingSex(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteBodySizes(deleting);
      setLogs((items) => items?.filter((row) => row.measurement_date !== deleting) ?? []);
      setDeleting(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete measurements.');
    } finally {
      setSaving(false);
    }
  }

  const shownIndex = Math.max(0, logs?.findIndex((row) => row.measurement_date === shownDate) ?? 0);
  const shown = logs?.[shownIndex];
  const previous = logs?.[shownIndex + 1];
  // The figure shows the shown entry's values, and for parts it lacks, the latest earlier value,
  // muted, so it stays complete without copying old values into the entry.
  const figureValues: Partial<Record<BodySizeField, number>> = {};
  const carried = new Set<BodySizeField>();
  for (const [key] of BODY_SIZE_FIELDS) {
    if (shown?.[key] != null) figureValues[key] = shown[key]!;
    else {
      const earlier = logs?.slice(shownIndex + 1).find((row) => row[key] != null)?.[key];
      if (earlier != null) {
        figureValues[key] = earlier;
        carried.add(key);
      }
    }
  }
  const history = (logs ?? []).filter((row) => historyPart === 'all' || row[historyPart] !== null);
  const partLabel = BODY_SIZE_FIELDS.find(([key]) => key === historyPart)?.[1];
  const format = (cm: number) => `${Number((cm / factor).toFixed(1))} ${unit}`;
  function changeFromPrevious(index: number): string {
    if (historyPart === 'all' || !history[index + 1]) return 'First measurement';
    const current = Number((history[index][historyPart]! / factor).toFixed(1));
    const previous = Number((history[index + 1][historyPart]! / factor).toFixed(1));
    const change = Number((current - previous).toFixed(1));
    return change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${Math.abs(change)} ${unit}`;
  }
  const display = (cm: number) => Number((cm / factor).toFixed(1));
  const shownDay = shown?.measurement_date ?? localDate();
  const changes = BODY_SIZE_FIELDS.flatMap(([key, label]) => {
    if (shown?.[key] == null || previous?.[key] == null) return [];
    const change = Number((display(shown[key]) - display(previous[key])).toFixed(1));
    return change === 0 ? [] : [{ key, label, change }];
  });
  /** The most recent measurement of a part before the dialog's date, as a hint to type over. */
  const lastValue = (key: BodySizeField) => {
    const cm = logs?.find((row) => row.measurement_date < date && row[key] != null)?.[key];
    return cm == null ? undefined : String(display(cm));
  };
  const open = (day: string, field: BodySizeField | null = null) => {
    chooseDate(day);
    setFocusField(field);
    setEditing(true);
  };

  return (
    <section className="pulse-card body-sizes-card" aria-label="Body measurements">
      <header className="pulse-card-header">
        <div className="body-sizes-title">
          <h2>Body measurements</h2>
          <HelpPopup title="Body measurements">
            <p>
              Flex each muscle and measure around it with a relaxed tape, using the same position
              each time. All fields are optional; enter at least one.
            </p>
          </HelpPopup>
        </div>
        <button
          type="button"
          className="body-sizes-add"
          disabled={logs === null}
          onClick={() => open(localDate())}
        >
          Log measurements
        </button>
      </header>
      {error && !editing && !deleting && (
        <p role="alert" className="inline-error">
          {error}
          <button type="button" onClick={() => setRetry((count) => count + 1)}>
            Retry
          </button>
        </p>
      )}
      {logs === null ? (
        <p className="body-sizes-empty">
          {error ? 'Measurements unavailable' : 'Loading measurements…'}
        </p>
      ) : (
        <>
          <div className="body-sizes-stepper">
            {logs.length > 1 && (
              <button
                type="button"
                aria-label="Earlier measurements"
                disabled={!previous}
                onClick={() => previous && setShownDate(previous.measurement_date)}
              >
                <Icon name="chevron-left" />
              </button>
            )}
            <time dateTime={shownDay}>{shortDate(shownDay)}</time>
            {logs.length > 1 && (
              <button
                type="button"
                aria-label="Later measurements"
                disabled={shownIndex === 0}
                onClick={() => setShownDate(logs[shownIndex - 1].measurement_date)}
              >
                <Icon name="chevron-right" />
              </button>
            )}
          </div>
          <BodyFigure
            kind={figure}
            unit={unit}
            onPick={(field) => {
              setInlineError(null);
              setInlineField(field);
            }}
            editing={inlineField}
            editValue={
              inlineField && figureValues[inlineField] != null
                ? editText(figureValues[inlineField]!)
                : ''
            }
            invalid={inlineError !== null && inlineField !== null}
            onCommit={saveOnFigure}
            onCancel={() => {
              setInlineField(null);
              setInlineError(null);
            }}
            values={Object.fromEntries(
              Object.entries(figureValues).map(([key, cm]) => [key, String(display(cm))]),
            )}
            carried={carried}
          />
          {inlineError && (
            <p id="body-figure-error" role="alert" className="inline-error body-figure-error">
              {inlineError}
            </p>
          )}
          {profileSex ? (
            <p className="body-sizes-figure-locked">
              <Icon name={profileSex} />
              {SEX_LABELS[profileSex]}
              <Icon name="lock" />
              <span className="sr-only">, set on your profile</span>
            </p>
          ) : (
            <div
              className="segmented-control compact body-sizes-figure-kind"
              role="radiogroup"
              aria-label="Body outline"
            >
              {(
                [
                  ['male', 'Male'],
                  ['female', 'Female'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={figure === kind}
                  className={figure === kind ? 'active' : ''}
                  onClick={() => {
                    setFigure(kind);
                    saveBodyFigure(userId, kind);
                    if (user) {
                      setSexError(null);
                      setOfferedSex(kind);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {shown && (
            <>
              {changes.length > 0 && previous && (
                <div className="body-sizes-changes">
                  <h3>Changed since {dayAndMonth(previous.measurement_date)}</h3>
                  <ul>
                    {changes.map(({ key, label, change }) => (
                      <li
                        key={key}
                        aria-label={`${label} ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} ${unit}`}
                      >
                        {label}
                        <b>
                          {change > 0 ? '↑' : '↓'} {Math.abs(change)}
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="body-sizes-entry-actions">
                <button type="button" onClick={() => open(shown.measurement_date)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setError(null);
                    setDeleting(shown.measurement_date);
                  }}
                >
                  Delete
                </button>
              </div>
              <details className="body-sizes-history">
                <summary>
                  Measurement history <span>{history.length}</span>
                </summary>
                <label className="body-sizes-history-filter">
                  Body part
                  <select
                    value={historyPart}
                    onChange={(event) => {
                      setHistoryPart(event.target.value as BodySizeField | 'all');
                      setVisible(5);
                    }}
                  >
                    <option value="all">All measurements</option>
                    {BODY_SIZE_FIELDS.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {history.length === 0 && <p>No {partLabel?.toLowerCase()} measurements yet.</p>}
                {history.slice(0, visible).map((row, index) => (
                  <article key={row.measurement_date}>
                    <div className="body-sizes-history-heading">
                      <time dateTime={row.measurement_date}>{shortDate(row.measurement_date)}</time>
                      <div>
                        <button
                          type="button"
                          aria-label={`Edit measurements ${row.measurement_date}`}
                          onClick={() => open(row.measurement_date)}
                        >
                          Edit
                        </button>
                        {historyPart === 'all' && (
                          <button
                            type="button"
                            aria-label={`Delete measurements ${row.measurement_date}`}
                            onClick={() => {
                              setError(null);
                              setDeleting(row.measurement_date);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {historyPart !== 'all' ? (
                      <div className="body-sizes-part-value">
                        <strong>{format(row[historyPart]!)}</strong>
                        <span
                          aria-label={`Change from previous measurement: ${changeFromPrevious(index)}`}
                        >
                          {changeFromPrevious(index)}
                        </span>
                      </div>
                    ) : (
                      <p>
                        {BODY_SIZE_FIELDS.filter(([key]) => row[key] !== null)
                          .map(([key, label]) => `${label} ${format(row[key]!)}`)
                          .join(' · ')}
                      </p>
                    )}
                  </article>
                ))}
                {history.length > visible && (
                  <button type="button" onClick={() => setVisible((count) => count + 5)}>
                    Show more
                  </button>
                )}
              </details>
            </>
          )}
        </>
      )}
      {editing && (
        <PopupDialog
          title="Log body measurements"
          className="body-sizes-popup"
          busy={saving}
          onClose={() => {
            setEditing(false);
            setError(null);
          }}
          actions={
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="body-sizes-form"
                className="popup-primary-action"
                disabled={saving}
              >
                {saving
                  ? 'Saving…'
                  : logs?.some((row) => row.measurement_date === date)
                    ? 'Update measurements'
                    : 'Save measurements'}
              </button>
            </>
          }
        >
          <form
            ref={form}
            id="body-sizes-form"
            className="body-entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="body-sizes-date-input">
              Date
              <input
                type="date"
                required
                disabled={saving}
                value={date}
                onChange={(event) => chooseDate(event.target.value)}
              />
            </label>
            <div className="body-entry-fields">
              {BODY_SIZE_FIELDS.map(([key, label]) => (
                <label key={key}>
                  {label} ({unit})
                  <input
                    type="number"
                    name={key}
                    disabled={saving}
                    step="any"
                    inputMode="decimal"
                    placeholder={lastValue(key)}
                    value={draft[key] ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </form>
        </PopupDialog>
      )}
      {offeredSex && (
        <PopupDialog
          title={`Save your sex as ${SEX_LABELS[offeredSex]}?`}
          className="profile-sex-confirm"
          size="compact"
          busy={savingSex}
          onClose={() => setOfferedSex(null)}
          actions={
            <>
              <button type="button" disabled={savingSex} onClick={() => setOfferedSex(null)}>
                Not now
              </button>
              <button
                type="button"
                className="popup-primary-action"
                disabled={savingSex}
                onClick={() => void saveSex()}
              >
                {savingSex ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <p>
            It sets your body measurement outline. After you save, only an administrator can change
            it.
          </p>
          {sexError && (
            <p role="alert" className="inline-error">
              {sexError}
            </p>
          )}
        </PopupDialog>
      )}
      {deleting && (
        <PopupDialog
          title="Delete body measurements?"
          className="body-sizes-delete"
          size="compact"
          busy={saving}
          onClose={() => {
            setDeleting(null);
            setError(null);
          }}
          actions={
            <>
              <button
                type="button"
                autoFocus
                disabled={saving}
                onClick={() => {
                  setDeleting(null);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="popup-primary-action is-danger"
                disabled={saving}
                onClick={() => void remove()}
              >
                {saving ? 'Deleting…' : 'Delete measurements'}
              </button>
            </>
          }
        >
          <p>Delete the measurements for {shortDate(deleting)}?</p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </PopupDialog>
      )}
    </section>
  );
}
