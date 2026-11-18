import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardioEnergyCard } from './CardioEnergyCard';
import type { CardioEnergyPeriod } from './types';

const week: CardioEnergyPeriod = {
  period: 'week',
  start_date: '2026-08-31',
  end_date: '2026-09-06',
  calories_kcal: 1540,
  logged_sessions: 3,
  total_sessions: 4,
  previous_start_date: '2026-08-24',
  previous_end_date: '2026-08-30',
  previous_calories_kcal: 1200,
  average_heart_rate_bpm: 142,
  previous_average_heart_rate_bpm: 138,
  distance_km: 18.25,
  previous_distance_km: 16,
  average_speed_kph: 9.4,
  previous_average_speed_kph: 8.9,
  average_incline_percent: 7.5,
  previous_average_incline_percent: 6,
  average_mets: 7.2,
  previous_average_mets: 6.5,
  elevation_gain_m: 864,
  previous_elevation_gain_m: 650,
  heart_rate_sessions: 3,
  distance_sessions: 3,
  speed_sessions: 2,
  incline_sessions: 2,
  mets_sessions: 3,
  elevation_sessions: 2,
};

describe('cardio energy card', () => {
  it('shows the complete stat grid with compact period controls', () => {
    const markup = renderToStaticMarkup(
      <CardioEnergyCard summaries={[week]} weekEnd="2026-09-06" />,
    );
    expect(markup).toContain('Elevation gain');
    expect(markup).toContain('864');
    expect(markup).toContain('1,540');
    expect(markup).toContain('cardio-stat-unit');
    expect(markup).toContain('Average MET');
    expect(markup).not.toMatch(/METs|MET-min/);
    // Stats show the selected period only, with plain session counts.
    const text = markup.replace(/<!-- -->/g, '');
    expect(text).not.toMatch(/vs prior|prior comparison|sessions? logged/);
    expect(text).toContain('<small>3 of 4 sessions</small>');
    expect(markup).toContain('Fat energy equivalent');
    expect(markup).toContain('About cardio progress');
    expect(markup).toContain('Cardio progress period');
    expect(markup).not.toContain('Show details');
  });
  it('uses singular session labels and keeps unlogged metrics empty', () => {
    const markup = renderToStaticMarkup(
      <CardioEnergyCard
        summaries={[
          {
            ...week,
            total_sessions: 1,
            logged_sessions: 1,
            mets_sessions: 1,
            heart_rate_sessions: 1,
            distance_sessions: 0,
            speed_sessions: 0,
            incline_sessions: 0,
            elevation_sessions: 0,
          },
        ]}
      />,
    );
    const text = markup.replace(/<!-- -->/g, '');
    expect(text).toContain('<small>1 of 1 session</small>');
    expect(text).not.toContain('1 sessions');
    expect(text).toContain('<span>Distance</span><strong>—</strong><small>0 sessions</small>');
  });
  it('leaves elevation empty for a server that does not report it yet', () => {
    const older = { ...week };
    delete older.elevation_gain_m;
    delete older.previous_elevation_gain_m;
    delete older.elevation_sessions;
    const markup = renderToStaticMarkup(<CardioEnergyCard summaries={[older]} />);
    expect(markup.replace(/<!-- -->/g, '')).toContain(
      '<span>Elevation gain</span><strong>—</strong><small>0 sessions</small>',
    );
  });
  it('tolerates a cached dashboard from before calorie tracking', () => {
    expect(renderToStaticMarkup(<CardioEnergyCard summaries={undefined} />)).toBe('');
  });
});
