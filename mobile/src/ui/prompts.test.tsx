import { act, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { PromptHost, promptShowing, showMenu } from './prompts';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

test('a menu stays counted while another prompt host comes and goes', async () => {
  const shared = await render(<PromptHost />);
  expect(promptShowing()).toBe(false);
  await act(async () => showMenu('Set 1', [{ label: 'Move up', onPress: () => undefined }]));
  expect(promptShowing()).toBe(true);
  // A screen with its own host opens and closes over it (the newest host takes new menus).
  const other = await render(<PromptHost />);
  expect(promptShowing()).toBe(true);
  await other.unmount();
  expect(promptShowing()).toBe(true);
  await shared.unmount();
  expect(promptShowing()).toBe(false);
});
