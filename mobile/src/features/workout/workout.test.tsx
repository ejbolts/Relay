import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useUpNext } from '../../data/queries';
import { StartSheet } from './StartSheet';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../data/queries', () => ({ useUpNext: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useUpNext).mockReturnValue({
    template: { exercises: [] },
    label: 'Lower body',
  } as unknown as ReturnType<typeof useUpNext>);
});

function Controls() {
  const workout = useWorkout();
  return (
    <>
      <Text>{workout.live ? `Live: ${workout.live.name}` : 'No workout'}</Text>
      <Text onPress={workout.openStartMenu}>Start tab</Text>
      <Text onPress={() => workout.start({ kind: 'empty' })}>Start empty</Text>
      <Text onPress={workout.discard}>Discard</Text>
    </>
  );
}

test('the Start tab opens the Start menu, then the live workout once one is running', async () => {
  await render(
    <WorkoutProvider>
      <Controls />
    </WorkoutProvider>,
  );
  await fireEvent.press(screen.getByText('Start tab'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/start-workout');

  await fireEvent.press(screen.getByText('Start empty'));
  expect(screen.getByText('Live: Workout')).toBeVisible();
  expect(mockRouter.push).toHaveBeenLastCalledWith('/workout');

  await fireEvent.press(screen.getByText('Start tab'));
  expect(mockRouter.push).toHaveBeenLastCalledWith('/workout');

  await fireEvent.press(screen.getByText('Discard'));
  expect(screen.getByText('No workout')).toBeVisible();
});

test('starting again while a workout is live reopens it instead of replacing it', async () => {
  await render(
    <WorkoutProvider>
      <Controls />
    </WorkoutProvider>,
  );
  await fireEvent.press(screen.getByText('Start empty'));
  const firstName = screen.getByText('Live: Workout');
  await fireEvent.press(screen.getByText('Start empty'));
  expect(firstName).toBeVisible();
  expect(mockRouter.push).toHaveBeenCalledTimes(2);
});

test('the Start menu offers Cardio, Up next and Empty, and the logger replaces it', async () => {
  await render(
    <WorkoutProvider>
      <StartSheet />
      <Controls />
    </WorkoutProvider>,
  );
  expect(screen.getByRole('button', { name: 'Cardio' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Empty' })).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Up next: Lower body day' }));
  expect(screen.getByText('Live: Up next')).toBeVisible();
  expect(mockRouter.replace).toHaveBeenCalledWith('/workout');
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('the Start menu leaves out Up next when there is nothing to start', async () => {
  jest.mocked(useUpNext).mockReturnValue({
    template: null,
    label: 'Rest',
  } as unknown as ReturnType<typeof useUpNext>);
  await render(
    <WorkoutProvider>
      <StartSheet />
    </WorkoutProvider>,
  );
  expect(screen.queryByRole('button', { name: /Up next/ })).toBeNull();
  expect(screen.getAllByRole('button').map((item) => item.props.accessibilityLabel)).toEqual(
    expect.arrayContaining(['Cardio', 'Empty']),
  );
});
