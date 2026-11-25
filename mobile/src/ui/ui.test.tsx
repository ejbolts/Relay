import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, CardHeader, EmptyState, buttonColors } from './components';
import { ContextMenu } from './ContextMenu';
import { TextField } from './controls';
import { sheetScreenOptions } from './navigation';
import { showMenu } from './prompts';
import { mixOver, palettes, themedPalette } from './theme';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../testing/memoryKvStore'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('./prompts', () => ({ showMenu: jest.fn() }));

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

describe('palette', () => {
  it('matches the web tokens for each dark style', () => {
    const oled = themedPalette('dark', 'blue', 'oled', 'default');
    expect(oled.page).toBe('#000000');
    expect(oled.cardBorder).toBe('#ffffff38');
    expect(oled.danger).toBe('#f47a7a');
    const stained = themedPalette('dark', 'blue', 'stained', 'default');
    expect(stained.cardShadow).toBe(true);
    expect(stained.danger).toBe('#f47a7a');
    // --p-ink-2: color-mix(in srgb, var(--p-accent-text) 18%, #ccd3d9).
    expect(stained.secondary).not.toBe(palettes.dark.secondary);
    expect(themedPalette('dark', 'blue', 'default', 'default').cardShadow).toBe(false);
  });

  it('tints light Stained lines and inks with the accent', () => {
    const stained = themedPalette('light', 'emerald', 'default', 'stained');
    expect(stained.line).toMatch(/^rgba\(/);
    expect(stained.line).not.toBe(palettes.light.line);
    expect(stained.muted).not.toBe(palettes.light.muted);
  });

  it('mixes an opaque colour into a translucent one as CSS color-mix does', () => {
    // 16 % of #2c74d0 over rgb(16 24 32 / 9 %): alpha 0.16 + 0.84 × 0.09.
    expect(mixOver('#2c74d0', [16, 24, 32, 0.09], 16)).toBe('rgba(35,86,152,0.236)');
    expect(mixOver('#ffffff', [0, 0, 0, 0], 100)).toBe('rgba(255,255,255,1)');
  });
});

describe('Button', () => {
  it('keeps the old variants and adds the web ones', () => {
    const colors = palettes.dark;
    expect(buttonColors(colors, 'secondary').border).toBe(colors.lineStrong);
    expect(buttonColors(colors, 'tonal')).toMatchObject({
      fill: colors.accentSoft,
      ink: colors.accentText,
    });
    expect(buttonColors(colors, 'danger-soft').ink).toBe(colors.danger);
  });

  it('presses, and blocks presses while loading', async () => {
    const onPress = jest.fn();
    const { rerender } = await wrap(<Button label="Save" size="small" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<Button label="Save" loading onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ busy: true }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

it('shows a card header detail and an empty state action', async () => {
  const add = jest.fn();
  await wrap(
    <>
      <CardHeader title="This week" detail="Logged" detailTone="good" />
      <EmptyState
        icon="dumbbell"
        title="No workouts yet"
        message="Start one from the plus button."
        action={{ label: 'Start a workout', onPress: add }}
      />
    </>,
  );
  expect(screen.getByRole('header', { name: 'This week' })).toBeTruthy();
  expect(screen.getByText('Logged')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Start a workout' }));
  expect(add).toHaveBeenCalled();
});

it('shows a text field error beside the field', async () => {
  await wrap(<TextField label="Name" value="" onChangeText={jest.fn()} error="Enter a name." />);
  expect(screen.getByLabelText('Name')).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
});

describe('ContextMenu on Android', () => {
  const os = Platform.OS;
  beforeAll(() => {
    Platform.OS = 'android';
  });
  afterAll(() => {
    Platform.OS = os;
  });

  it('opens the menu sheet on a long press, and keeps the tap and screen reader actions', async () => {
    const open = jest.fn();
    const remove = jest.fn();
    await wrap(
      <ContextMenu
        accessibilityLabel="Leg day"
        title="Leg day"
        onPress={open}
        items={[{ label: 'Delete', destructive: true, onPress: remove }]}
      >
        <Text>Leg day</Text>
      </ContextMenu>,
    );
    const row = screen.getByRole('button', { name: 'Leg day' });
    await fireEvent.press(row);
    expect(open).toHaveBeenCalled();
    await fireEvent(row, 'longPress');
    expect(showMenu).toHaveBeenCalledWith('Leg day', [
      expect.objectContaining({ label: 'Delete', destructive: true }),
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'Delete' } });
    expect(remove).toHaveBeenCalled();
  });
});

it('opens route sheets as native form sheets on iOS and drawn sheets on Android', () => {
  const os = Platform.OS;
  Platform.OS = 'ios';
  expect(sheetScreenOptions({ detents: [0.5, 1] })).toMatchObject({
    presentation: 'formSheet',
    sheetAllowedDetents: [0.5, 1],
    sheetGrabberVisible: true,
  });
  Platform.OS = 'android';
  expect(sheetScreenOptions({ reducedMotion: true })).toMatchObject({
    presentation: 'transparentModal',
    animation: 'none',
  });
  Platform.OS = os;
});
