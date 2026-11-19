// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeferredDelete } from './useDeferredDelete';

let root: Root;
let container: HTMLDivElement;
let deletion: ReturnType<typeof useDeferredDelete<string>>;
const commit = vi.fn();

function Probe() {
  deletion = useDeferredDelete<string>(commit, 6000);
  return <output>{deletion.pending ?? 'none'}</output>;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  commit.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a deletion that can be undone', () => {
  it('waits for the Undo to pass before deleting', async () => {
    await act(async () => deletion.request('workout-1'));
    expect(container.textContent).toBe('workout-1');
    await act(async () => vi.advanceTimersByTime(5999));
    expect(commit).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
    expect(container.textContent).toBe('none');
  });

  it('never deletes once undone', async () => {
    await act(async () => deletion.request('workout-1'));
    await act(async () => deletion.undo());
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(commit).not.toHaveBeenCalled();
    expect(container.textContent).toBe('none');
  });

  it('puts an earlier deletion through when another starts, or when dismissed', async () => {
    await act(async () => deletion.request('workout-1'));
    await act(async () => deletion.request('workout-2'));
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
    expect(container.textContent).toBe('workout-2');
    await act(async () => deletion.flush());
    expect(commit).toHaveBeenLastCalledWith('workout-2');
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('deletes straight away when the app is hidden or closed', async () => {
    await act(async () => deletion.request('workout-1'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
    await act(async () => deletion.request('workout-2'));
    await act(async () => root.unmount());
    expect(commit).toHaveBeenLastCalledWith('workout-2');
    root = createRoot(container);
  });
});
