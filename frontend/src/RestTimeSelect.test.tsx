// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestTimeSelect } from './RestTimeSelect';

let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();
function Controlled({ initial }: { initial: number }) {
  const [seconds, setSeconds] = useState(initial);
  return (
    <RestTimeSelect
      seconds={seconds}
      label="Rest after set 1"
      onChange={(value) => {
        changed(value);
        setSeconds(value);
      }}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  changed.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(initial = 120) {
  await act(async () => root.render(<Controlled initial={initial} />));
}
const select = () => container.querySelector('select')!;
async function choose(value: string) {
  await act(async () => {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function input(label: string, value: string) {
  const field = [...document.querySelectorAll('label')]
    .find((item) => item.textContent === label)!
    .querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it('stops presets at four minutes and follows them with custom entry', async () => {
  await render();
  expect([...select().options].map((option) => option.value)).toEqual([
    '0',
    '30',
    '60',
    '90',
    '120',
    '150',
    '180',
    '210',
    '240',
    'custom',
  ]);
  expect(select().options[8].textContent).toBe('4:00');
  await choose('240');
  expect(changed).toHaveBeenLastCalledWith(240);
  expect(document.querySelector('dialog')).toBeNull();
});

it.each([
  [315, '5:15'],
  [300, '5:00'],
  [7200, '2:00:00'],
] as const)(
  'preserves saved %s-second durations without adding a visible preset',
  async (initial, expected) => {
    await render(initial);
    expect(select().selectedOptions[0].textContent).toBe(expected);
    expect([...select().options].filter((option) => !option.hidden).at(-2)?.value).toBe('240');
    expect(changed).not.toHaveBeenCalled();
    await choose('custom');
    const fields = document.querySelectorAll('input');
    expect(fields[0].value).toBe(String(Math.floor(initial / 60)));
    expect(fields[1].value).toBe(String(initial % 60));
    await submit();
    expect(changed).toHaveBeenCalledWith(initial);
  },
);

it('saves custom minutes and seconds and can reopen the selected custom time', async () => {
  await render();
  await choose('custom');
  await input('Minutes', '5');
  await input('Seconds', '15');
  await submit();
  expect(changed).toHaveBeenCalledWith(315);
  expect(select().selectedOptions[0].textContent).toBe('5:15');
  expect(document.querySelector('dialog')).toBeNull();
  await choose('custom');
  expect(document.querySelector('input')!.value).toBe('5');
  await input('Minutes', '0');
  await input('Seconds', '0');
  await submit();
  expect(changed).toHaveBeenLastCalledWith(0);
  expect(select().value).toBe('0');
});

it.each(['cancel', 'escape'])('keeps the current duration on %s', async (method) => {
  await render(315);
  await choose('custom');
  await input('Minutes', '8');
  await act(async () => {
    if (method === 'escape')
      document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    else
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Cancel')!
        .click();
  });
  expect(changed).not.toHaveBeenCalled();
  expect(select().selectedOptions[0].textContent).toBe('5:15');
  expect(document.querySelector('dialog')).toBeNull();
});

it.each([
  ['', '0'],
  ['-1', '0'],
  ['1.5', '0'],
  ['0', '60'],
  ['120', '1'],
  ['121', '0'],
])('rejects invalid duration %s:%s', async (minutes, seconds) => {
  await render();
  await choose('custom');
  await input('Minutes', minutes);
  await input('Seconds', seconds);
  await submit();
  expect(changed).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('0:00 to 120:00');
});

describe('without a rest yet', () => {
  async function renderEmpty() {
    await act(async () =>
      root.render(
        <RestTimeSelect
          seconds={null}
          label="Add rest after set 1"
          placeholder="Rest"
          customStart={135}
          onChange={changed}
        />,
      ),
    );
  }

  it('shows the placeholder and offers rest times without "no rest"', async () => {
    await renderEmpty();
    expect(select().value).toBe('');
    expect(select().selectedOptions[0].textContent).toBe('Rest');
    expect(
      [...select().options].filter((option) => !option.hidden).map((option) => option.value),
    ).toEqual(['30', '60', '90', '120', '150', '180', '210', '240', 'custom']);
    await choose('90');
    expect(changed).toHaveBeenCalledWith(90);
    // Nothing is set until the parent stores the choice.
    expect(select().value).toBe('');
  });

  it('starts a custom time from the suggested rest', async () => {
    await renderEmpty();
    await choose('custom');
    const fields = document.querySelectorAll('input');
    expect([fields[0].value, fields[1].value]).toEqual(['2', '15']);
    expect(changed).not.toHaveBeenCalled();
    await input('Seconds', '45');
    await submit();
    expect(changed).toHaveBeenCalledWith(165);
  });
});
