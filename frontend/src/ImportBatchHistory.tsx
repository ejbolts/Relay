import { useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import type { ImportBatch } from './types';
import {
  importBatchCounts as counts,
  importBatchDetails as details,
  importUndoWarning,
  NO_TRACKED_IMPORTS,
  NOTHING_LEFT_TO_REMOVE,
} from './workoutImport';

export function ImportBatchHistory({ onUndo }: { onUndo: (id: string) => Promise<void> }) {
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ImportBatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setLoading(true);
    setError(null);
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
      // The app confirms with a toast, which a modal would cover.
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not undo that import.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="pulse-button secondary" onClick={() => void show()}>
        Import history
      </button>
      {open && (
        <PopupDialog
          title={selected ? 'Undo import?' : 'Import history'}
          className="import-history-dialog"
          busy={busy}
          onBack={selected ? () => setSelected(null) : undefined}
          onClose={() => {
            setOpen(false);
            setSelected(null);
          }}
          actions={
            selected && (
              <>
                <button type="button" autoFocus disabled={busy} onClick={() => setSelected(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="popup-primary-action is-danger import-undo-action"
                  disabled={busy}
                  onClick={() => void undo()}
                >
                  {busy ? 'Undoing…' : 'Undo import'}
                </button>
              </>
            )
          }
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
                  <span>{counts(selected) || NOTHING_LEFT_TO_REMOVE}</span>
                  <span>{details(selected)}</span>
                </div>
                <p>{importUndoWarning(selected)}</p>
              </div>
            ) : batches?.length === 0 ? (
              <p className="import-history-muted">{NO_TRACKED_IMPORTS}</p>
            ) : (
              <ul className="import-batches" aria-label="Import batches">
                {batches?.map((batch) => (
                  <li key={batch.id}>
                    <div className="import-batch-info">
                      <strong>{batch.file_name}</strong>
                      <span>{counts(batch) || NOTHING_LEFT_TO_REMOVE}</span>
                      <span>{details(batch)}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Undo ${batch.file_name}`}
                      disabled={busy}
                      onClick={() => {
                        setSelected(batch);
                        setError(null);
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
          </div>
        </PopupDialog>
      )}
    </>
  );
}
