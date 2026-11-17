import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackgroundActivityBar } from './BackgroundActivityBar';

describe('BackgroundActivityBar', () => {
  it('announces the current background task', () => {
    const markup = renderToStaticMarkup(<BackgroundActivityBar label="Deleting workout…" />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Deleting workout…');
    expect(markup).toContain('background-activity-spinner');
  });

  it('does not render without an active task', () => {
    expect(renderToStaticMarkup(<BackgroundActivityBar label={null} />)).toBe('');
  });
});
