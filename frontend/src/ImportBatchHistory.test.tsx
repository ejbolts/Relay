import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';
import { ImportBatchHistory } from './ImportBatchHistory';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
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
vi.mock('./api', () => ({ api: { importBatches: vi.fn() } }));
const batch = {
  id: 'one',
  file_name: 'sample.csv',
  source: 'gym',
  created_at: '2026-10-28T01:00:00Z',
  workouts: 2,
  body_measurements: 1,
};
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function render(onUndo: (id: string) => Promise<void>) {
  hooks.cursor = 0;
  return elements(ImportBatchHistory({ onUndo }));
}
function click(nodes: ReturnType<typeof render>, label: string) {
  (
    nodes.find((node) => node.type === 'button' && node.props.children === label)!.props
      .onClick as () => void
  )();
}
beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
});

it('loads batches on demand, cancels safely, and removes only the confirmed batch', async () => {
  vi.mocked(api.importBatches).mockResolvedValue([
    batch,
    { ...batch, id: 'two', file_name: 'other.csv' },
  ]);
  const onUndo = vi.fn().mockResolvedValue(undefined);
  click(render(onUndo), 'Import history');
  await vi.waitFor(() => expect(hooks.values[0]).not.toBeNull());
  click(render(onUndo), 'Undo import');
  click(render(onUndo), 'Cancel');
  expect(onUndo).not.toHaveBeenCalled();
  click(render(onUndo), 'Undo import');
  click(render(onUndo), 'Confirm undo');
  await vi.waitFor(() => expect(onUndo).toHaveBeenCalledWith('one'));
  expect(hooks.values[0]).toEqual([{ ...batch, id: 'two', file_name: 'other.csv' }]);
});

it('keeps the batch and shows a retryable undo error', async () => {
  vi.mocked(api.importBatches).mockResolvedValue([batch]);
  const onUndo = vi.fn().mockRejectedValue(new Error('Could not undo.'));
  click(render(onUndo), 'Import history');
  await vi.waitFor(() => expect(hooks.values[0]).not.toBeNull());
  click(render(onUndo), 'Undo import');
  click(render(onUndo), 'Confirm undo');
  await vi.waitFor(() =>
    expect(render(onUndo).find((node) => node.props.role === 'alert')?.props.children).toBe(
      'Could not undo.',
    ),
  );
  expect(hooks.values[0]).toEqual([batch]);
  expect(hooks.values[4]).toEqual(batch);
});
