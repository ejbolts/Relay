import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { localDate } from './utils';
import { blockOn } from './trainingBlocks';
import { BLOCK_KINDS, kindColor } from './blockKinds';
import { TrainingBlocksContext } from './trainingBlocksContext';
import type { TrainingBlocks } from './types';

export function TrainingBlocksProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TrainingBlocks>({ blocks: [] });
  const [selection, select] = useState('current');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const retry = useCallback(() => {
    const request = ++generation.current;
    setLoading(true);
    void api.trainingBlocks
      .get()
      .then((next) => {
        if (request === generation.current) {
          setConfig(next);
          setError(null);
        }
      })
      .catch(() => {
        if (request === generation.current) setError('Could not load training blocks.');
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    retry();
    window.addEventListener('training-data-refreshed', retry);
    return () => {
      // A request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      window.removeEventListener('training-data-refreshed', retry);
    };
  }, [retry]);
  // Block type colours apply app-wide, including the landscape timeline outside this tree.
  const colors = config.kind_colors;
  useEffect(() => {
    const root = document.documentElement.style;
    for (const kind of BLOCK_KINDS) {
      if (colors?.[kind]) root.setProperty(`--block-color-${kind}`, kindColor(kind, colors));
      else root.removeProperty(`--block-color-${kind}`);
    }
    return () => BLOCK_KINDS.forEach((kind) => root.removeProperty(`--block-color-${kind}`));
  }, [colors]);
  const block =
    selection === 'current'
      ? blockOn(config.blocks, localDate())
      : (config.blocks.find((item) => item.id === selection) ?? null);
  return (
    <TrainingBlocksContext.Provider
      value={{
        config,
        block,
        select,
        loading,
        error,
        retry,
        changed: (next) => {
          ++generation.current;
          setConfig(next);
          setError(null);
          setLoading(false);
          window.dispatchEvent(new Event('training-blocks-updated'));
        },
      }}
    >
      {children}
    </TrainingBlocksContext.Provider>
  );
}
