import { useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import type { ImportBatch } from './types';

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
          title="Import history"
          onClose={() => {
            if (!busy) {
              setOpen(false);
              setSelected(null);
            }
          }}
        >
          {loading ? (
            <p role="status">Loading imports…</p>
          ) : !selected ? (
            <>
              {batches?.length === 0 && (
                <p>No tracked imports yet. Earlier imports cannot be undone as a batch.</p>
              )}
              <ul className="import-batches" aria-label="Import batches">
                {batches?.map((batch) => (
                  <li key={batch.id}>
                    <strong>{batch.file_name}</strong>
                    <span>
                      {new Date(batch.created_at).toLocaleString()} ·{' '}
                      {batch.source === 'gym' ? 'Relay / spreadsheet' : batch.source}
                    </span>
                    <span>
                      {batch.workouts} {batch.workouts === 1 ? 'session' : 'sessions'} ·{' '}
                      {batch.body_measurements}{' '}
                      {batch.body_measurements === 1 ? 'check-in' : 'check-ins'}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelected(batch);
                        setError(null);
                      }}
                    >
                      Undo import
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {selected && (
            <div className="import-undo-confirm" role="group" aria-label="Confirm undo import">
              <h3>Undo {selected.file_name}?</h3>
              <p>
                {selected.workouts} {selected.workouts === 1 ? 'session' : 'sessions'} ·{' '}
                {selected.body_measurements}{' '}
                {selected.body_measurements === 1 ? 'check-in' : 'check-ins'}
              </p>
              <p>
                Permanently delete this batch’s sessions (including edits) and unedited check-ins.
              </p>
              <div className="popup-dialog-actions">
                <button type="button" disabled={busy} onClick={() => setSelected(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => void undo()}
                >
                  {busy ? 'Undoing…' : 'Confirm undo'}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </PopupDialog>
      )}
    </>
  );
}
