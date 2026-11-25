import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { relayLiveActivity } from '..';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
  jest.mocked(requireOptionalNativeModule).mockReset();
});

test('on iOS it returns the native module when the build has one', () => {
  Platform.OS = 'ios';
  const native = { show: jest.fn(), end: jest.fn(), isSupported: jest.fn() };
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  expect(relayLiveActivity()).toBe(native);
  expect(requireOptionalNativeModule).toHaveBeenCalledWith('RelayLiveActivity');
});

test('Expo Go, which has no such module, gets null', () => {
  Platform.OS = 'ios';
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  expect(relayLiveActivity()).toBeNull();
  jest.mocked(requireOptionalNativeModule).mockImplementation(() => {
    throw new Error('Cannot find native module');
  });
  expect(relayLiveActivity()).toBeNull();
});

test('Android never looks for it', () => {
  Platform.OS = 'android';
  expect(relayLiveActivity()).toBeNull();
  expect(requireOptionalNativeModule).not.toHaveBeenCalled();
});
