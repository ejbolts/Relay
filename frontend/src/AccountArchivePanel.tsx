import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import type { ArchiveCounts, ArchivePreview } from './types';
import { localDate } from './utils';

const COUNT_LABELS: Array<[keyof ArchiveCounts, string]> = [
  ['workouts', 'Workouts'],
  ['cardio_sessions', 'Cardio sessions'],
  ['body_check_ins', 'Body check-ins'],
  ['custom_exercises', 'Custom exercises'],
  ['photos', 'Machine photos'],
];

function saveFile(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function savedOn(createdAt: string | null): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Download a complete copy of the account, or put one back. */
export function AccountArchivePanel({ onRestore }: { onRestore: (file: File) => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; preview: ArchivePreview } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      saveFile(await api.downloadAccountArchive(), `relay-backup-${localDate()}.zip`);
    } catch (caught) {
      setError(message(caught, 'Your backup could not be prepared. Try again.'));
    } finally {
      setDownloading(false);
    }
  }

  async function check(file: File) {
    setChecking(true);
    setError(null);
    try {
      setRestoreError(null);
      setPending({ file, preview: await api.previewAccountArchive(file) });
    } catch (caught) {
      setError(message(caught, 'That backup could not be read.'));
    } finally {
      setChecking(false);
    }
  }

  async function restore() {
    if (!pending || restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await onRestore(pending.file);
    } catch (caught) {
      setRestoreError(message(caught, 'The backup could not be restored. Nothing was changed.'));
      setRestoring(false);
    }
  }

  const created = pending ? savedOn(pending.preview.created_at) : null;

  return (
    <section
      className="settings-panel panel account-archive-panel"
      aria-labelledby="account-archive-title"
    >
      <header>
        <div>
          <p className="section-kicker">BACKUP</p>
          <h2 id="account-archive-title">Full backup</h2>
        </div>
      </header>
      <div className="settings-actions data-transfer-actions">
        <button type="button" disabled={downloading} onClick={() => void download()}>
          {downloading ? 'Preparing…' : '↓ Download backup'}
        </button>
        <button type="button" disabled={checking} onClick={() => fileInput.current?.click()}>
          {checking ? 'Checking…' : 'Restore backup'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          aria-label="Backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void check(file);
          }}
        />
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <PopupDialog
          title="Restore this backup?"
          kicker={created ? `SAVED ${created.toUpperCase()}` : 'RESTORE'}
          className="account-archive-dialog"
          onClose={() => {
            if (!restoring) setPending(null);
          }}
        >
          <table className="account-archive-counts">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Data</span>
                </th>
                <th scope="col">Backup</th>
                <th scope="col">Now</th>
              </tr>
            </thead>
            <tbody>
              {COUNT_LABELS.map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td className="num">{pending.preview.archive[key]}</td>
                  <td className="num">{pending.preview.current[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pending.preview.photos_skipped > 0 && (
            <p className="account-archive-note">
              {pending.preview.photos_skipped === 1
                ? '1 photo in this backup is missing and will be left out.'
                : `${pending.preview.photos_skipped} photos in this backup are missing and will be left out.`}
            </p>
          )}
          <p className="account-archive-warning">
            This replaces your current training data. A copy of it is kept on the server.
          </p>
          {restoreError && (
            <p className="inline-error" role="alert">
              {restoreError}
            </p>
          )}
          <footer className="popup-dialog-actions">
            <button type="button" disabled={restoring} onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="popup-primary-action"
              disabled={restoring}
              onClick={() => void restore()}
            >
              {restoring ? 'Restoring…' : 'Restore backup'}
            </button>
          </footer>
        </PopupDialog>
      )}
    </section>
  );
}
