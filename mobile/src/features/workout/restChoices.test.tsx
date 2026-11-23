import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { promptText, showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { parseRestInput, restMenuItems } from './restChoices';

jest.mock('../../ui/prompts', () => ({ promptText: jest.fn(), showMenu: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const action = (items: MenuItem[], label: string) => {
  const item = items.find((entry) => entry.label === label);
  if (!item || 'items' in item) throw new Error(`No action ${label}`);
  return item;
};

test('reads a rest as m:ss or seconds, from 1 second up to the web limit of 2 hours', () => {
  expect(parseRestInput('2:30')).toBe(150);
  expect(parseRestInput(' 90 ')).toBe(90);
  expect(parseRestInput('120:00')).toBe(7200);
  for (const bad of ['0', '0:00', '2:75', '120:01', '1.5', 'abc', ''])
    expect(parseRestInput(bad)).toBeNull();
});

test('offers the usual times with the current one ticked, No rest and Custom…', () => {
  const onPick = jest.fn();
  const onNone = jest.fn();
  const items = restMenuItems({ current: 90, onPick, onNone });
  expect(items.map((item) => item.label)).toEqual([
    '0:30',
    '1:00',
    '1:30',
    '2:00',
    '2:30',
    '3:00',
    '3:30',
    '4:00',
    'No rest',
    'Custom…',
  ]);
  expect(items.filter((item) => 'checked' in item && item.checked).map((i) => i.label)).toEqual([
    '1:30',
  ]);
  action(items, '2:00').onPress();
  expect(onPick).toHaveBeenCalledWith(120);
  action(items, 'No rest').onPress();
  expect(onNone).toHaveBeenCalled();
  // Starting a rest has no "No rest"; a custom current time names itself.
  const start = restMenuItems({ current: 75, onPick });
  expect(start.map((item) => item.label).slice(-2)).toEqual(['4:00', 'Custom (1:15)…']);
});

test('Custom… asks for a time and explains a time it cannot use', () => {
  const onPick = jest.fn();
  action(restMenuItems({ current: null, onPick }), 'Custom…').onPress();
  const request = jest.mocked(promptText).mock.calls[0][0];
  expect(request).toMatchObject({ title: 'Custom rest time', value: '1:30' });
  request.onSubmit('3:15');
  expect(onPick).toHaveBeenCalledWith(195);
  request.onSubmit('9:99');
  expect(onPick).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith('Enter a rest such as 2:30, up to 2 hours.');
});

test('away from iOS the menu opens as a sheet, and a submenu as a second sheet', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const onRest = jest.fn();
  const onDelete = jest.fn();
  await render(
    <MenuButton
      accessibilityLabel="Set 1 type: Working set"
      title="Set 1"
      items={[
        { label: 'Warm-up', checked: true, onPress: jest.fn() },
        { label: 'Rest time', items: [{ label: '1:30', onPress: onRest }] },
        { label: 'Delete set', destructive: true, onPress: onDelete },
      ]}
      trigger={{ text: '1', color: '#000' }}
      width={34}
      height={36}
      fill="#eee"
    >
      <Text>1</Text>
    </MenuButton>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Set 1 type: Working set' }));
  const [title, options] = jest.mocked(showMenu).mock.calls[0];
  expect(title).toBe('Set 1');
  expect(options.map((option) => option.label)).toEqual(['Warm-up ✓', 'Rest time', 'Delete set']);
  expect(options[2].destructive).toBe(true);
  options[1].onPress();
  const [subTitle, subOptions] = jest.mocked(showMenu).mock.calls[1];
  expect(subTitle).toBe('Rest time');
  subOptions[0].onPress();
  expect(onRest).toHaveBeenCalled();
});
