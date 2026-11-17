// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkoutCsvGuide } from './WorkoutCsvGuide';
import { downloadWorkoutCsvTemplate } from './workoutCsvTemplate';
import type { WorkoutImportOptions } from './types';

vi.mock('./trainingPreferencesContext', () => ({ useWeightUnit: () => 'lb' }));
vi.mock('./workoutCsvTemplate', () => ({ downloadWorkoutCsvTemplate: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
const onClose = vi.fn();
const onFileSelected = vi.fn();

function Guide() {
  const [options, setOptions] = useState<WorkoutImportOptions>({
    source: 'gym',
    weight_unit: 'kg',
    distance_unit: 'km',
  });
  return (
    <WorkoutCsvGuide
      options={options}
      onOptionsChange={setOptions}
      onClose={onClose}
      onFileSelected={onFileSelected}
    />
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Guide />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('opens directly to source selection and file choice without wizard navigation', async () => {
  const dialog = document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelectorAll('.workout-import-apps button')).toHaveLength(4);
  expect(dialog.querySelector('.popup-primary-action')?.textContent).toContain('Choose CSV file');
  expect(
    [...dialog.querySelectorAll('button')].some((b) => /^(Next|Back)$/.test(b.textContent!.trim())),
  ).toBe(false);
  expect(dialog.querySelector('table')).toBeNull();
  await act(async () =>
    (dialog.querySelector('.workout-csv-guide-close') as HTMLButtonElement).click(),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(onFileSelected).not.toHaveBeenCalled();
});

it('passes the chosen app and units with the file immediately from the single page', async () => {
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.workout-import-apps button:nth-child(3)')!.click(),
  );
  const selects = document.querySelectorAll('select');
  await act(async () => {
    selects[0].value = 'lb';
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    selects[1].value = 'mi';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File(['sample'], 'strong.csv', { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onFileSelected).toHaveBeenCalledWith(file, {
    source: 'strong',
    weight_unit: 'lb',
    distance_unit: 'mi',
  });
  expect(input.value).toBe('');
  expect(document.querySelector('.workout-csv-guide-template')).toBeNull();
});

it('keeps the native spreadsheet template in the preferred weight unit', async () => {
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.workout-csv-guide-template')!.click(),
  );
  expect(downloadWorkoutCsvTemplate).toHaveBeenCalledWith('lb');
  expect(onFileSelected).not.toHaveBeenCalled();
});
