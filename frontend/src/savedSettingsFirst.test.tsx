// @vitest-environment jsdom
import { act, useContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import type { HomeLayout } from './homeLayout';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import { useTrainingBlocks } from './trainingBlocksContext';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import { TrainingPreferencesProvider } from './TrainingPreferencesProvider';
import type { TrainingBlocks, TrainingPreferences, User, WorkoutType } from './types';
import { useHomeLayout } from './useHomeLayout';
import { UserContext, type UserSession } from './userContext';
import { DEFAULT_WORKOUT_TYPES } from './workoutTypes';
import { WorkoutTypesContext } from './workoutTypesContext';
import { WorkoutTypesProvider } from './WorkoutTypesProvider';

/** A read the test answers by hand, to hold the server or the device back. */
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (answer = resolve));
  return { promise, answer };
}

const blocks = (name: string) =>
  ({ blocks: [{ id: name, name, start_date: '2026-10-01' }] }) as unknown as TrainingBlocks;
const preferences = (unit: 'kg' | 'lb') =>
  ({ preferred_weight_unit: unit, week_start: 'monday' }) as unknown as TrainingPreferences;
const types = (name: string) => [{ ...DEFAULT_WORKOUT_TYPES[0], name }] as WorkoutType[];
const layout = (hidden: string[]) =>
  ({ order: [], hidden, widths: {}, settings: {} }) as unknown as HomeLayout;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function show(children: ReactNode) {
  await act(async () => root.render(children));
}

describe('training blocks', () => {
  function Shown() {
    const { config, loading } = useTrainingBlocks();
    return (
      <p>{`${config.blocks.map((block) => block.name).join()} ${loading ? 'loading' : 'loaded'}`}</p>
    );
  }

  it('show this device’s copy at once, then the server’s answer', async () => {
    const server = held<TrainingBlocks>();
    vi.spyOn(api.trainingBlocks, 'get').mockReturnValue(server.promise);
    vi.spyOn(api.saved, 'trainingBlocks').mockResolvedValue(blocks('Saved block'));
    await show(
      <TrainingBlocksProvider>
        <Shown />
      </TrainingBlocksProvider>,
    );
    // The card is there from the start, but nothing treats the blocks as final yet.
    expect(container.textContent).toBe('Saved block loading');

    await act(async () => server.answer(blocks('Server block')));
    expect(container.textContent).toBe('Server block loaded');
  });

  it('never replace the server’s answer with a copy read afterwards', async () => {
    const copy = held<TrainingBlocks | null>();
    vi.spyOn(api.trainingBlocks, 'get').mockResolvedValue(blocks('Server block'));
    vi.spyOn(api.saved, 'trainingBlocks').mockReturnValue(copy.promise);
    await show(
      <TrainingBlocksProvider>
        <Shown />
      </TrainingBlocksProvider>,
    );
    await act(async () => copy.answer(blocks('Saved block')));
    expect(container.textContent).toBe('Server block loaded');
  });
});

describe('training preferences', () => {
  function Shown() {
    return (
      <p>{useContext(TrainingPreferencesContext).preferences?.preferred_weight_unit ?? 'none'}</p>
    );
  }

  it('show this device’s copy at once, then the server’s answer, never the reverse', async () => {
    const server = held<TrainingPreferences>();
    const copy = held<TrainingPreferences | null>();
    vi.spyOn(api, 'getTrainingPreferences').mockReturnValue(server.promise);
    vi.spyOn(api.saved, 'trainingPreferences').mockResolvedValueOnce(preferences('lb'));
    await show(
      <TrainingPreferencesProvider>
        <Shown />
      </TrainingPreferencesProvider>,
    );
    expect(container.textContent).toBe('lb');
    await act(async () => server.answer(preferences('kg')));
    expect(container.textContent).toBe('kg');

    await act(async () => root.unmount());
    root = createRoot(container);
    vi.mocked(api.getTrainingPreferences).mockResolvedValue(preferences('kg'));
    vi.mocked(api.saved.trainingPreferences).mockReturnValue(copy.promise);
    await show(
      <TrainingPreferencesProvider>
        <Shown />
      </TrainingPreferencesProvider>,
    );
    await act(async () => copy.answer(preferences('lb')));
    expect(container.textContent).toBe('kg');
  });
});

describe('workout types', () => {
  function Shown() {
    const { types: shown, loading } = useContext(WorkoutTypesContext);
    return <p>{`${shown[0]?.name} ${loading ? 'loading' : 'loaded'}`}</p>;
  }

  it('show this device’s copy at once, and stay loading until the server answers', async () => {
    const server = held<WorkoutType[]>();
    vi.spyOn(api, 'getWorkoutTypes').mockReturnValue(server.promise);
    vi.spyOn(api, 'getWorkoutTypeExercises').mockResolvedValue([]);
    vi.spyOn(api.saved, 'workoutTypes').mockResolvedValue(types('Saved type'));
    vi.spyOn(api.saved, 'workoutTypeExercises').mockResolvedValue(null);
    await show(
      <WorkoutTypesProvider>
        <Shown />
      </WorkoutTypesProvider>,
    );
    // A save waits while the types are loading, so it never goes out with an older list.
    expect(container.textContent).toBe('Saved type loading');

    await act(async () => server.answer(types('Server type')));
    expect(container.textContent).toBe('Server type loaded');
  });
});

describe('the Home layout', () => {
  const user = { id: 'sample', username: 'sample', display_name: 'Sample Lifter' } as User;
  const session = (account: User): UserSession => ({
    user: account,
    updateUser: vi.fn(),
    signOut: vi.fn(),
    accountDeleted: vi.fn(),
  });

  function Shown() {
    const home = useHomeLayout(true);
    return <p>{`${home.layout.hidden.join()} ${home.loaded ? 'loaded' : 'loading'}`}</p>;
  }

  it('shows this device’s copy at once, and cannot be edited until the server answers', async () => {
    const server = held<HomeLayout>();
    vi.spyOn(api, 'getHomeLayout').mockReturnValue(server.promise);
    vi.spyOn(api.saved, 'homeLayout').mockResolvedValue(layout(['consistency']));
    await show(
      <UserContext.Provider value={session(user)}>
        <Shown />
      </UserContext.Provider>,
    );
    // An older layout must never be saved over a newer one, so editing waits.
    expect(container.textContent).toBe('consistency loading');

    await act(async () => server.answer(layout(['records'])));
    expect(container.textContent).toBe('records loaded');
  });

  it('is not read again when the server only confirms the account that was already open', async () => {
    vi.spyOn(api, 'getHomeLayout').mockResolvedValue(layout(['records']));
    vi.spyOn(api.saved, 'homeLayout').mockResolvedValue(null);
    await show(
      <UserContext.Provider value={session(user)}>
        <Shown />
      </UserContext.Provider>,
    );
    // The same account, described by a new object once the session check has answered.
    await show(
      <UserContext.Provider value={session({ ...user })}>
        <Shown />
      </UserContext.Provider>,
    );
    expect(api.getHomeLayout).toHaveBeenCalledOnce();
    expect(container.textContent).toBe('records loaded');
  });
});
