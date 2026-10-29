import { useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import { IMPORT_APPS } from './WorkoutImportSource';
import type { ImportBatch } from './types';

function counts(batch: ImportBatch) {
  return [
    batch.workouts && `${batch.workouts} ${batch.workouts === 1 ? 'session' : 'sessions'}`,
    batch.body_measurements &&
      `${batch.body_measurements} ${batch.body_measurements === 1 ? 'check-in' : 'check-ins'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function details(batch: ImportBatch) {
  const source = IMPORT_APPS.find((app) => app.id === batch.source)?.name ?? batch.source;
  const time = new Date(batch.created_at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return `${source} · ${time}`;
}

export function ImportBatchHistory({ onUndo }: { onUndo: (id: string) => Promise<void> }) {
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ImportBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      setBatches(await api.importBatches());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load imports.');
    } finally {
      setLoading(false);
    }
  }

  async function undo() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUndo(selected.id);
      setBatches((batches ?? []).filter((batch) => batch.id !== selected.id));
      setSelected(null);
      setNotice('Import undone.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not undo that import.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void show()}>
        Import history
      </button>
      {open && (
        <PopupDialog
          title={selected ? 'Undo import?' : 'Import history'}
          className="import-history-dialog"
          onClose={() => {
            if (!busy) {
              setOpen(false);
              setSelected(null);
            }
          }}
        >
          <div className="import-history">
            {loading ? (
              <p role="status" className="import-history-muted">
                Loading imports…
              </p>
            ) : selected ? (
              <div className="import-undo-confirm" role="group" aria-label="Confirm undo import">
                <div className="import-batch-info">
                  <strong>{selected.file_name}</strong>
                  <span>{counts(selected) || 'Nothing left to remove'}</span>
                  <span>{details(selected)}</span>
                </div>
                <p>
                  {selected.workouts > 0 &&
                    'Sessions are permanently deleted, including later edits. '}
                  {selected.body_measurements > 0 && 'Edited check-ins are kept.'}
                </p>
                <div className="popup-dialog-actions">
                  <button type="button" disabled={busy} onClick={() => setSelected(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="popup-primary-action import-undo-action"
                    disabled={busy}
                    onClick={() => void undo()}
                  >
                    {busy ? 'Undoing…' : 'Undo import'}
                  </button>
                </div>
              </div>
            ) : batches?.length === 0 ? (
              <p className="import-history-muted">
                No tracked imports yet. Earlier imports cannot be undone as a batch.
              </p>
            ) : (
              <ul className="import-batches" aria-label="Import batches">
                {batches?.map((batch) => (
                  <li key={batch.id}>
                    <div className="import-batch-info">
                      <strong>{batch.file_name}</strong>
                      <span>{counts(batch) || 'Nothing left to remove'}</span>
                      <span>{details(batch)}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Undo ${batch.file_name}`}
                      disabled={busy}
                      onClick={() => {
                        setSelected(batch);
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="import-history-muted">
                {notice}
              </p>
            )}
          </div>
        </PopupDialog>
      )}
    </>
  );
}
