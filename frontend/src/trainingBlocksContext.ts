import { createContext, useContext } from 'react';
import type { TrainingBlock, TrainingBlocks } from './types';

export const TrainingBlocksContext = createContext<{
  config: TrainingBlocks;
  block: TrainingBlock | null;
  select: (id: string) => void;
  changed: (config: TrainingBlocks) => void;
  loading: boolean;
  error: string | null;
  retry: () => void;
}>({
  config: { blocks: [] },
  block: null,
  select: () => {},
  changed: () => {},
  loading: false,
  error: null,
  retry: () => {},
});
export const useTrainingBlocks = () => useContext(TrainingBlocksContext);
