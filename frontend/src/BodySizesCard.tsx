import { useEffect, useState } from 'react';
import { api } from './api';
import { BODY_SIZE_FIELDS, type BodySizeField, type BodySizeLog } from './bodySizes';
import { PopupDialog } from './PopupDialog';
import { HelpPopup } from './HelpPopup';
import { useWeightUnit } from './trainingPreferencesContext';
import { localDate } from './utils';
import './bodySizes.css';

type Draft = Record<BodySizeField, string>;

const shortDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));

export function BodySizesCard({ dataRevision = null }: { dataRevision?: string | null }) {
  const weightUnit = useWeightUnit();
  const unit = weightUnit === 'lb' ? 'in' : 'cm';
  const factor = unit === 'in' ? 2.54 : 1;
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
        BODY_SIZE_FIELDS.map(([key]) => [
          key,
          row?.[key] == null ? '' : String(Number((row[key] / factor).toFixed(2))),
        ]),
      ) as Draft,
    );
    setError(null);
  }

  async function save() {
    const payload = { measurement_date: date } as BodySizeLog;
    for (const [key, label] of BODY_SIZE_FIELDS) {
      const text = draft[key]?.trim();
      // Keep untouched measurements exact when displaying rounded inches.
      const original = logs?.find((row) => row.measurement_date === date)?.[key];
      const unchanged = original != null && text === String(Number((original / factor).toFixed(2)));
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
      const saved = await api.saveBodySizes(payload);
      setLogs((items) =>
        [saved, ...(items ?? []).filter((row) => row.measurement_date !== date)].sort((a, b) =>
          b.measurement_date.localeCompare(a.measurement_date),
        ),
      );
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save measurements.');
    } finally {
      setSaving(false);
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

  const latest = logs?.[0];
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
  const open = (day: string) => {
    chooseDate(day);
    setEditing(true);
  };

  return (
    <section className="pulse-card body-sizes-card" aria-label="Body measurements">
      <header className="pulse-card-header">
        <div className="body-sizes-title">
          <h2>Body measurements</h2>
          <HelpPopup title="Body measurements">
            <p>
              Measure circumferences with a relaxed tape, using the same position each time. All
              fields are optional; enter at least one. Wrist and ankle measurements here are a
              history log. Set your frame measurements separately in FFMI details.
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
      ) : !latest ? (
        <p className="body-sizes-empty">No body measurements yet</p>
      ) : (
        <>
          <time className="body-sizes-date" dateTime={latest.measurement_date}>
            {shortDate(latest.measurement_date)}
          </time>
          <dl className="body-sizes-grid">
            {BODY_SIZE_FIELDS.filter(([key]) => latest[key] !== null).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{format(latest[key]!)}</dd>
              </div>
            ))}
          </dl>
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
      {editing && (
        <PopupDialog
          title="Log body measurements"
          className="body-sizes-popup"
          onClose={() => {
            if (!saving) {
              setEditing(false);
              setError(null);
            }
          }}
        >
          <form
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
                    disabled={saving}
                    step="any"
                    inputMode="decimal"
                    placeholder="Optional"
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
            <footer className="popup-dialog-actions">
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
              <button type="submit" className="popup-primary-action" disabled={saving}>
                {saving
                  ? 'Saving…'
                  : logs?.some((row) => row.measurement_date === date)
                    ? 'Update measurements'
                    : 'Save measurements'}
              </button>
            </footer>
          </form>
        </PopupDialog>
      )}
      {deleting && (
        <PopupDialog
          title="Delete body measurements?"
          className="body-sizes-delete"
          onClose={() => {
            if (!saving) {
              setDeleting(null);
              setError(null);
            }
          }}
        >
          <p>Delete the measurements for {shortDate(deleting)}?</p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <footer className="popup-dialog-actions">
            <button
              type="button"
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
              className="danger-button"
              disabled={saving}
              onClick={() => void remove()}
            >
              {saving ? 'Deleting…' : 'Delete measurements'}
            </button>
          </footer>
        </PopupDialog>
      )}
    </section>
  );
}
