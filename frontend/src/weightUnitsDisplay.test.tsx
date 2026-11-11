import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BodyCompositionScreen } from './App';
import { PrToast } from './PrToast';
import { DashboardQuickBodyweight } from './TodayScreen';
import { TrainingPreferencesContext } from './trainingPreferencesContext';
import { WeightInput } from './WeightInput';

function renderPounds(children: ReactNode) {
  return renderToStaticMarkup(
    <TrainingPreferencesContext.Provider
      value={{
        preferences: {
          preferred_weight_unit: 'lb',
          week_start: 'monday',
          zone2_goal_minutes: 150,
          weekly_muscle_set_goal: 10,
        },
        error: null,
        applySaved: vi.fn(),
      }}
    >
      {children}
    </TrainingPreferencesContext.Provider>,
  );
}

describe('weight display preference across personal screens', () => {
  it('shows pound check-in controls with converted values and accessible labels', () => {
    const markup = renderPounds(
      <DashboardQuickBodyweight
        latestBodyweight={84.2}
        priorBodyweight={84}
        todayBodyweight={84.2}
        onSave={vi.fn()}
      />,
    );
    expect(markup).toContain('aria-label="Prior: 185.2 lb; Saved today: 185.6 lb"');
    expect(markup).toMatch(/class="quick-check-in-change"[^>]*>.*?<\/svg>0\.4<\/span>/);
    expect(markup).toMatch(/class="quick-check-in-today">.*?<\/svg>185\.6 lb<\/span>/);
    expect(markup).toContain('value="185.63"');
    expect(markup).toContain('Bodyweight in pounds');
    expect(markup).toContain('Increase by 0.1 lb');
    expect(markup).not.toContain('kg');
  });

  it('converts Body history and median summaries while retaining the selected trend controls', () => {
    const measurements = [84.2, 83.8].map((weight_kg, index) => ({
      id: String(index),
      measurement_date: `2026-09-0${2 - index}`,
      weight_kg,
      body_fat_pct: null,
      notes: null,
      is_sample: false,
      created_at: '2026-09-02T01:00:00Z',
    }));
    const markup = renderPounds(
      <BodyCompositionScreen
        measurements={measurements}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDataChange={vi.fn()}
        trendPreference={{ duration: '14d', statistic: 'median' }}
      />,
    );
    expect(markup).toContain('<strong>185.63 lb</strong>');
    expect(markup).toContain('<strong>185.2 lb</strong>');
    expect(markup).toContain('<option value="median" selected="">Median</option>');
    expect(markup).toContain('<option value="14d" selected="">14 days</option>');
    expect(markup).not.toContain(' kg');
    expect(measurements.map((item) => item.weight_kg)).toEqual([84.2, 83.8]);
  });

  it('uses the same preferred unit in set inputs and live PR popups', () => {
    const markup = renderPounds(
      <>
        <WeightInput weightKg={100} onWeightChange={vi.fn()} aria-label="Weight pounds" />
        <PrToast
          entries={[{ exercise: 'Bench', labels: ['Weight PR'], reps: 5, weightKg: 100 }]}
          onClose={vi.fn()}
        />
      </>,
    );
    expect(markup).toContain('value="220.46"');
    expect(markup).toContain('5 reps at 220.46 lb');
    expect(markup).not.toContain(' kg');
  });

  it('falls back to kilograms before or without a saved preference', () => {
    const markup = renderToStaticMarkup(
      <WeightInput weightKg={84.237123} onWeightChange={vi.fn()} />,
    );
    expect(markup).toContain('value="84.24"');
  });
});
