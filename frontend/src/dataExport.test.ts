import { describe, expect, it } from 'vitest';
import {
  archiveCountRows,
  archiveFileName,
  archiveKicker,
  archiveSkippedNote,
} from './accountArchive';
import {
  exportFileNames,
  exportFilesNote,
  exportRangeLabel,
  exportWorkoutDates,
} from './dataExport';

describe('data export rules', () => {
  it('counts back from the latest workout logged', () => {
    expect(exportWorkoutDates([{ workout_date: '2026-10-01' }], '2026-10-09')).toEqual([
      '2026-10-01',
      '2026-10-09',
    ]);
    expect(exportWorkoutDates([], null)).toEqual([]);
  });

  it('words the time frame and the files', () => {
    expect(exportRangeLabel({ start_date: '2026-07-09', end_date: '2026-10-09' }, [])).toBe(
      '2026-07-09 – 2026-10-09 · ends at your latest selected entry',
    );
    expect(exportRangeLabel({}, ['2026-10-09'])).toBe('All saved entries');
    expect(exportRangeLabel({}, [])).toBe('No saved entries — exports an empty CSV template');
    expect(exportFilesNote(true, true)).toBe(
      'Downloads two CSV files: workout history and bodyweight check-ins.',
    );
    expect(exportFilesNote(false, true, 'Shares')).toBe('Shares one bodyweight CSV file.');
    expect(exportFilesNote(false, false)).toBe('Select at least one type of data.');
  });

  it('names the files after the time frame, or today for all time', () => {
    expect(exportFileNames({}, '2026-10-09')).toEqual({
      workouts: 'gym-workouts-2026-10-09.csv',
      bodyweight: 'body-weight-2026-10-09.csv',
    });
    expect(
      exportFileNames({ start_date: '2026-07-09', end_date: '2026-10-09' }, '2026-11-01').workouts,
    ).toBe('gym-workouts-2026-07-09-to-2026-10-09.csv');
  });
});

describe('full backup rules', () => {
  const counts = {
    workouts: 3,
    cardio_sessions: 1,
    body_check_ins: 2,
    custom_exercises: 0,
    photos: 0,
  };

  it('lists only the counts the server reports', () => {
    const rows = archiveCountRows({
      created_at: null,
      username: null,
      archive: counts,
      current: { ...counts, workouts: 5 },
      photos_skipped: 0,
    });
    expect(rows.map((row) => row.key)).not.toContain('workout_photos');
    expect(rows[0]).toEqual({ key: 'workouts', label: 'Workouts', archive: 3, current: 5 });
  });

  it('names the file, the kicker and skipped photos', () => {
    expect(archiveFileName('2026-10-09')).toBe('relay-backup-2026-10-09.zip');
    expect(
      archiveKicker({
        created_at: null,
        username: null,
        archive: counts,
        current: counts,
        photos_skipped: 0,
      }),
    ).toBe('RESTORE');
    expect(
      archiveKicker({
        created_at: '2026-10-09T10:00:00Z',
        username: null,
        archive: counts,
        current: counts,
        photos_skipped: 0,
      }),
    ).toMatch(/^SAVED .*2026/);
    expect(archiveSkippedNote(0)).toBeNull();
    expect(archiveSkippedNote(1)).toBe('1 photo in this backup is missing and will be left out.');
    expect(archiveSkippedNote(2)).toBe('2 photos in this backup are missing and will be left out.');
  });
});
