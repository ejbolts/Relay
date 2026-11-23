import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { blockOn } from '../../../../frontend/src/trainingBlocks';
import type {
  TrainingBlock,
  TrainingBlockInput,
  TrainingBlockSummary,
  TrainingBlocks,
} from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiGet, apiSend } from '../../data/api';

/**
 * Training blocks, under `workouts` so `refreshTraining` re-reads their workout counts after a
 * workout is saved.
 */
export const blockKeys = {
  all: ['workouts', 'training-blocks'] as const,
  summary: (id: string) => ['workouts', 'training-blocks', 'summary', id] as const,
};

export function useTrainingBlocks() {
  return useQuery({
    queryKey: blockKeys.all,
    queryFn: ({ signal }) => apiGet<TrainingBlocks>('/api/training-blocks', signal),
  });
}

export function useBlockSummary(id: string | undefined) {
  return useQuery({
    queryKey: blockKeys.summary(id ?? ''),
    enabled: !!id,
    queryFn: ({ signal }) =>
      apiGet<TrainingBlockSummary>(
        `/api/training-blocks/${encodeURIComponent(id!)}/summary`,
        signal,
      ),
  });
}

/**
 * Every write answers with all the blocks, which replace the saved ones. Block records and
 * progress scoped to a block follow the new dates, so those are read again.
 */
async function saved(client: QueryClient, next: Promise<TrainingBlocks>) {
  const blocks = await next;
  client.setQueryData(blockKeys.all, blocks);
  void client.invalidateQueries({ queryKey: ['workouts', 'training-blocks', 'summary'] });
  void client.invalidateQueries({ queryKey: ['workouts', 'progress'] });
  void client.invalidateQueries({ queryKey: ['personal-records'] });
  return blocks;
}

export const createBlock = (client: QueryClient, input: TrainingBlockInput) =>
  saved(client, apiSend<TrainingBlocks>('/api/training-blocks', 'POST', input));

export const updateBlock = (client: QueryClient, id: string, input: TrainingBlockInput) =>
  saved(
    client,
    apiSend<TrainingBlocks>(`/api/training-blocks/${encodeURIComponent(id)}`, 'PUT', input),
  );

export const removeBlock = (client: QueryClient, id: string) =>
  saved(
    client,
    apiSend<TrainingBlocks>(`/api/training-blocks/${encodeURIComponent(id)}`, 'DELETE'),
  );

// Which block Exercises and an exercise's progress show, shared by every screen as the web's
// provider shares it: "current" (the block covering today, or all time without one), "all", or
// a block's id. It starts at "current" each time the app opens.
let selection = 'current';
const listeners = new Set<() => void>();

export function selectBlock(next: string) {
  if (next === selection) return;
  selection = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const current = () => selection;

/** The chosen block for progress, with the blocks it was chosen from. */
export function useBlockScope() {
  const blocks = useTrainingBlocks();
  const chosen = useSyncExternalStore(subscribe, current, current);
  const config = blocks.data ?? { blocks: [] };
  const block: TrainingBlock | null =
    chosen === 'all'
      ? null
      : chosen === 'current'
        ? blockOn(config.blocks, localDate())
        : (config.blocks.find((item) => item.id === chosen) ?? null);
  const client = useQueryClient();
  const retry = useCallback(
    () => void client.invalidateQueries({ queryKey: blockKeys.all, exact: true }),
    [client],
  );
  return {
    config,
    block,
    selection: chosen,
    select: selectBlock,
    /** False until the blocks have loaded or failed, so progress isn't read twice at startup. */
    known: !blocks.isPending,
    loading: blocks.isPending,
    error: blocks.isError,
    retry,
  };
}
