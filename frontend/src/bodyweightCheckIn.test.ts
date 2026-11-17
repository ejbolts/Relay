import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { saveBodyFatCheckIn, saveBodyweightCheckIn } from './bodyweightCheckIn';
import type { BodyMeasurement } from './types';

const previous: BodyMeasurement = {
  id: 'previous',
  measurement_date: '2026-10-17',
  weight_kg: 84.2,
  body_fat_pct: 18,
  notes: 'Morning check-in',
  is_sample: false,
  created_at: '2026-10-17T08:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

describe('bodyweight check-in persistence', () => {
  it('saves fat without changing weight/notes and undoes only fat against the latest entry', async () => {
    const save = vi
      .spyOn(api, 'saveBodyMeasurement')
      .mockResolvedValue({ ...previous, body_fat_pct: 19 });
    vi.spyOn(api, 'listBodyMeasurements').mockResolvedValue([
      { ...previous, weight_kg: 85, body_fat_pct: 19, notes: 'Updated notes' },
    ]);
    const undo = await saveBodyFatCheckIn(previous, previous.measurement_date, 19);
    expect(save).toHaveBeenLastCalledWith({
      measurement_date: previous.measurement_date,
      weight_kg: 84.2,
      body_fat_pct: 19,
      notes: previous.notes,
    });
    await undo();
    expect(save).toHaveBeenLastCalledWith({
      measurement_date: previous.measurement_date,
      weight_kg: 85,
      body_fat_pct: 18,
      notes: 'Updated notes',
    });
  });

  it('does not invent a weight or recreate a removed check-in for body fat', async () => {
    const save = vi.spyOn(api, 'saveBodyMeasurement').mockResolvedValue(previous);
    await expect(saveBodyFatCheckIn(null, previous.measurement_date, 19)).rejects.toThrow(
      'body weight',
    );
    await expect(saveBodyFatCheckIn(previous, '2026-10-18', 19)).rejects.toThrow('body weight');
    expect(save).not.toHaveBeenCalled();
    const undo = await saveBodyFatCheckIn(previous, previous.measurement_date, 19);
    vi.spyOn(api, 'listBodyMeasurements').mockResolvedValue([]);
    await expect(undo()).rejects.toThrow('no longer exists');
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('deletes only the newly saved entry when undoing a first check-in', async () => {
    const save = vi.spyOn(api, 'saveBodyMeasurement').mockResolvedValue({ ...previous, id: 'new' });
    const remove = vi.spyOn(api, 'deleteBodyMeasurement').mockResolvedValue(undefined);
    const undo = await saveBodyweightCheckIn(null, '2026-10-17', 84.5);
    expect(save).toHaveBeenCalledWith({
      measurement_date: '2026-10-17',
      weight_kg: 84.5,
      body_fat_pct: null,
      notes: null,
    });
    expect(remove).not.toHaveBeenCalled();
    await undo();
    expect(remove).toHaveBeenCalledExactlyOnceWith('new');
  });

  it('preserves the other fields on update and restores all original values on undo', async () => {
    const save = vi.spyOn(api, 'saveBodyMeasurement').mockResolvedValue(previous);
    const remove = vi.spyOn(api, 'deleteBodyMeasurement').mockResolvedValue(undefined);
    const undo = await saveBodyweightCheckIn(previous, previous.measurement_date, 84.5);
    expect(save).toHaveBeenLastCalledWith({
      measurement_date: previous.measurement_date,
      weight_kg: 84.5,
      body_fat_pct: 18,
      notes: 'Morning check-in',
    });
    await undo();
    expect(save).toHaveBeenLastCalledWith({
      measurement_date: previous.measurement_date,
      weight_kg: 84.2,
      body_fat_pct: 18,
      notes: 'Morning check-in',
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('propagates save and undo failures instead of reporting success', async () => {
    const save = vi
      .spyOn(api, 'saveBodyMeasurement')
      .mockRejectedValueOnce(new Error('Save failed'));
    await expect(saveBodyweightCheckIn(null, previous.measurement_date, 84.5)).rejects.toThrow(
      'Save failed',
    );
    save.mockResolvedValue(previous);
    vi.spyOn(api, 'deleteBodyMeasurement').mockRejectedValueOnce(new Error('Undo failed'));
    const undo = await saveBodyweightCheckIn(null, previous.measurement_date, 84.5);
    await expect(undo()).rejects.toThrow('Undo failed');
  });
});

it('saves weight and fat atomically and restores the original entry on undo', async () => {
  const save = vi.spyOn(api, 'saveBodyMeasurement').mockResolvedValue(previous);
  const undo = await saveBodyweightCheckIn(previous, previous.measurement_date, 85, 19);
  expect(save).toHaveBeenCalledExactlyOnceWith({
    measurement_date: previous.measurement_date,
    weight_kg: 85,
    body_fat_pct: 19,
    notes: previous.notes,
  });
  await undo();
  expect(save).toHaveBeenLastCalledWith({
    measurement_date: previous.measurement_date,
    weight_kg: previous.weight_kg,
    body_fat_pct: previous.body_fat_pct,
    notes: previous.notes,
  });
});
