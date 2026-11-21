// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast, TOAST_MS, ToastProvider } from './Toast';
import { toastButton, toastElement } from './toastTestUtils';
import { useDeferredDelete } from './useDeferredDelete';

let root: Root;
let container: HTMLDivElement;
let deletion: ReturnType<typeof useDeferredDelete<string>>;
const commit = vi.fn();

/** The hook with its Undo toast, as App shows "Workout deleted". */
function Probe() {
  deletion = useDeferredDelete<string>(commit);
  return (
    <>
      <output>{deletion.pending ?? 'none'}</output>
      {deletion.pending && (
        <Toast
          id={deletion.pending}
          message="Workout deleted"
          action={{ label: 'Undo', run: deletion.undo }}
          onDismiss={deletion.flush}
          onTimeout={deletion.flush}
        />
      )}
    </>
  );
}

const advance = async (ms: number) => act(async () => vi.advanceTimersByTime(ms));
const press = (target: EventTarget, type: string) =>
  target.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true }), { pointerType: 'touch', pointerId: 1 }),
  );

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  commit.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a deletion that can be undone', () => {
  it('goes through when its toast runs out, not before', async () => {
    await act(async () => deletion.request('workout-1'));
    expect(container.querySelector('output')?.textContent).toBe('workout-1');
    await advance(TOAST_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    await advance(1);
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
    expect(container.querySelector('output')?.textContent).toBe('none');
    expect(toastElement()).toBeNull();
  });

  it('waits while its toast is held, then carries on from where it was', async () => {
    await act(async () => deletion.request('workout-1'));
    await advance(TOAST_MS - 1000);
    await act(async () => press(toastElement()!, 'pointerdown'));
    await advance(10_000);
    expect(commit).not.toHaveBeenCalled();
    await act(async () => press(document.body, 'pointerup'));
    await advance(999);
    expect(commit).not.toHaveBeenCalled();
    await advance(1);
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
  });

  it('never deletes once undone', async () => {
    await act(async () => deletion.request('workout-1'));
    await act(async () => toastButton('Undo')!.click());
    await advance(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(container.querySelector('output')?.textContent).toBe('none');
    expect(toastElement()).toBeNull();
  });

  it('puts an earlier deletion through when another starts, or when dismissed', async () => {
    await act(async () => deletion.request('workout-1'));
    await act(async () => deletion.request('workout-2'));
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
    expect(container.querySelector('output')?.textContent).toBe('workout-2');
    await act(async () => toastButton('Dismiss notification')!.click());
    expect(commit).toHaveBeenLastCalledWith('workout-2');
    await advance(10_000);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('goes through when a newer toast replaces its toast', async () => {
    await act(async () => deletion.request('workout-1'));
    await act(async () =>
      root.render(
        <ToastProvider>
          <Probe />
          <Toast message="Workout saved" onDismiss={vi.fn()} />
        </ToastProvider>,
      ),
    );
    expect(commit).toHaveBeenCalledExactlyOnceWith('workout-1');
    expect(toastElement()?.textContent).toContain('Workout saved');
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
