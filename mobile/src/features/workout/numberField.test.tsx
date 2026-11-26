import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef, type ComponentRef } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';
import { FOCUS_HAND_OFF_MS, formatPlain, NumberField, parseWhole } from './NumberField';

type Listener = () => void;
let listeners: Map<string, Set<Listener>>;

beforeEach(() => {
  listeners = new Map();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: Listener) => {
    const set = listeners.get(event) ?? new Set();
    set.add(listener);
    listeners.set(event, set);
    return { remove: () => set.delete(listener) } as ReturnType<typeof Keyboard.addListener>;
  }) as typeof Keyboard.addListener);
});
afterEach(() => jest.restoreAllMocks());

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
/** Time passes after the field took focus, as the keyboard settles. */
const later = () => {
  now += FOCUS_HAND_OFF_MS;
};

const keyboardHides = async () =>
  act(async () => listeners.get('keyboardDidHide')?.forEach((listener) => listener()));

async function renderField() {
  const ref = createRef<ComponentRef<typeof TextInput>>();
  await render(
    <NumberField
      ref={ref}
      label="Repetitions for set 1"
      value={8}
      format={formatPlain}
      parse={parseWhole}
      onChange={() => undefined}
      done
    />,
  );
  const blur = jest.spyOn(ref.current!, 'blur');
  const field = screen.getByLabelText('Repetitions for set 1');
  await fireEvent(field, 'focus');
  return { blur, field };
}

test('on Android, hiding the keyboard with Back ends the edit, so a logged set loses its outline', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { blur, field } = await renderField();
  later();
  await keyboardHides();
  expect(blur).toHaveBeenCalled();
  await fireEvent(field, 'blur');
  expect(screen.getByLabelText('Repetitions for set 1')).toHaveStyle({
    borderColor: 'transparent',
  });
  // Once the field has let go, hiding the keyboard again leaves it alone.
  blur.mockClear();
  await keyboardHides();
  expect(blur).not.toHaveBeenCalled();
});

test('a hide that arrives as the field takes focus belongs to the field before it', async () => {
  // Done on weight moving on to reps, or a tap into another keyboard type: Android can report
  // the old keyboard hiding just after the new field is focused.
  jest.replaceProperty(Platform, 'OS', 'android');
  const { blur } = await renderField();
  now += FOCUS_HAND_OFF_MS - 1;
  await keyboardHides();
  expect(blur).not.toHaveBeenCalled();
});

test('on iOS the field is left to the system, which ends the edit itself', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const { blur } = await renderField();
  await keyboardHides();
  expect(blur).not.toHaveBeenCalled();
});

test('the forwarded ref still moves focus to the field', async () => {
  const ref = createRef<ComponentRef<typeof TextInput>>();
  await render(
    <NumberField
      ref={ref}
      label="Weight"
      value={null}
      format={formatPlain}
      parse={parseWhole}
      onChange={() => undefined}
    />,
  );
  expect(typeof ref.current?.focus).toBe('function');
  expect(screen.getByLabelText('Weight').props.placeholder).toBe('–');
});
