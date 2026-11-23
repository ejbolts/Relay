import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { showMenu } from '../../ui/prompts';
import { scanCardioPhoto } from '../cardio/cardioData';
import { CardioSetImport } from './CardioSetImport';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///run.png', fileName: 'run.png', mimeType: 'image/png' }],
  })),
}));
jest.mock('../cardio/cardioData', () => ({ scanCardioPhoto: jest.fn() }));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));

const scan = {
  exercise_name: 'Run',
  session_date: null,
  duration_minutes: 30,
  distance_km: 5.2,
  average_speed_kph: null,
  calories_kcal: 320,
  average_heart_rate_bpm: 150,
  warning: 'Check the distance.',
};

test('a scanned screenshot fills the set, and its warning stays once the set is logged', async () => {
  jest
    .mocked(scanCardioPhoto)
    .mockResolvedValue(scan as unknown as Awaited<ReturnType<typeof scanCardioPhoto>>);
  const onScanned = jest.fn();
  const view = await render(<CardioSetImport number={1} done={false} onScanned={onScanned} />);
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Import screenshot for set 1' })),
  );
  const [, options] = jest.mocked(showMenu).mock.calls[0];
  await act(async () => options.find((item) => item.label === 'Choose screenshot')!.onPress());
  expect(scanCardioPhoto).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///run.png' }));
  expect(onScanned).toHaveBeenCalledWith({
    duration_seconds: 1800,
    distance_km: 5.2,
    calories_kcal: 320,
    average_heart_rate_bpm: 150,
  });
  await view.rerender(<CardioSetImport number={1} done onScanned={onScanned} />);
  expect(screen.queryByRole('button', { name: 'Import screenshot for set 1' })).toBeNull();
  expect(screen.getByText('Check the distance.')).toBeVisible();
});

test('a failed scan says why', async () => {
  jest.mocked(scanCardioPhoto).mockRejectedValue(new Error('Could not scan that screenshot.'));
  await render(<CardioSetImport number={2} done={false} onScanned={jest.fn()} />);
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Import screenshot for set 2' })),
  );
  const [, options] = jest.mocked(showMenu).mock.calls.at(-1)!;
  await act(async () => options.find((item) => item.label === 'Choose screenshot')!.onPress());
  expect(await screen.findByText('Could not scan that screenshot.')).toBeVisible();
});
