import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { localDate } from './utils';
import { blockOn } from './trainingBlocks';
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
