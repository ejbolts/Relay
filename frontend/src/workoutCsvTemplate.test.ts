import { describe, expect, it } from 'vitest';
import { workoutCsvTemplate, workoutCsvTemplateRows } from './workoutCsvTemplate';

describe('workout CSV template', () => {
  it('uses the import layout in the chosen weight unit', () => {
    for (const unit of ['kg', 'lb'] as const) {
      const [header, ...rows] = workoutCsvTemplateRows(unit);
      expect(header).toEqual([
        'Date Lifted',
        'Exercise',
        `Weight (${unit})`,
        'Reps',
        'Warmup',
        'Workout ID',
        'Workout name',
      ]);
      for (const row of rows) {
        expect(row).toHaveLength(header.length);
        expect(row[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(row[3]).toMatch(/^\d+$/);
      }
      // One Workout ID per date, so the importer keeps each session together.
      const dates = new Map(rows.map((row) => [row[5], row[0]]));
      expect(new Set(dates.values()).size).toBe(dates.size);
    }
  });

  it('writes one CRLF-terminated line per row with no quoting needed', () => {
    const lines = workoutCsvTemplate('kg').split('\r\n');
    expect(lines.at(-1)).toBe('');
    expect(lines[0]).toBe('Date Lifted,Exercise,Weight (kg),Reps,Warmup,Workout ID,Workout name');
    expect(lines.slice(0, -1).every((line) => !line.includes('"'))).toBe(true);
  });
});
