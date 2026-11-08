import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrendChart } from './PulseCharts';

describe('TrendChart goal path', () => {
  it('shows both maintenance boundaries and a shaded band within the dated goal', () => {
    const markup = renderToStaticMarkup(
      <TrendChart
        points={[{ date: '2026-11-08', value: 84 }]}
        label="Bodyweight"
        seriesLabel="Weight"
        unit="kg"
        goalPath={{
          startDate: '2026-11-08',
          endDate: '2026-12-31',
          startValue: 84,
          endValue: 84,
          minValue: 82,
          maxValue: 86,
          label: 'Goal 82–86 kg',
        }}
      />,
    );
    expect(markup).toContain('pulse-chart-goal-band');
    expect(markup).toContain('Goal 82–86 kg');
    const band = markup.match(/<rect class="pulse-chart-goal-band"[^>]*height="([\d.]+)"/);
    expect(Number(band?.[1])).toBeGreaterThan(0);
    expect(markup.match(/<line x1="40"/g)).toHaveLength(2);
  });
  it('extends the x-axis to a future goal date and draws the dotted goal line to it', () => {
    const markup = renderToStaticMarkup(
      <TrendChart
        points={[
          { date: '2026-08-01', value: 86.5 },
          { date: '2026-09-15', value: 83.5 },
          { date: '2026-11-01', value: 84 },
        ]}
        label="Bodyweight"
        seriesLabel="7-day average"
        unit="kg"
        goalPath={{
          startDate: '2026-10-20',
          startValue: 83.7,
          endDate: '2026-12-31',
          endValue: 85,
          label: 'Goal 85 kg',
        }}
      />,
    );

    // The axis now runs past the last check-in to the December target.
    expect(markup).toContain('>Dec</text>');
    // Fallback width 340 minus the 12px right padding: the line ends at the plot's right edge.
    expect(markup).toMatch(
      /<g class="pulse-chart-goal pulse-chart-goal-path"><line x1="[\d.]+" y1="[\d.]+" x2="328"/,
    );
    expect(markup).toContain('Goal 85 kg');
  });
});
