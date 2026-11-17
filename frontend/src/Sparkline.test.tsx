import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sparkline } from './PulseCharts';

describe('compact chart axes', () => {
  it('draws exactly three numbered guides with a correctly scaled line', () => {
    const markup = renderToStaticMarkup(
      <Sparkline values={[83, 84, 85]} label="Bodyweight in kilograms" height={70} yAxis />,
    );
    expect(markup.match(/<line /g)).toHaveLength(3);
    expect(markup.match(/<text /g)).toHaveLength(3);
    for (const value of [83, 84, 85]) expect(markup).toContain(`>${value}</text>`);
    expect(markup).toContain('cy="8"');
    expect(markup).toContain('height="70"');
  });

  it.each([
    [84, 84],
    [83.31, 83.32],
  ])('keeps flat or very small changes finite with distinct labels: %s', (...values) => {
    const markup = renderToStaticMarkup(
      <Sparkline values={values} label="Weight" height={70} yAxis />,
    );
    const labels = [...markup.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]);
    expect(new Set(labels).size).toBe(3);
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it('keeps the other sparklines minimal and avoids invented axes with insufficient data', () => {
    for (const props of [
      { values: [1, 2] },
      { values: [], yAxis: true },
      { values: [84], yAxis: true },
    ]) {
      expect(renderToStaticMarkup(<Sparkline {...props} label="Weight" />)).not.toContain('<text');
    }
  });
});
