import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardioMetricsEditor } from './CardioMetricsEditor';
import type { CardioSession } from './types';
import { prettyDate } from './appShared';

vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));

beforeEach(() => vi.stubGlobal('document', { body: {} }));
afterEach(() => vi.unstubAllGlobals());

describe('cardio metrics editor', () => {
  it('shows every optional cardio performance field', () => {
    const session = {
      id: 'session-1',
      session_date: '2026-09-07',
      activity_type: 'Incline treadmill walking',
      duration_minutes: 30,
      calories_kcal: 350,
      average_heart_rate_bpm: 142,
      distance_km: 4.2,
      average_speed_kph: 8.4,
      incline_percent: 8,
      average_mets: 7.5,
      estimated_mets: 9.1,
      estimated_elevation_gain_m: 335,
      intensity: null,
      zone: 'Zone 2',
      qualifies_zone2: true,
      notes: null,
      source_workout_id: 'workout-1',
      created_at: '2026-09-07T00:00:00Z',
      updated_at: '2026-09-07T00:00:00Z',
    } satisfies CardioSession;

    const markup = renderToStaticMarkup(
      <CardioMetricsEditor session={session} onClose={vi.fn()} onSave={vi.fn()} />,
    );

    expect(markup).toContain('Cardio metrics');
    // The session's date reads like the rest of the app, not as 2026-09-07.
    expect(markup).toContain(`· ${prettyDate('2026-09-07')} ·`);
    expect(markup).not.toContain('2026-09-07');
    expect(markup).toContain('Calories (kcal)');
    expect(markup).toContain('Average HR (bpm)');
    expect(markup).toContain('Distance (km)');
    expect(markup).toContain('Average speed (km/h)');
    expect(markup).toContain('Incline (%)');
    expect(markup).toContain('Elevation gain (m)');
    expect(markup).toContain('Average MET');
    expect(markup).not.toMatch(/METs|MET-min/);
    // The logged MET stays in the field; blank fields show what will be calculated.
    expect(markup).toContain('value="7.5"');
    expect(markup).toContain('placeholder="Auto · 9.1"');
    expect(markup).toContain('placeholder="Auto · 335"');
  });
});
