import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { WorkoutCsvImport, WorkoutImportReview } from './WorkoutCsvImport';
import { WorkoutImportSource } from './WorkoutImportSource';
import { WorkoutCsvGuide } from './WorkoutCsvGuide';
import type { CsvImportPreview } from './types';

// Drive the component's real event handlers without introducing a DOM test dependency.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = value;
      },
    ];
  },
}));
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));
vi.mock('./api', () => ({ api: { previewWorkoutImport: vi.fn() } }));
vi.mock('./trainingPreferencesContext', () => ({ useWeightUnit: () => 'kg' }));

const options = { source: 'gym', weight_unit: 'kg', distance_unit: 'km' } as const;

const preview: CsvImportPreview = {
  sessions: [
    {
      workout_date: '2026-07-17',
      name: 'Morning',
      exercises: ['Bench Press'],
      sets: 2,
      duplicate: false,
    },
    {
      workout_date: '2026-07-17',
      name: 'Evening',
      exercises: ['Safety Test Press'],
      sets: 1,
      duplicate: true,
    },
  ],
  workouts_to_create: 1,
  workouts_to_skip: 1,
  sets_to_import: 2,
  new_exercises: ['Safety Test Press'],
  warnings: ['Older files group one session per date.'],
};

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

function render(onImport: (file: File) => Promise<void>) {
  hooks.cursor = 0;
  return elements(WorkoutCsvImport({ onImport }));
}

function select(nodes: ReturnType<typeof render>, file: File) {
  const input = nodes.find((element) => element.type === 'input')!;
  (input.props.onChange as (event: unknown) => void)({
    currentTarget: { files: [file], value: 'file' },
  });
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
  vi.stubGlobal('document', { body: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('workout CSV review flow', () => {
  it('requires an updated review after mapping and saves the reviewed mapping', async () => {
    vi.mocked(api.previewWorkoutImport).mockResolvedValue(preview);
    const onImport = vi.fn().mockResolvedValue(undefined);
    const file = { name: 'mapping.csv' } as File;
    select(render(onImport), file);
    await vi.waitFor(() => expect(hooks.values[0]).not.toBeNull());
    const current = () => render(onImport).find((node) => node.type === WorkoutImportReview)!;
    (current().props.onMappingChange as (name: string, id: string) => void)(
      'Safety Test Press',
      'existing',
    );
    expect(current().props.reviewStale).toBe(true);
    (current().props.onSave as () => void)();
    expect(onImport).not.toHaveBeenCalled();
    const mapped = { ...options, exercise_mappings: { 'Safety Test Press': 'existing' } };
    (current().props.onUpdateReview as () => void)();
    await vi.waitFor(() => expect(api.previewWorkoutImport).toHaveBeenLastCalledWith(file, mapped));
    await vi.waitFor(() => expect(current().props.reviewStale).toBe(false));
    (current().props.onSave as () => void)();
    await vi.waitFor(() => expect(onImport).toHaveBeenCalledWith(file, mapped));
  });

  it('keeps saving disabled when an updated mapping is rejected', async () => {
    vi.mocked(api.previewWorkoutImport)
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(new Error('Mapped exercise unavailable.'));
    const onImport = vi.fn();
    select(render(onImport), { name: 'mapping.csv' } as File);
    await vi.waitFor(() => expect(hooks.values[0]).not.toBeNull());
    const current = () => render(onImport).find((node) => node.type === WorkoutImportReview)!;
    (current().props.onMappingChange as (name: string, id: string) => void)(
      'Safety Test Press',
      'missing',
    );
    (current().props.onUpdateReview as () => void)();
    await vi.waitFor(() => expect(current().props.error).toBe('Mapped exercise unavailable.'));
    expect(current().props.reviewStale).toBe(true);
    (current().props.onSave as () => void)();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('notifies Settings of source changes from both the cards and guide', () => {
    const onSourceChange = vi.fn();
    const nodes = elements(
      WorkoutCsvImport({
        onImport: vi.fn(),
        guideOpen: true,
        onGuideOpenChange: vi.fn(),
        onSourceChange,
      }),
    );
    const source = nodes.find((element) => element.type === WorkoutImportSource)!;
    const guide = nodes.find((element) => element.type === WorkoutCsvGuide)!;
    for (const selected of ['strengthlevel', 'hevy', 'strong', 'gym']) {
      (source.props.onChange as (value: unknown) => void)({ ...options, source: selected });
      expect(onSourceChange).toHaveBeenLastCalledWith(selected);
    }
    (guide.props.onOptionsChange as (value: unknown) => void)({ ...options, source: 'hevy' });
    expect(onSourceChange).toHaveBeenLastCalledWith('hevy');
  });

  it('saves with the source and units used by the preview even if the selector changes', async () => {
    vi.mocked(api.previewWorkoutImport).mockResolvedValue(preview);
    const onImport = vi.fn().mockResolvedValue(undefined);
    const selected = { source: 'strong', weight_unit: 'lb', distance_unit: 'mi' } as const;
    const source = render(onImport).find((element) => element.type === WorkoutImportSource)!;
    (source.props.onChange as (value: unknown) => void)(selected);
    const file = { name: 'strong.csv' } as File;
    select(render(onImport), file);
    await vi.waitFor(() => expect(api.previewWorkoutImport).toHaveBeenCalledWith(file, selected));
    const changed = render(onImport).find((element) => element.type === WorkoutImportSource)!;
    (changed.props.onChange as (value: unknown) => void)(options);
    const review = render(onImport).find((element) => element.type === WorkoutImportReview)!;
    (review.props.onSave as () => void)();
    await vi.waitFor(() => expect(onImport).toHaveBeenCalledWith(file, selected));
  });

  it('uses the source chosen in the guide when its file is selected', async () => {
    vi.mocked(api.previewWorkoutImport).mockResolvedValue(preview);
    hooks.cursor = 0;
    const onImport = vi.fn();
    const nodes = elements(
      WorkoutCsvImport({ onImport, guideOpen: true, onGuideOpenChange: vi.fn() }),
    );
    const guide = nodes.find((element) => element.type === WorkoutCsvGuide)!;
    const selected = { ...options, source: 'hevy' } as const;
    const file = { name: 'hevy.csv' } as File;
    (guide.props.onFileSelected as (file: File, value: unknown) => void)(file, selected);
    await vi.waitFor(() => expect(api.previewWorkoutImport).toHaveBeenCalledWith(file, selected));
    expect(onImport).not.toHaveBeenCalled();
  });

  it('can save a measurements-only import and shows counts without requiring workouts', () => {
    const dialog = WorkoutImportReview({
      fileName: 'measurements.csv',
      preview: {
        ...preview,
        workouts_to_create: 0,
        sets_to_import: 0,
        body_measurements_to_create: 2,
        body_measurements_to_skip: 1,
      },
      saving: false,
      error: null,
      onCancel: vi.fn(),
      onSave: vi.fn(),
    });
    const save = elements(dialog).find(
      (element) => element.type === 'button' && element.props.children === 'Save import',
    )!;
    expect(save.props.disabled).toBe(false);
    const markup = renderToStaticMarkup(dialog);
    expect(markup).toContain('2 body-weight check-ins');
    expect(markup).toContain('1 existing date will be kept');
  });

  it('shows all four app logos and accessible selected source controls', () => {
    const markup = renderToStaticMarkup(
      <WorkoutImportSource value={{ ...options, source: 'hevy' }} onChange={vi.fn()} />,
    );
    for (const source of ['strengthlevel', 'hevy', 'strong']) {
      expect(markup).toContain(`/import-apps/${source}.png`);
    }
    expect(markup).toContain('aria-label="Import from app"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Strength Level');
    expect(markup).toContain('/icon-192.png');
    expect(markup).toContain('Relay');
  });

  it('file selection only previews; Cancel never invokes the save callback', async () => {
    vi.mocked(api.previewWorkoutImport).mockResolvedValue(preview);
    const onImport = vi.fn().mockResolvedValue(undefined);
    const file = { name: 'history.csv' } as File;
    select(render(onImport), file);
    await vi.waitFor(() => expect(api.previewWorkoutImport).toHaveBeenCalledWith(file, options));
    const review = render(onImport).find((element) => element.type === WorkoutImportReview)!;
    expect(review.props.preview).toEqual(preview);
    expect(onImport).not.toHaveBeenCalled();
    (review.props.onCancel as () => void)();
    expect(render(onImport).some((element) => element.type === WorkoutImportReview)).toBe(false);
    expect(onImport).not.toHaveBeenCalled();
  });

  it('explicit Save sends the original file and keeps the review open on a save failure', async () => {
    vi.mocked(api.previewWorkoutImport).mockResolvedValue(preview);
    const onImport = vi
      .fn()
      .mockRejectedValueOnce(new Error('Nothing was saved.'))
      .mockResolvedValue(undefined);
    const file = { name: 'history.csv' } as File;
    select(render(onImport), file);
    await vi.waitFor(() => expect(hooks.values[0]).not.toBeNull());
    const review = render(onImport).find((element) => element.type === WorkoutImportReview)!;
    (review.props.onSave as () => void)();
    await vi.waitFor(() => expect(hooks.values[5]).toBe('Nothing was saved.'));
    expect(onImport).toHaveBeenCalledWith(file, options);
    const failed = render(onImport).find((element) => element.type === WorkoutImportReview)!;
    expect(failed.props.error).toBe('Nothing was saved.');
    (failed.props.onSave as () => void)();
    await vi.waitFor(() => expect(hooks.values[0]).toBeNull());
    expect(onImport).toHaveBeenCalledTimes(2);
  });

  it('a malformed preview shows its error without making a save request', async () => {
    vi.mocked(api.previewWorkoutImport).mockRejectedValue(new Error('Row 2: invalid weight.'));
    const onImport = vi.fn();
    select(render(onImport), { name: 'bad.csv' } as File);
    await vi.waitFor(() => expect(hooks.values[5]).toBe('Row 2: invalid weight.'));
    const nodes = render(onImport);
    expect(nodes.some((element) => element.type === WorkoutImportReview)).toBe(false);
    expect(nodes.find((element) => element.props.role === 'alert')?.props.children).toBe(
      'Row 2: invalid weight.',
    );
    expect(onImport).not.toHaveBeenCalled();
  });

  it('shows session/set/new exercise totals, duplicate status, warnings and explicit controls', () => {
    const markup = renderToStaticMarkup(
      <WorkoutImportReview
        fileName="history.csv"
        preview={preview}
        saving={false}
        error={null}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(markup).toContain('Review import');
    expect(markup).toContain('1 session');
    expect(markup).toContain('2 sets');
    expect(markup).toContain('New exercises: Safety Test Press');
    expect(markup).toContain('Skip duplicate');
    expect(markup).toContain('Older files group one session per date.');
    expect(markup).toContain('>Cancel</button>');
    expect(markup).toContain('>Save import</button>');
  });

  it('does not offer Save when every session is already present', () => {
    const onlyDuplicates = {
      ...preview,
      workouts_to_create: 0,
      sets_to_import: 0,
      workouts_to_skip: 2,
    };
    const dialog = WorkoutImportReview({
      fileName: 'history.csv',
      preview: onlyDuplicates,
      saving: false,
      error: null,
      onCancel: vi.fn(),
      onSave: vi.fn(),
    });
    const save = elements(dialog).find(
      (element) => element.type === 'button' && element.props.children === 'Save import',
    )!;
    expect(save.props.disabled).toBe(true);
  });
});
