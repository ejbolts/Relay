import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import {
  RUNNING,
  withElapsedSeconds,
  type WorkoutPause,
} from '../../../../frontend/src/workoutPause';
import { useElapsed } from './useElapsed';

function Clock({ startedAt }: { startedAt: number }) {
  const [pause, setPause] = useState<WorkoutPause>(RUNNING);
  const elapsed = useElapsed(startedAt, pause);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Correct"
        onPress={() => setPause((current) => withElapsedSeconds(current, startedAt, 45 * 60))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Same pause, new object"
        onPress={() => setPause((current) => ({ ...current }))}
      />
      <Text>{elapsed}</Text>
    </>
  );
}

afterEach(() => jest.useRealTimers());

test('a corrected clock shows at once, not at the next tick', async () => {
  jest.useFakeTimers({ now: 1_000_000 });
  await render(<Clock startedAt={1_000_000} />);
  await act(async () => jest.advanceTimersByTime(10_400));
  expect(screen.getByText('0:10')).toBeTruthy();
  await act(async () => jest.advanceTimersByTime(500));
  await fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
  await act(async () => jest.advanceTimersByTime(50));
  expect(screen.getByText('45:00')).toBeTruthy();
  // The same pause as a new object (a synced draft) keeps the fresh reading.
  await fireEvent.press(screen.getByRole('button', { name: 'Same pause, new object' }));
  await act(async () => jest.advanceTimersByTime(50));
  expect(screen.getByText('45:00')).toBeTruthy();
});
