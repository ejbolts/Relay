import { useRef, useState } from 'react';
import { api } from './api';
import { PopupDialog } from './PopupDialog';
import type { ArchivePreview } from './types';
import { localDate } from './utils';
import {
  ARCHIVE_DOWNLOAD_FAILED,
  ARCHIVE_FILE_TYPES,
  ARCHIVE_READ_FAILED,
  ARCHIVE_RESTORE_FAILED,
  ARCHIVE_RESTORE_WARNING,
  archiveCountRows,
  archiveFileName,
  archiveKicker,
  archiveSkippedNote,
} from './accountArchive';
import { downloadFile as saveFile } from './downloadFile';

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
      saveFile(await api.downloadAccountArchive(), archiveFileName(localDate()));
    } catch (caught) {
      setError(message(caught, ARCHIVE_DOWNLOAD_FAILED));
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
      setError(message(caught, ARCHIVE_READ_FAILED));
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
      setRestoreError(message(caught, ARCHIVE_RESTORE_FAILED));
      setRestoring(false);
    }
  }

  const skipped = pending ? archiveSkippedNote(pending.preview.photos_skipped) : null;

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
        <button
          type="button"
          className="pulse-button secondary"
          disabled={downloading}
          onClick={() => void download()}
        >
          {downloading ? 'Preparing…' : '↓ Download backup'}
        </button>
        <button
          type="button"
          className="pulse-button secondary"
          disabled={checking}
          onClick={() => fileInput.current?.click()}
        >
          {checking ? 'Checking…' : 'Restore backup'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ARCHIVE_FILE_TYPES.join(',')}
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
          kicker={archiveKicker(pending.preview)}
          className="account-archive-dialog"
          busy={restoring}
          onClose={() => setPending(null)}
          actions={
            <>
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
            </>
          }
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
              {archiveCountRows(pending.preview).map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td className="num">{row.archive}</td>
                  <td className="num">{row.current}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {skipped && <p className="account-archive-note">{skipped}</p>}
          <p className="account-archive-warning">{ARCHIVE_RESTORE_WARNING}</p>
          {restoreError && (
            <p className="inline-error" role="alert">
              {restoreError}
            </p>
          )}
        </PopupDialog>
      )}
    </section>
  );
}
