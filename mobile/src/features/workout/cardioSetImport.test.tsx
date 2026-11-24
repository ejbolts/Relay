import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { showMenu } from '../../ui/prompts';
import { scanCardioPhoto } from '../cardio/cardioData';
import { CardioSetImport } from './CardioSetImport';

const mockCreate = jest.fn();
const mockWrite = jest.fn(async () => undefined);
const mockDelete = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///run.png', fileName: 'run.png', mimeType: 'image/png' }],
  })),
}));
jest.mock('expo-clipboard', () => ({
  hasImageAsync: jest.fn(async () => false),
  getImageAsync: jest.fn(async () => null),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((...parts: unknown[]) => ({
    uri: parts.map(String).join('/'),
    create: mockCreate,
    write: mockWrite,
    delete: mockDelete,
  })),
  Paths: { cache: 'file:///cache' },
}));
jest.mock('../../data/deviceStorage', () => ({ newId: () => 'paste-1' }));
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(false);
  jest.mocked(Clipboard.getImageAsync).mockResolvedValue(null);
});

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
  expect(options.map((item) => item.label)).toEqual(['Choose screenshot', 'Take photo']);
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

test('offers Paste screenshot only when the clipboard has an image, scans it, and cleans up', async () => {
  jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(true);
  jest.mocked(Clipboard.getImageAsync).mockResolvedValue({
    data: 'data:image/png;base64,aW1hZ2U=',
    size: { width: 540, height: 960 },
  });
  jest
    .mocked(scanCardioPhoto)
    .mockResolvedValue(scan as unknown as Awaited<ReturnType<typeof scanCardioPhoto>>);
  const onScanned = jest.fn();
  await render(<CardioSetImport number={1} done={false} onScanned={onScanned} />);
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Import screenshot for set 1' })),
  );
  const [, options] = jest.mocked(showMenu).mock.calls[0];
  expect(options.map((item) => item.label)).toEqual([
    'Choose screenshot',
    'Take photo',
    'Paste screenshot',
  ]);
  await act(async () => options.find((item) => item.label === 'Paste screenshot')!.onPress());
  expect(Clipboard.getImageAsync).toHaveBeenCalledWith({ format: 'png' });
  expect(mockWrite).toHaveBeenCalledWith('aW1hZ2U=', { encoding: 'base64' });
  expect(scanCardioPhoto).toHaveBeenCalledWith(
    expect.objectContaining({
      uri: 'file:///cache/relay-cardio-paste-paste-1.png',
      fileName: 'screenshot.png',
      mimeType: 'image/png',
    }),
  );
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(onScanned).toHaveBeenCalledWith({
    duration_seconds: 1800,
    distance_km: 5.2,
    calories_kcal: 320,
    average_heart_rate_bpm: 150,
  });
  expect(screen.getByText('Check the distance.')).toBeVisible();
});

test('explains an empty or denied clipboard paste without scanning', async () => {
  jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(true);
  jest.mocked(Clipboard.getImageAsync).mockResolvedValue(null);
  const onScanned = jest.fn();
  await render(<CardioSetImport number={1} done={false} onScanned={onScanned} />);
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Import screenshot for set 1' })),
  );
  const [, options] = jest.mocked(showMenu).mock.calls[0];
  await act(async () => options.find((item) => item.label === 'Paste screenshot')!.onPress());
  expect(await screen.findByText(/Copy a screenshot first/)).toBeVisible();
  expect(scanCardioPhoto).not.toHaveBeenCalled();
  expect(onScanned).not.toHaveBeenCalled();
});

test('recovers when reading the clipboard throws', async () => {
  jest.mocked(Clipboard.hasImageAsync).mockResolvedValue(true);
  jest.mocked(Clipboard.getImageAsync).mockRejectedValueOnce(new Error('Denied'));
  await render(<CardioSetImport number={1} done={false} onScanned={jest.fn()} />);
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Import screenshot for set 1' })),
  );
  const [, options] = jest.mocked(showMenu).mock.calls[0];
  await act(async () => options.find((item) => item.label === 'Paste screenshot')!.onPress());
  expect(await screen.findByText(/Could not read the clipboard/)).toBeVisible();
  expect(scanCardioPhoto).not.toHaveBeenCalled();
});
