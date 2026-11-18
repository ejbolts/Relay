import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BodyCompositionScreen } from './App';
import { bodyweightEntryPlaceholder } from './bodyTrend';
import type { BodyMeasurement } from './types';

describe('BodyCompositionScreen', () => {
  it('uses the most recent bodyweight as the new check-in placeholder', () => {
    const measurements: BodyMeasurement[] = [
      {
        id: 'latest',
        measurement_date: '2026-09-02',
        weight_kg: 84.2,
        body_fat_pct: 13,
        notes: null,
        is_sample: false,
        created_at: '2026-09-02T01:00:00Z',
      },
      {
        id: 'previous',
        measurement_date: '2026-09-01',
        weight_kg: 84,
        body_fat_pct: 13,
        notes: null,
        is_sample: false,
        created_at: '2026-09-01T01:00:00Z',
      },
    ];

    const markup = renderToStaticMarkup(
      <BodyCompositionScreen
        measurements={measurements}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDataChange={vi.fn()}
      />,
    );

    expect(bodyweightEntryPlaceholder(measurements)).toBe('84.2');
    expect(markup).toContain('<strong>84.2 kg</strong>');
    expect(markup).toContain('aria-label="Body composition range"');
    expect(markup).toContain(
      'aria-selected="true" aria-label="3 months" class="active">3M</button>',
    );
    expect(markup).toContain('7-day average');
    expect(markup).toContain('Set a goal');
    expect(markup).not.toContain('aria-label="Add bodyweight"');
    expect(markup).toContain('Log weigh-in');
    // Logging comes before the chart, so it needs no scrolling.
    expect(markup.indexOf('Log weigh-in')).toBeLessThan(markup.indexOf('body-trend-panel'));
    expect(markup).toContain('<h1>Body</h1>');
    expect(markup).toContain('role="tab" aria-selected="true">Daily</button>');
    expect(markup).toContain('role="tab" aria-selected="false">Avg Week</button>');
    expect(markup).toContain('role="tab" aria-selected="false">Avg Monthly</button>');
  });

  it('uses the saved trend statistic for history without a trend summary', () => {
    const measurements: BodyMeasurement[] = [
      {
        id: 'latest',
        measurement_date: '2026-09-02',
        weight_kg: 84.2,
        body_fat_pct: null,
        notes: null,
        is_sample: false,
        created_at: '2026-09-02T01:00:00Z',
      },
      {
        id: 'previous',
        measurement_date: '2026-09-01',
        weight_kg: 83.8,
        body_fat_pct: null,
        notes: null,
        is_sample: false,
        created_at: '2026-09-01T01:00:00Z',
      },
    ];

    const markup = renderToStaticMarkup(
      <BodyCompositionScreen
        measurements={measurements}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDataChange={vi.fn()}
        trendPreference={{ duration: '14d', statistic: 'median' }}
      />,
    );

    expect(markup).not.toContain('Bodyweight trend statistic');
    expect(markup).not.toContain('Bodyweight trend duration');
    expect(markup).not.toContain('body-trend-stat');
    expect(markup).toContain('role="tab" aria-selected="false">Median Week</button>');
    expect(markup).toContain('role="tab" aria-selected="false">Median Monthly</button>');
  });
});
