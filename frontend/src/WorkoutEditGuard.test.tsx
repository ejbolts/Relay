// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiscardChangesGuard, type LeaveGuard } from './WorkoutEditGuard';

let root: Root;
let container: HTMLDivElement;
const guard = createRef<LeaveGuard | null>() as { current: LeaveGuard | null };
const onDiscard = vi.fn();

function Editor({ unsaved }: { unsaved: boolean }) {
  return <>{useDiscardChangesGuard({ guard, unsaved, onDiscard })}</>;
}

const dialog = () => document.querySelector<HTMLDialogElement>('dialog.discard-changes-dialog');
const button = (label: string) =>
  [...dialog()!.querySelectorAll('button')].find((item) => item.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  onDiscard.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('leaving an editor with unsaved changes', () => {
  it('lets Back through when nothing changed', async () => {
    await act(async () => root.render(<Editor unsaved={false} />));
    let kept = true;
    await act(async () => {
      kept = guard.current!();
    });
    expect(kept).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('asks first; Keep editing stays and Discard leaves without asking again', async () => {
    await act(async () => root.render(<Editor unsaved />));
    let kept = false;
    await act(async () => {
      kept = guard.current!();
    });
    expect(kept).toBe(true);
    expect(dialog()?.textContent).toContain('Discard changes?');
    await act(async () => button('Keep editing').click());
    expect(dialog()).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();

    await act(async () => {
      guard.current!();
    });
    await act(async () => button('Discard').click());
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
    expect(guard.current!()).toBe(false);
  });

  it('stops guarding once the editor closes', async () => {
    await act(async () => root.render(<Editor unsaved />));
    await act(async () => root.render(<></>));
    expect(guard.current).toBeNull();
  });
});
