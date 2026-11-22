import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TrainingScreen } from './TrainingScreen';

test('opens the selected exercise history and closes it on a second tap', async () => {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <TrainingScreen />
    </SafeAreaProvider>,
  );
  const bench = screen.getByRole('button', { name: /Dumbbell bench press/ });
  const row = screen.getByRole('button', { name: /Seated row/ });
  await fireEvent.press(bench);
  expect(screen.getByText('22 kg × 9 reps')).toBeVisible();
  await fireEvent.press(row);
  expect(screen.queryByText('22 kg × 9 reps')).toBeNull();
  expect(screen.getByText('45 kg × 11 reps')).toBeVisible();
  await fireEvent.press(row);
  expect(screen.queryByText('Previous set')).toBeNull();
});
