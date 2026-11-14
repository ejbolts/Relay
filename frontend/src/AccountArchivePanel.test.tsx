// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountArchivePanel } from './AccountArchivePanel';
import { api, ApiError } from './api';
import type { ArchivePreview } from './types';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    api: {
      ...original.api,
      downloadAccountArchive: vi.fn(),
      previewAccountArchive: vi.fn(),
    },
  };
});

const preview: ArchivePreview = {
  created_at: '2026-11-12T08:30:00+00:00',
  username: 'sample',
  archive: { workouts: 12, cardio_sessions: 3, body_check_ins: 20, custom_exercises: 2, photos: 4 },
  current: { workouts: 10, cardio_sessions: 3, body_check_ins: 18, custom_exercises: 2, photos: 4 },
  photos_skipped: 0,
};
let root: Root;
let container: HTMLDivElement;
let onRestore: ReturnType<typeof vi.fn<(file: File) => Promise<void>>>;

function button(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  );
}

function dialog() {
  return document.querySelector<HTMLDialogElement>('.account-archive-dialog');
}

async function choose(file = new File(['zip'], 'relay-backup.zip', { type: 'application/zip' })) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  onRestore = vi.fn<(file: File) => Promise<void>>().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('full backup', () => {
  it('downloads the backup as a dated zip', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    vi.mocked(api.downloadAccountArchive).mockResolvedValueOnce(blob);
    const createObjectURL = vi.fn(() => 'blob:backup');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    expect(container.querySelector('h2')?.textContent).toBe('Full backup');
    await act(async () => button('↓ Download backup', container)!.click());
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toMatch(/^relay-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('shows why a download failed beside the buttons', async () => {
    vi.mocked(api.downloadAccountArchive).mockRejectedValueOnce(
      new ApiError('An archive is already being prepared.', 'archive_busy', 429),
    );
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    await act(async () => button('↓ Download backup', container)!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'An archive is already being prepared.',
    );
  });

  it('previews a backup against the account before restoring it', async () => {
    vi.mocked(api.previewAccountArchive).mockResolvedValueOnce(preview);
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    const file = await choose();
    expect(api.previewAccountArchive).toHaveBeenCalledWith(file);
    expect(dialog()?.textContent).toContain('Restore this backup?');
    const rows = [...dialog()!.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows[0]).toEqual(['Workouts', '12', '10']);
    expect(rows.map((row) => row[0])).toEqual([
      'Workouts',
      'Cardio sessions',
      'Body check-ins',
      'Custom exercises',
      'Machine photos',
    ]);
    expect(dialog()?.textContent).toContain('This replaces your current training data.');
    expect(onRestore).not.toHaveBeenCalled();

    await act(async () => button('Restore backup', dialog()!)!.click());
    expect(onRestore).toHaveBeenCalledWith(file);
  });

  it('closes the preview without restoring when cancelled', async () => {
    vi.mocked(api.previewAccountArchive).mockResolvedValueOnce(preview);
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    await choose();
    await act(async () => button('Cancel', dialog()!)!.click());
    expect(dialog()).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('mentions photos the backup cannot bring back', async () => {
    vi.mocked(api.previewAccountArchive).mockResolvedValueOnce({ ...preview, photos_skipped: 2 });
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    await choose();
    expect(dialog()?.textContent).toContain(
      '2 photos in this backup are missing and will be left out.',
    );
  });

  it('keeps the preview open with the reason when the restore is refused', async () => {
    vi.mocked(api.previewAccountArchive).mockResolvedValueOnce(preview);
    onRestore.mockRejectedValueOnce(new ApiError('This archive holds another account.'));
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    await choose();
    await act(async () => button('Restore backup', dialog()!)!.click());
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
      'This archive holds another account.',
    );
    expect(button('Restore backup', dialog()!)!.disabled).toBe(false);
  });

  it('explains a file that is not a backup without opening the preview', async () => {
    vi.mocked(api.previewAccountArchive).mockRejectedValueOnce(
      new ApiError('This file is not a Relay archive, or it is damaged.'),
    );
    await act(async () => root.render(<AccountArchivePanel onRestore={onRestore} />));
    await choose(new File(['x'], 'photo.zip'));
    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'This file is not a Relay archive, or it is damaged.',
    );
  });
});
