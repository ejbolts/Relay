import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLOUR_THEMES } from '../../../frontend/src/appearanceChoices';
import { AccountHeaderActions } from './AccountHeaderActions';
import { Button, IconButton } from './components';
import { Segmented, Slider, snapToStep } from './controls';
import { SheetFrame } from './navigation';
import { palettes, themedPalette } from './theme';
import { ToastHost, showToast, toastAnnouncement } from './Toast';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const wrap = async (ui: React.ReactElement) =>
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {ui}
    </SafeAreaProvider>,
  );

const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
});

// WCAG contrast between two #rrggbb colours.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

it('keeps small muted text at 4.5:1 on every light surface and accent', () => {
  for (const { id } of COLOUR_THEMES) {
    for (const style of ['default', 'stained'] as const) {
      const colors = themedPalette('light', id, 'default', style);
      for (const surface of [colors.page, colors.surface, colors.surface2]) {
        expect(contrast(colors.muted, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

it('adds the web semantic tokens, following each style', () => {
  expect(palettes.light.rpe['10']).toBe('#b32336');
  expect(palettes.dark.rpe.low).toBe('#8ed4a1');
  expect(themedPalette('dark', 'blue', 'oled', 'default').dangerSoft).toBe(
    'rgba(244,122,122,0.10)',
  );
  expect(themedPalette('light', 'plum', 'default', 'stained').surfaceRaised).not.toBe('#ffffff');
});

describe('Segmented on Android', () => {
  it('names each choice for screen readers and reports the chosen one', async () => {
    Platform.OS = 'android';
    const onChange = jest.fn();
    await wrap(
      <Segmented
        accessibilityLabel="Chart"
        values={['Weight', 'Body fat']}
        selectedIndex={0}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Weight' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Body fat' }));
    expect(onChange).toHaveBeenCalledWith(1);
    // Choosing the current one again changes nothing.
    await fireEvent.press(screen.getByRole('radio', { name: 'Weight' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Slider', () => {
  it('snaps to steps counted from its minimum', () => {
    expect(snapToStep(15, 5, 25, 10)).toBe(15);
    expect(snapToStep(19, 5, 25, 10)).toBe(15);
    expect(snapToStep(30, 5, 25, 10)).toBe(25);
    expect(snapToStep(0.3, 0, 1, 0.1)).toBe(0.3);
  });

  it('steps from its minimum for screen readers', async () => {
    const onChange = jest.fn();
    await wrap(
      <Slider
        accessibilityLabel="Factor"
        value={5}
        min={5}
        max={25}
        step={10}
        onChange={onChange}
      />,
    );
    await fireEvent(screen.getByLabelText('Factor'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenCalledWith(15);
  });
});

it('draws small buttons and icon buttons inside a 44 pt touch area', async () => {
  await wrap(
    <>
      <Button label="Retry" size="small" onPress={jest.fn()} />
      <IconButton icon="bell" badge="3" accessibilityLabel="Notifications" onPress={jest.fn()} />
    </>,
  );
  expect(
    StyleSheet.flatten(screen.getByRole('button', { name: 'Retry' }).props.style),
  ).toMatchObject({ minHeight: 44 });
  expect(
    StyleSheet.flatten(screen.getByRole('button', { name: 'Notifications' }).props.style),
  ).toMatchObject({ width: 44, height: 44 });
  expect(screen.getByText('3')).toBeTruthy();
});

it('starts link labels at the leading edge unless told to centre', async () => {
  await wrap(
    <>
      <Button label="Edit zones" variant="link" onPress={jest.fn()} />
      <Button label="Show all" variant="link" align="center" onPress={jest.fn()} />
    </>,
  );
  const style = (name: string) =>
    StyleSheet.flatten(screen.getByRole('button', { name }).props.style);
  expect(style('Edit zones').justifyContent).toBe('flex-start');
  expect(style('Show all').justifyContent).toBe('center');
});

describe('SheetFrame on iOS', () => {
  it('sizes to its content for fitToContents and fills for fraction detents', async () => {
    Platform.OS = 'ios';
    const { rerender } = await wrap(
      <SheetFrame>
        <Text>Share</Text>
      </SheetFrame>,
    );
    const root = () => StyleSheet.flatten(screen.getByText('Share').parent?.props.style);
    expect(root()?.flex).toBeUndefined();
    await rerender(
      <SafeAreaProvider>
        <SheetFrame detents={[0.5, 1]}>
          <Text>Share</Text>
        </SheetFrame>
      </SafeAreaProvider>,
    );
    expect(root()?.flex).toBe(1);
  });
});

it('shows the account buttons with the profile badge and opens Settings', async () => {
  const onSettings = jest.fn();
  const onProfile = jest.fn();
  await wrap(
    <AccountHeaderActions
      onSettings={onSettings}
      profile={{
        user: { display_name: 'Sam', username: 'sam', profile_photo_url: null },
        onPress: onProfile,
        waiting: { friendRequests: 2 },
      }}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Profile: Sam, 2 friend requests' }));
  expect(onProfile).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(onSettings).toHaveBeenCalled();
});

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const undo = { label: 'Undo', run: jest.fn() };

  it('announces the action and keeps an action toast long enough to reach it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await wrap(<ToastHost />);
    await act(async () => showToast('Goal removed', undo));
    expect(announce).toHaveBeenCalledWith('Goal removed. Undo available.');
    expect(toastAnnouncement('Saved')).toBe('Saved');
    await act(async () => jest.advanceTimersByTime(6000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(2500));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('waits while it is being touched', async () => {
    await wrap(<ToastHost />);
    await act(async () => showToast('Goal removed', undo));
    await fireEvent(screen.getByRole('button', { name: 'Undo' }), 'pressIn');
    await act(async () => jest.advanceTimersByTime(20000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await fireEvent(screen.getByRole('button', { name: 'Undo' }), 'pressOut');
    await act(async () => jest.advanceTimersByTime(8500));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('keeps an action toast until dismissed while a screen reader is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await wrap(<ToastHost />);
    await act(async () => showToast('Goal removed', undo));
    await act(async () => jest.advanceTimersByTime(60000));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Goal removed. Dismiss' }));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
