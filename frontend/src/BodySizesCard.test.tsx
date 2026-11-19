// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { BodySizesCard } from './BodySizesCard';
import { BODY_SIZE_FIELDS, type BodySizeLog } from './bodySizes';
import type { User } from './types';
import { UserContext } from './userContext';
import { localDate } from './utils';

let unit = 'kg';
vi.mock('./trainingPreferencesContext', () => ({ useWeightUnit: () => unit }));
vi.mock('./api', () => ({
  api: {
    listBodySizes: vi.fn(),
    saveBodySizes: vi.fn(),
    deleteBodySizes: vi.fn(),
    updateProfile: vi.fn(),
  },
}));
let root: Root;
let host: HTMLDivElement;
const row = (date: string, values = {}): BodySizeLog =>
  ({
    ...Object.fromEntries(BODY_SIZE_FIELDS.map(([key]) => [key, null])),
    measurement_date: date,
    ...values,
  }) as BodySizeLog;
function button(text: string) {
  const found = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No ${text} button`);
  return found;
}
function input(label: string, value: string) {
  const target = [...document.querySelectorAll('label')]
    .find((item) => item.textContent?.startsWith(label))!
    .querySelector('input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}
async function selectPart(value: string) {
  await act(async () => {
    const select = host.querySelector('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function figureBox() {
  const box = host.querySelector<HTMLInputElement>('.body-figure-editor input');
  if (!box) throw new Error('No measurement box on the figure');
  return box;
}
function typeInto(box: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, value);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}
function press(box: HTMLInputElement, key: string) {
  box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}
function pick(field: string) {
  host
    .querySelector(`[data-field="${field}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
async function render(rows: BodySizeLog[] = []) {
  vi.mocked(api.listBodySizes).mockResolvedValue(rows);
  await act(async () => root.render(<BodySizesCard />));
}
beforeEach(() => {
  unit = 'kg';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(api.saveBodySizes).mockImplementation(async (payload) => payload);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.resetAllMocks();
});

describe('BodySizesCard', () => {
  it('shows an individual part, skipping missing dates and comparing its previous measurement', async () => {
    await render([
      row('2026-10-25', { waist_cm: 81, chest_cm: 103, left_arm_cm: 35, right_arm_cm: 36 }),
      row('2026-10-24', { chest_cm: 102 }),
      row('2026-10-23', { waist_cm: 82 }),
      row('2026-10-22', { waist_cm: 82 }),
    ]);
    await selectPart('waist_cm');
    const history = host.querySelector('.body-sizes-history')!;
    expect(history.querySelectorAll('article')).toHaveLength(3);
    expect(
      [...history.querySelectorAll('.body-sizes-part-value')].map((item) => item.textContent),
    ).toEqual(['81 cm−1 cm', '82 cmNo change', '82 cmFirst measurement']);
    expect(history.querySelector('[datetime="2026-10-24"]')).toBeNull();
    expect(history.textContent).not.toContain('103 cm');
    expect(
      [...history.querySelectorAll('button')].some((item) => item.textContent === 'Delete'),
    ).toBe(false);
    await act(async () => history.querySelector('button')!.click());
    await act(async () => input('Waist', '80.5'));
    await act(async () => button('Update measurements').click());
    expect(history.querySelector('.body-sizes-part-value')?.textContent).toBe('80.5 cm−1.5 cm');
    await selectPart('right_arm_cm');
    expect(history.querySelector('.body-sizes-part-value')?.textContent).toBe(
      '36 cmFirst measurement',
    );
    await selectPart('left_arm_cm');
    expect(history.querySelector('.body-sizes-part-value')?.textContent).toBe(
      '35 cmFirst measurement',
    );
  });
  it('pages the selected part eight at a time and goes back to page 1 on switching parts, with an empty state', async () => {
    await render(
      Array.from({ length: 10 }, (_, index) =>
        row(`2026-10-${25 - index}`, { waist_cm: 80 + index }),
      ),
    );
    await selectPart('waist_cm');
    const history = host.querySelector('.body-sizes-history')!;
    expect(history.querySelectorAll('article')).toHaveLength(8);
    expect(history.textContent).not.toContain('First measurement');
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Next measurement history page"]')!
        .click(),
    );
    expect(history.querySelectorAll('article')).toHaveLength(2);
    // The change is still measured against the previous entry on the page before.
    expect(
      [...history.querySelectorAll('.body-sizes-part-value span')].map((item) => item.textContent),
    ).toEqual(['−1 cm', 'First measurement']);
    await selectPart('neck_cm');
    expect(history.querySelectorAll('article')).toHaveLength(0);
    expect(history.textContent).toContain('No neck measurements yet.');
    expect(history.querySelector('nav')).toBeNull();
    await selectPart('all');
    expect(history.querySelectorAll('article')).toHaveLength(8);
    expect(history.querySelector('[aria-current="page"]')?.textContent).toBe('1');
  });
  it('reports changes using the displayed inch values', async () => {
    unit = 'lb';
    await render([row('2026-10-25', { waist_cm: 82 }), row('2026-10-23', { waist_cm: 80 })]);
    await selectPart('waist_cm');
    expect(host.querySelector('.body-sizes-part-value')?.textContent).toBe('32.3 in+0.8 in');
  });
  it('retries a failed load and refreshes when the account revision changes', async () => {
    vi.mocked(api.listBodySizes).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => root.render(<BodySizesCard />));
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Offline');
    vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-20', { waist_cm: 80 })]);
    await act(async () => button('Retry').click());
    expect(host.textContent).toContain('80 cm');
    vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-21', { waist_cm: 79 })]);
    await act(async () => root.render(<BodySizesCard dataRevision="new-revision" />));
    expect(host.textContent).toContain('79 cm');
  });
  it('requires one measurement and saves a circumference without requiring weight', async () => {
    await render();
    expect(host.querySelectorAll('.body-figure-label.empty')).toHaveLength(12);
    await act(async () => button('Log measurements').click());
    await act(async () => button('Save measurements').click());
    expect(document.body.textContent).toContain('Enter at least one body measurement.');
    await act(async () => input('Waist', '82.5'));
    await act(async () => button('Save measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ waist_cm: 82.5, chest_cm: null }),
    );
    expect(host.textContent).toContain('82.5 cm');
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('edits an existing date, clears a value and deletes only after confirmation', async () => {
    await render([row('2026-10-20', { waist_cm: 82, chest_cm: 103 })]);
    await act(async () => button('Edit').click());
    await act(async () => {
      input('Waist', '81');
      input('Chest', '');
    });
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ measurement_date: '2026-10-20', waist_cm: 81, chest_cm: null }),
    );
    await act(async () => button('Delete').click());
    expect(api.deleteBodySizes).not.toHaveBeenCalled();
    await act(async () => button('Cancel').click());
    await act(async () => button('Delete').click());
    await act(async () => button('Delete measurements').click());
    expect(api.deleteBodySizes).toHaveBeenCalledWith('2026-10-20');
    expect(host.querySelectorAll('.body-figure-label.empty')).toHaveLength(12);
  });
  it('converts inches and preserves unchanged stored precision when editing', async () => {
    unit = 'lb';
    await render([row('2026-10-20', { waist_cm: 82.1234 })]);
    expect(host.textContent).toContain('32.3 in');
    await act(async () => button('Edit').click());
    await act(async () => input('Chest', '40'));
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ waist_cm: 82.1234, chest_cm: 101.6 }),
    );
  });
  it('keeps the form and saved data on failure, then retries', async () => {
    await render([row('2026-10-20', { waist_cm: 82 })]);
    await act(async () => button('Edit').click());
    await act(async () => input('Waist', '301'));
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).not.toHaveBeenCalled();
    await act(async () => input('Waist', '81'));
    vi.mocked(api.saveBodySizes).mockRejectedValueOnce(new Error('Connection failed'));
    await act(async () => button('Update measurements').click());
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Connection failed');
    expect(host.textContent).toContain('82 cm');
    await act(async () => button('Update measurements').click());
    expect(host.textContent).toContain('81 cm');
  });
  it('steps back through earlier entries and lists what changed since the one before', async () => {
    await render([
      row('2026-10-25', { waist_cm: 81, chest_cm: 103, neck_cm: 38 }),
      row('2026-10-18', { waist_cm: 82, chest_cm: 102.5, neck_cm: 38 }),
      row('2026-10-11', { waist_cm: 82 }),
    ]);
    const stepper = host.querySelector('.body-sizes-stepper')!;
    const [earlier, later] = [...stepper.querySelectorAll('button')];
    const changes = () =>
      [...host.querySelectorAll('.body-sizes-changes li')].map((item) => item.textContent);
    expect(stepper.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-25');
    expect(later.disabled).toBe(true);
    expect(host.querySelector('.body-sizes-changes h3')?.textContent).toContain('18');
    // Neck did not change, so it is left out.
    expect(changes()).toEqual(['Chest↑ 0.5', 'Waist↓ 1']);
    expect(host.querySelector('[data-field="waist_cm"]')?.textContent).toBe('Waist81 cm');
    await act(async () => earlier.click());
    expect(stepper.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-18');
    expect(host.querySelector('[data-field="waist_cm"]')?.textContent).toBe('Waist82 cm');
    // Only waist was measured on both days, and it is unchanged.
    expect(host.querySelector('.body-sizes-changes')).toBeNull();
    await act(async () => earlier.click());
    expect(earlier.disabled).toBe(true);
    expect(host.querySelector('[data-field="chest_cm"]')?.classList.contains('empty')).toBe(true);
    // Edit and Delete act on the entry being shown.
    await act(async () => button('Delete').click());
    await act(async () => button('Delete measurements').click());
    expect(api.deleteBodySizes).toHaveBeenCalledWith('2026-10-11');
    expect(stepper.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-25');
  });
  it('types a measurement tapped on the figure into today’s entry, leaving earlier ones as they were', async () => {
    await render([
      row('2026-10-25', { waist_cm: 81, chest_cm: 103 }),
      row('2026-10-18', { waist_cm: 82, chest_cm: 102 }),
    ]);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Earlier measurements"]')!.click(),
    );
    const waist = host.querySelector('[data-field="waist_cm"]')!;
    expect(waist.getAttribute('aria-label')).toBe('Update waist, 82 cm');
    await act(async () => waist.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // No dialog: the value is edited on the figure.
    expect(document.querySelector('dialog')).toBeNull();
    let box = figureBox();
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe('82');
    await act(async () => typeInto(box, '81.5'));
    await act(async () => press(box, 'Enter'));
    // It starts today's entry with only the typed part; the shown Oct 18 entry is untouched.
    expect(api.saveBodySizes).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ measurement_date: localDate(), waist_cm: 81.5, chest_cm: null }),
    );
    expect(host.querySelector('.body-sizes-stepper time')?.getAttribute('datetime')).toBe(
      localDate(),
    );
    expect(host.querySelector('[data-field="waist_cm"]')?.textContent).toBe('Waist81.5 cm');
    expect(host.querySelector('.body-figure-editor')).toBeNull();
    // The figure stays complete: chest shows the latest earlier value, muted.
    const chest = host.querySelector('[data-field="chest_cm"]')!;
    expect(chest.textContent).toBe('Chest103 cm');
    expect(chest.classList.contains('carried')).toBe(true);
    expect(chest.getAttribute('aria-label')).toBe('Add chest, last 103 cm');
    expect(host.querySelector('[data-field="waist_cm"]')?.classList.contains('carried')).toBe(
      false,
    );

    // A blank part is added to today's entry, keeping what it already has.
    const neck = host.querySelector('[data-field="neck_cm"]')!;
    expect(neck.getAttribute('aria-label')).toBe('Add neck');
    await act(async () => neck.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    box = figureBox();
    expect(box.value).toBe('');
    await act(async () => typeInto(box, '38,5'));
    await act(async () => box.blur());
    expect(api.saveBodySizes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        measurement_date: localDate(),
        neck_cm: 38.5,
        waist_cm: 81.5,
        chest_cm: null,
      }),
    );
    expect(host.querySelector('[data-field="neck_cm"]')?.textContent).toBe('Neck38.5 cm');
    // Confirming a carried value unchanged saves nothing.
    await act(async () => chest.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(figureBox().value).toBe('103');
    await act(async () => press(figureBox(), 'Enter'));
    expect(api.saveBodySizes).toHaveBeenCalledTimes(2);
  });
  it('rejects an impossible value beside the figure and saves nothing for an empty or unchanged box', async () => {
    unit = 'lb';
    await render([row('2026-10-25', { waist_cm: 81.28 })]);
    await act(async () => pick('chest_cm'));
    await act(async () => typeInto(figureBox(), '0'));
    await act(async () => press(figureBox(), 'Enter'));
    expect(host.querySelector('#body-figure-error')?.textContent).toBe(
      'Chest must be above 0 and up to 118.11 in.',
    );
    expect(figureBox().getAttribute('aria-invalid')).toBe('true');
    await act(async () => press(figureBox(), 'Escape'));
    expect(host.querySelector('#body-figure-error')).toBeNull();
    await act(async () => pick('chest_cm'));
    await act(async () => press(figureBox(), 'Enter'));
    // An inch value shown rounded is not rewritten when left as it was.
    await act(async () => pick('waist_cm'));
    expect(figureBox().value).toBe('32');
    await act(async () => press(figureBox(), 'Enter'));
    expect(api.saveBodySizes).not.toHaveBeenCalled();
  });
  it('shows the empty figure before anything is logged and starts today’s entry from it', async () => {
    await render([]);
    expect(host.querySelector('.body-sizes-stepper time')?.getAttribute('datetime')).toBe(
      localDate(),
    );
    expect(host.querySelectorAll('.body-figure-label.empty')).toHaveLength(12);
    expect(host.textContent).not.toContain('Delete');
    await act(async () => pick('hips_cm'));
    await act(async () => typeInto(figureBox(), '95'));
    await act(async () => press(figureBox(), 'Enter'));
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ measurement_date: localDate(), hips_cm: 95, waist_cm: null }),
    );
    expect(button('Delete')).toBeTruthy();
  });
  it('sends quick figure saves one after another, so the later one keeps both changes', async () => {
    const pending: ((value: BodySizeLog) => void)[] = [];
    vi.mocked(api.saveBodySizes).mockImplementation(
      (payload) =>
        new Promise((resolve) => {
          pending.push(() => resolve(payload));
        }),
    );
    await render([row('2026-10-25', { waist_cm: 81 })]);
    await act(async () => pick('neck_cm'));
    await act(async () => typeInto(figureBox(), '38'));
    await act(async () => press(figureBox(), 'Enter'));
    await act(async () => pick('chest_cm'));
    await act(async () => typeInto(figureBox(), '101'));
    await act(async () => press(figureBox(), 'Enter'));
    // The second save waits for the first.
    expect(api.saveBodySizes).toHaveBeenCalledTimes(1);
    await act(async () => pending[0]({} as BodySizeLog));
    expect(api.saveBodySizes).toHaveBeenCalledTimes(2);
    expect(api.saveBodySizes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        measurement_date: localDate(),
        neck_cm: 38,
        chest_cm: 101,
        waist_cm: null,
      }),
    );
    await act(async () => pending[1]({} as BodySizeLog));
  });
  it('reports a failed figure save and reloads what is stored', async () => {
    await render([row('2026-10-25', { waist_cm: 81 })]);
    vi.mocked(api.saveBodySizes).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => pick('neck_cm'));
    await act(async () => typeInto(figureBox(), '38'));
    await act(async () => press(figureBox(), 'Enter'));
    expect(host.querySelector('#body-figure-error')?.textContent).toBe('Offline');
    expect(api.listBodySizes).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-field="neck_cm"]')?.textContent).toBe('Neck');
  });
  it('hides the stepper arrows for a single entry and shows a newly saved date', async () => {
    await render([row('2026-10-20', { waist_cm: 82 })]);
    expect(host.querySelectorAll('.body-sizes-stepper button')).toHaveLength(0);
    await act(async () => button('Log measurements').click());
    await act(async () => {
      input('Date', '2026-10-01');
      input('Hips', '95');
    });
    await act(async () => button('Save measurements').click());
    const stepper = host.querySelector('.body-sizes-stepper')!;
    expect(stepper.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-01');
    expect(stepper.querySelectorAll('button')).toHaveLength(2);
    expect(host.querySelector('[data-field="hips_cm"]')?.textContent).toBe('Hips95 cm');
  });
  it('switches the body outline and remembers it for the account on this device', async () => {
    const session = {
      user: { id: 'figure-test-user' } as User,
      updateUser: () => undefined,
      signOut: async () => undefined,
      accountDeleted: async () => undefined,
    };
    const card = (
      <UserContext.Provider value={session}>
        <BodySizesCard />
      </UserContext.Provider>
    );
    vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-20', { waist_cm: 82 })]);
    await act(async () => root.render(card));
    const outline = () => host.querySelector('.body-figure')?.getAttribute('data-figure');
    const choice = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(
        (item) => item.textContent === name,
      )!;
    expect(outline()).toBe('male');
    expect(choice('Male').getAttribute('aria-checked')).toBe('true');
    await act(async () => choice('Female').click());
    expect(outline()).toBe('female');
    expect(choice('Female').getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('gym-logger-body-figure:figure-test-user')).toBe('female');
    // A fresh card for the same account starts on the saved outline.
    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(card));
    expect(outline()).toBe('female');
    window.localStorage.removeItem('gym-logger-body-figure:figure-test-user');
  });
  it.each(['male', 'female'] as const)(
    'locks the outline to the %s sex set on the profile',
    async (sex) => {
      const userId = `figure-locked-${sex}`;
      // A different outline chosen on this device before the sex was set no longer applies.
      window.localStorage.setItem(
        `gym-logger-body-figure:${userId}`,
        sex === 'male' ? 'female' : 'male',
      );
      const session = {
        user: { id: userId, sex } as User,
        updateUser: () => undefined,
        signOut: async () => undefined,
        accountDeleted: async () => undefined,
      };
      vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-20', { waist_cm: 82 })]);
      await act(async () =>
        root.render(
          <UserContext.Provider value={session}>
            <BodySizesCard />
          </UserContext.Provider>,
        ),
      );
      expect(host.querySelector('.body-figure')?.getAttribute('data-figure')).toBe(sex);
      expect(host.querySelector('[role=radiogroup]')).toBeNull();
      const locked = host.querySelector('.body-sizes-figure-locked')!;
      expect(locked.textContent).toBe(`${sex === 'male' ? 'Male' : 'Female'}, set on your profile`);
      window.localStorage.removeItem(`gym-logger-body-figure:${userId}`);
    },
  );
  it('offers to save the picked outline as the account sex until the profile has one', async () => {
    const updateUser = vi.fn();
    const session = {
      user: { id: 'figure-offer-user' } as User,
      updateUser,
      signOut: async () => undefined,
      accountDeleted: async () => undefined,
    };
    vi.mocked(api.listBodySizes).mockResolvedValue([row('2026-10-20', { waist_cm: 82 })]);
    vi.mocked(api.updateProfile).mockResolvedValue({
      id: 'figure-offer-user',
      sex: 'female',
    } as User);
    await act(async () =>
      root.render(
        <UserContext.Provider value={session}>
          <BodySizesCard />
        </UserContext.Provider>,
      ),
    );
    const choice = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(
        (item) => item.textContent === name,
      )!;
    const offer = () => document.querySelector<HTMLDialogElement>('dialog.profile-sex-confirm');

    // Not now keeps the outline on this device without saving anything.
    await act(async () => choice('Female').click());
    expect(host.querySelector('.body-figure')?.getAttribute('data-figure')).toBe('female');
    expect(offer()?.querySelector('h2')?.textContent).toBe('Save your sex as Female?');
    await act(async () => button('Not now').click());
    expect(offer()).toBeNull();
    expect(api.updateProfile).not.toHaveBeenCalled();

    await act(async () => choice('Male').click());
    await act(async () => choice('Female').click());
    await act(async () => button('Save').click());
    expect(api.updateProfile).toHaveBeenCalledExactlyOnceWith({ sex: 'female' });
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ sex: 'female' }));
    expect(offer()).toBeNull();
    window.localStorage.removeItem('gym-logger-body-figure:figure-offer-user');
  });
  it('changing the date loads that dates measurements instead of overwriting from another day', async () => {
    await render([row('2026-10-20', { waist_cm: 82 }), row('2026-10-19', { chest_cm: 100 })]);
    await act(async () => button('Edit').click());
    await act(async () => input('Date', '2026-10-19'));
    await act(async () => button('Update measurements').click());
    expect(api.saveBodySizes).toHaveBeenCalledWith(
      expect.objectContaining({ measurement_date: '2026-10-19', waist_cm: null, chest_cm: 100 }),
    );
  });
  it('hints each part’s latest earlier value when logging new measurements', async () => {
    await render([
      row('2026-10-20', { waist_cm: 82 }),
      row('2026-10-12', { waist_cm: 83, chest_cm: 101.04 }),
    ]);
    await act(async () => button('Log measurements').click());
    const field = (name: string) =>
      document.querySelector<HTMLInputElement>(`dialog input[name="${name}"]`)!;
    expect(field('waist_cm').placeholder).toBe('82');
    expect(field('chest_cm').placeholder).toBe('101');
    expect(field('neck_cm').placeholder).toBe('');
    expect(field('waist_cm').value).toBe('');
  });
});
