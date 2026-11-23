import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLOUR_THEMES } from '../../../frontend/src/appearanceChoices';
import { AccountHeaderActions } from './AccountHeaderActions';
import { Button, IconButton, splitStyle } from './components';
import { Segmented, Slider, sliderValues, snapToStep, stepSlider } from './controls';
import { DateField, TimeField } from './DateField';
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
// Material's dialogs need the native module; here they only need to be found in the tree.
// Material's dialogs and slider need the native module. These stand-ins confirm a dialog with a
// fixed answer and keep the slider's props, so tests can drive what Compose would send.
const mockCompose: { slider?: { steps?: number; onValueChange: (value: number) => void } } = {};
jest.mock('@expo/ui/jetpack-compose', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const dialog =
    (testID: string, answer: () => Date) => (props: { onDateSelected: (date: Date) => void }) =>
      createElement(Pressable, {
        testID,
        accessibilityRole: 'button',
        accessibilityLabel: `Confirm ${testID}`,
        onPress: () => props.onDateSelected(answer()),
      });
  return {
    Host: ({ children }: { children: React.ReactNode }) => children,
    DatePickerDialog: dialog('date-dialog', () => new Date('2026-11-21T00:00:00Z')),
    TimePickerDialog: dialog('time-dialog', () => {
      const time = new Date();
      time.setHours(7, 30, 0, 0);
      return time;
    }),
    Slider: (props: { steps?: number; onValueChange: (value: number) => void }) => {
      mockCompose.slider = props;
      return createElement(View, { testID: 'compose-slider' });
    },
  };
});

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
  // The web's badge counts what's waiting.
  expect(screen.getByText('2')).toBeOnTheScreen();
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

describe('Slider grid', () => {
  it('reaches the exact bounds when the last step is shorter', async () => {
    expect(sliderValues(5, 27, 10)).toEqual([5, 15, 25, 27]);
    expect(snapToStep(26.4, 5, 27, 10)).toBe(27);
    expect(stepSlider(27, 5, 27, 10, -1)).toBe(25);
    expect(stepSlider(25, 5, 27, 10, 1)).toBe(27);
    expect(stepSlider(27, 5, 27, 10, 1)).toBe(27);
    const onChange = jest.fn();
    await wrap(
      <Slider
        accessibilityLabel="Factor"
        value={27}
        min={5}
        max={27}
        step={10}
        onChange={onChange}
      />,
    );
    await fireEvent(screen.getByLabelText('Factor'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).toHaveBeenLastCalledWith(25);
  });
});

it('gives each Android segment a full-height pressable at least 44 pt wide', async () => {
  Platform.OS = 'android';
  await wrap(
    <Segmented
      accessibilityLabel="Range"
      values={['1M', '3M']}
      selectedIndex={0}
      onChange={jest.fn()}
    />,
  );
  const group = StyleSheet.flatten(screen.getByLabelText('Range').props.style);
  expect(group.height).toBe(44);
  const choice = StyleSheet.flatten(screen.getByRole('radio', { name: '3M' }).props.style);
  // The 44 pt group's outline is inside it: -1 pt margins give each choice the full 44 pt.
  expect(choice).toMatchObject({ flex: 1, minWidth: 44, marginVertical: -1 });
});

it('keeps visual style overrides on the visible face and layout on the touch area', async () => {
  await wrap(
    <IconButton
      icon="bell"
      accessibilityLabel="Bell"
      onPress={jest.fn()}
      style={{ backgroundColor: 'red', borderRadius: 0, marginTop: 4 }}
    />,
  );
  const box = StyleSheet.flatten(screen.getByRole('button', { name: 'Bell' }).props.style);
  expect(box).toMatchObject({ marginTop: 4, width: 44, height: 44 });
  expect(box.backgroundColor).toBeUndefined();
  expect(splitStyle([{ flex: 1, padding: 2 }, { backgroundColor: 'red' }])).toEqual({
    box: { flex: 1 },
    face: { padding: 2, backgroundColor: 'red' },
  });
});

it('draws badge numerals on the darker danger fill', async () => {
  await wrap(<IconButton icon="bell" badge="4" accessibilityLabel="Bell" onPress={jest.fn()} />);
  const pill = screen.getByText('4').parent;
  expect(StyleSheet.flatten(pill?.props.style).backgroundColor).toBe(palettes.dark.dangerFill);
  for (const scheme of ['light', 'dark'] as const)
    for (const style of ['default', 'oled', 'stained'] as const)
      expect(
        contrast('#ffffff', themedPalette(scheme, 'blue', style, 'default').dangerFill),
      ).toBeGreaterThanOrEqual(4.5);
});

it('closes the Android date dialog and ignores it once the field is disabled', async () => {
  Platform.OS = 'android';
  const onChange = jest.fn();
  const field = (disabled: boolean) => (
    <SafeAreaProvider>
      <DateField label="Date" value="2026-11-20" onChange={onChange} disabled={disabled} />
    </SafeAreaProvider>
  );
  const { rerender } = await wrap(field(false));
  await fireEvent.press(screen.getByRole('button', { name: /^Date,/ }));
  expect(screen.queryByTestId('date-dialog')).toBeOnTheScreen();
  await rerender(field(true));
  expect(screen.queryByTestId('date-dialog')).toBeNull();
  await rerender(field(false));
  expect(screen.queryByTestId('date-dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

describe('rendered faces', () => {
  it('draws a small button and an icon button with the caller’s looks on the visible face', async () => {
    await wrap(
      <>
        <Button
          label="Retry"
          size="small"
          onPress={jest.fn()}
          style={{ backgroundColor: 'red', borderRadius: 0, marginTop: 4 }}
        />
        <IconButton
          icon="bell"
          accessibilityLabel="Bell"
          onPress={jest.fn()}
          style={{ backgroundColor: 'red', borderRadius: 0, marginTop: 4 }}
        />
      </>,
    );
    for (const name of ['Retry', 'Bell']) {
      const box = screen.getByRole('button', { name });
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({ marginTop: 4 });
      const face = box.children[0];
      if (typeof face === 'string') throw new Error('The button has no face view');
      expect(StyleSheet.flatten(face.props.style)).toMatchObject({
        backgroundColor: 'red',
        borderRadius: 0,
      });
    }
  });
});

describe('Android date and time dialogs', () => {
  it('send the chosen date and time', async () => {
    Platform.OS = 'android';
    const onDate = jest.fn();
    const onTime = jest.fn();
    await wrap(
      <>
        <DateField label="Date" value="2026-11-20" onChange={onDate} />
        <TimeField label="Time" value="06:00" onChange={onTime} />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Date,/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm date-dialog' }));
    expect(onDate).toHaveBeenCalledWith('2026-11-21');
    expect(screen.queryByTestId('date-dialog')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Time,/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm time-dialog' }));
    expect(onTime).toHaveBeenCalledWith('07:30');
  });

  it('closes the time dialog and sends nothing once the field is disabled', async () => {
    Platform.OS = 'android';
    const onTime = jest.fn();
    const field = (disabled: boolean) => (
      <SafeAreaProvider>
        <TimeField label="Time" value="06:00" onChange={onTime} disabled={disabled} />
      </SafeAreaProvider>
    );
    const { rerender } = await wrap(field(false));
    await fireEvent.press(screen.getByRole('button', { name: /^Time,/ }));
    expect(screen.getByTestId('time-dialog')).toBeOnTheScreen();
    await rerender(field(true));
    expect(screen.queryByTestId('time-dialog')).toBeNull();
    await rerender(field(false));
    expect(screen.queryByTestId('time-dialog')).toBeNull();
    expect(onTime).not.toHaveBeenCalled();
  });
});

describe('Android slider adapter', () => {
  it('gives Compose native stops on an even range and lands its values on the grid', async () => {
    Platform.OS = 'android';
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
    expect(mockCompose.slider?.steps).toBe(1);
    await act(async () => mockCompose.slider?.onValueChange(13.2));
    expect(onChange).toHaveBeenLastCalledWith(15);
  });

  it('warns about an uneven range, moves freely and still reaches the maximum', async () => {
    Platform.OS = 'android';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onChange = jest.fn();
    await wrap(
      <Slider accessibilityLabel="Reps" value={5} min={5} max={28} step={10} onChange={onChange} />,
    );
    expect(mockCompose.slider?.steps).toBe(0);
    await act(async () => mockCompose.slider?.onValueChange(27.6));
    expect(onChange).toHaveBeenLastCalledWith(28);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("isn't a whole number"));
    warn.mockRestore();
  });

  it('survives an invalid step without building a grid', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(snapToStep(7, 0, 10, 0)).toBe(10);
    expect(stepSlider(0, 0, 10, Number.NaN, 1)).toBe(10);
    expect(snapToStep(0.3, 0, 1, 0.1)).toBe(0.3);
    expect(stepSlider(1e9, 0, 1e12, 1e-6, -1)).toBeCloseTo(1e9 - 1e-6, 3);
    warn.mockRestore();
  });
});
