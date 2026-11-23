import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { MachinePhotoUsage } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { promptText, showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { bench } from './testFixtures';
import { MachineSheet } from './MachineSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../../data/authorisedImage', () => ({ useAuthorisedImage: () => null }));
jest.mock('../../data/uploadFile', () => ({ uploadFile: jest.fn() }));
jest.mock('../social/PhotoViewer', () => ({
  PhotoViewer: ({ photos }: { photos: { label: string }[] }) => {
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <MockText>{photos.map((photo) => photo.label).join(' | ')}</MockText>;
  },
}));
jest.mock('../../ui/prompts', () => ({ promptText: jest.fn(), showMenu: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));

function machine(id: string, caption: string, images = 1): MachinePhotoUsage {
  const image = (n: number) => ({
    id: `${id}-${n}`,
    exercise_id: 'bench',
    caption,
    created_at: '',
    thumbnail_url: '',
    full_url: `/full/${id}-${n}`,
    width: 1,
    height: 1,
  });
  return {
    ...image(0),
    id,
    exercise_id: 'bench',
    caption,
    created_at: '',
    images: Array.from({ length: images }, (_, n) => image(n)),
    exercise_name: 'Bench Press',
    workout_count: 1,
    last_used_date: null,
  };
}

const option = (options: MenuOption[], label: string) => options.find((o) => o.label === label)!;

let client: QueryClient;
afterEach(() => client?.clear());

async function openSheet(
  pinned: string[] = ['cybex'],
  onMerged?: (mergedId: string, awayIds: string[]) => void,
) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const onChoose = jest.fn();
  await render(
    <QueryClientProvider client={client}>
      <MachineSheet
        target={{ movementKey: 'm1', exercise: bench, machinePhotoIds: pinned }}
        onChoose={onChoose}
        onSettings={jest.fn()}
        onMerged={onMerged}
        onClose={jest.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('checkbox', { name: 'Cybex' })).toBeVisible();
  return onChoose;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(apiGet)
    .mockResolvedValue([machine('cybex', 'Cybex', 2), machine('hammer', 'Hammer')]);
});

test('a machine can be renamed and enlarged', async () => {
  jest.mocked(apiSend).mockResolvedValue(machine('cybex', 'Cybex chest press', 2));
  await openSheet();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Actions for Cybex' })));
  const [, actions] = jest.mocked(showMenu).mock.calls[0];
  await act(async () => option(actions, 'Rename').onPress());
  await act(async () => jest.mocked(promptText).mock.calls[0][0].onSubmit('Cybex chest press'));
  expect(apiSend).toHaveBeenCalledWith('/api/machine-photos/cybex', 'PATCH', {
    caption: 'Cybex chest press',
  });
  expect(await screen.findByRole('checkbox', { name: 'Cybex chest press' })).toBeVisible();
  expect(showToast).toHaveBeenCalledWith('Machine name saved');

  await act(async () =>
    fireEvent.press(screen.getByRole('imagebutton', { name: 'Enlarge Cybex chest press' })),
  );
  expect(
    screen.getByText('Cybex chest press, photo 1 of 2 | Cybex chest press, photo 2 of 2'),
  ).toBeVisible();
});

test('deleting a pinned machine asks first, then unpins it', async () => {
  jest.mocked(apiSend).mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert');
  const onChoose = await openSheet();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Actions for Cybex' })));
  await act(async () => option(jest.mocked(showMenu).mock.calls[0][1], 'Delete machine').onPress());
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons.find((button) => button.text === 'Delete machine')!.onPress!());
  expect(apiSend).toHaveBeenCalledWith(
    '/api/machine-photos/cybex?detach_from_workouts=true',
    'DELETE',
  );
  expect(onChoose).toHaveBeenCalledWith([], [expect.objectContaining({ id: 'hammer' })]);
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Cybex' })).toBeNull());
});

test('duplicates merge into one machine, and its pin moves to it', async () => {
  jest.mocked(apiSend).mockResolvedValue(machine('hammer', 'Hammer press', 3));
  const onChoose = await openSheet(['cybex']);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Merge duplicates' })));
  expect(screen.getByRole('button', { name: 'Select 2 or more to merge' })).toBeDisabled();
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Hammer' })));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Cybex' })));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Merge 2' })));
  expect(screen.getByLabelText('Machine name').props.value).toBe('Hammer');
  await act(async () =>
    fireEvent.changeText(screen.getByLabelText('Machine name'), 'Hammer press'),
  );
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Merge into 1 machine · 3 photos' })),
  );
  expect(apiSend).toHaveBeenCalledWith('/api/exercises/bench/machine-photos/merge', 'POST', {
    photo_ids: ['hammer', 'cybex'],
    keep_photo_id: 'hammer',
    caption: 'Hammer press',
  });
  expect(onChoose).toHaveBeenCalledWith(['hammer'], [expect.objectContaining({ id: 'hammer' })]);
  expect(showToast).toHaveBeenCalledWith('Machines merged');
  expect(await screen.findByRole('checkbox', { name: 'Hammer press' })).toBeVisible();
});

test('in the logger, a merge hands over every merged-away id instead of re-pinning', async () => {
  jest.mocked(apiSend).mockResolvedValue(machine('hammer', 'Hammer', 3));
  const onMerged = jest.fn();
  const onChoose = await openSheet(['cybex'], onMerged);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Merge duplicates' })));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Hammer' })));
  await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: 'Cybex' })));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Merge 2' })));
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Merge into 1 machine · 3 photos' })),
  );
  expect(onMerged).toHaveBeenCalledWith(
    'hammer',
    ['cybex', 'cybex-0', 'cybex-1', 'hammer', 'hammer-0'],
    expect.any(Array),
  );
  expect(onChoose).not.toHaveBeenCalled();
});
