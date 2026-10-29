// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { defaultHomeLayout, toggleHomeSectionWidth, type HomeLayout } from './homeLayout';
import { useHomeLayout } from './useHomeLayout';
import { AppTabBar } from './AppTabBar';
import { HomeLayoutSections } from './HomeLayoutSections';
import { HOME_SECTIONS, type HomeSectionId } from './homeLayout';

vi.mock('./api', () => ({ api: { getHomeLayout: vi.fn(), saveHomeLayout: vi.fn() } }));
vi.mock('./userContext', () => {
  const session = { user: { id: 'sample-user' } };
  return { useUserSession: () => session };
});

let root: Root;
let container: HTMLDivElement;
let home: ReturnType<typeof useHomeLayout>;
const saved: HomeLayout = {
  ...defaultHomeLayout(),
  widths: { 'combined-check-in': 'compact', workouts: 'full' },
  settings: { zone2: { zone: 4, style: 'ring' } },
};

function Harness({ active }: { active: boolean }) {
  home = useHomeLayout(active);
  return <p>{home.editing ? 'Editing Home' : 'Viewing Home'}</p>;
}

function EditorHarness() {
  home = useHomeLayout();
  return (
    <>
      <button
        ref={home.editButton}
        onClick={home.toggleEditing}
        disabled={home.saving || home.dragging}
      >
        Edit Home layout
      </button>
      <HomeLayoutSections
        layout={home.editing ? home.draft : home.layout}
        sections={
          Object.fromEntries(HOME_SECTIONS.map(({ id }) => [id, <p key={id}>{id}</p>])) as Record<
            HomeSectionId,
            React.ReactNode
          >
        }
        edit={
          home.editing
            ? { onChange: home.change, saving: home.saving, onDraggingChange: home.setDragging }
            : undefined
        }
      />
      <AppTabBar
        active="dashboard"
        workoutStartedAt={null}
        onSelect={vi.fn()}
        onStart={vi.fn()}
        homeLayout={home}
      />
    </>
  );
}

async function click(label: string) {
  await act(async () =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click(),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.mocked(api.getHomeLayout).mockResolvedValue(saved);
  vi.mocked(api.saveHomeLayout).mockImplementation(async (layout) => layout);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('account Home layout drafts', () => {
  it('discards unsaved width edits when leaving the cached Today tab', async () => {
    await act(async () => root.render(<Harness active />));
    await act(async () => home.edit());
    expect(home.draft.widths).toEqual(saved.widths);
    expect(home.draft.widths).not.toBe(saved.widths);
    await act(async () => home.change(toggleHomeSectionWidth(home.draft, 'combined-check-in', 3)));
    expect(home.draft.widths?.['combined-check-in']).toBe('full');

    await act(async () => root.render(<Harness active={false} />));
    await act(async () => root.render(<Harness active />));
    expect(container.textContent).toBe('Viewing Home');
    expect(home.layout).toEqual(saved);
    expect(api.saveHomeLayout).not.toHaveBeenCalled();
    await act(async () => home.edit());
    expect(home.draft.widths).toEqual(saved.widths);
  });

  it('saves widths with order and visibility and cancel keeps the saved sizes', async () => {
    await act(async () => root.render(<Harness active />));
    await act(async () => home.edit());
    await act(async () => home.change(toggleHomeSectionWidth(home.draft, 'records', 6)));
    await act(async () => home.save());
    expect(api.saveHomeLayout).toHaveBeenCalledWith({
      ...saved,
      widths: { ...saved.widths, records: 'compact' },
    });
    expect(home.editing).toBe(false);
    await act(async () => home.edit());
    await act(async () => home.change(defaultHomeLayout()));
    await act(async () => home.cancel());
    await act(async () => home.edit());
    expect(home.draft.widths).toEqual({ ...saved.widths, records: 'compact' });
  });

  it('uses the bottom controls to save, reset as a draft, and cancel without losing the saved layout', async () => {
    await act(async () => root.render(<EditorHarness />));
    await act(async () => home.editButton.current!.click());
    expect(container.querySelector('.app-tab-navigation')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.app-tab-layout')?.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.home-layout-toolbar')).toBeNull();
    await click('Hide Workouts');
    await click('Save layout');
    expect(api.saveHomeLayout).toHaveBeenCalledWith({
      ...saved,
      hidden: [...saved.hidden, 'workouts'],
    });
    expect(home.editing).toBe(false);
    expect(document.activeElement).toBe(home.editButton.current);

    await act(async () => home.editButton.current!.click());
    await click('Reset layout');
    expect(home.draft).toEqual(defaultHomeLayout());
    expect(home.editing).toBe(true);
    expect(api.saveHomeLayout).toHaveBeenCalledTimes(1);
    await click('Cancel layout changes');
    expect(home.layout.hidden).toEqual([...saved.hidden, 'workouts']);
    expect(container.querySelector('.app-tab-navigation')?.hasAttribute('inert')).toBe(false);

    await act(async () => home.editButton.current!.click());
    await click('Reset layout');
    await click('Save layout');
    expect(api.saveHomeLayout).toHaveBeenLastCalledWith(defaultHomeLayout());
    expect(home.layout).toEqual(defaultHomeLayout());
  });

  it('saves editing from the Today pencil instead of cancelling the draft', async () => {
    await act(async () => root.render(<EditorHarness />));
    await act(async () => home.editButton.current!.click());
    expect(home.editing).toBe(true);
    await click('Hide Workouts');
    await act(async () => home.editButton.current!.click());
    expect(home.editing).toBe(false);
    expect(home.message).toBe('Home layout saved.');
    expect(home.layout).toEqual({ ...saved, hidden: [...saved.hidden, 'workouts'] });
    expect(api.saveHomeLayout).toHaveBeenCalledWith({
      ...saved,
      hidden: [...saved.hidden, 'workouts'],
    });
    expect(container.querySelector('.app-tab-navigation')?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(home.editButton.current);
  });

  it('locks the bottom controls while saving and retains the draft and retry action after failure', async () => {
    let rejectSave!: (reason: Error) => void;
    vi.mocked(api.saveHomeLayout).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }),
    );
    await act(async () => root.render(<EditorHarness />));
    await act(async () => home.editButton.current!.click());
    await click('Hide Workouts');
    await act(async () => home.editButton.current!.click());
    expect(home.editButton.current!.disabled).toBe(true);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('.app-tab-layout button')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    await act(async () => rejectSave(new Error('offline')));
    expect(home.editing).toBe(true);
    expect(home.draft.hidden).toEqual([...saved.hidden, 'workouts']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Use the pencil or green tick to try again',
    );
    await act(async () => home.editButton.current!.click());
    expect(home.editing).toBe(false);
    expect(home.layout.hidden).toEqual([...saved.hidden, 'workouts']);
  });
});
