import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CachedTabPanel } from './CachedTabPanel';

describe('CachedTabPanel', () => {
  it('keeps inactive screen content mounted but hidden', () => {
    const markup = renderToStaticMarkup(
      <CachedTabPanel active={false}>
        <button>Previous screen action</button>
      </CachedTabPanel>,
    );

    expect(markup).toContain('hidden=""');
    expect(markup).toContain('Previous screen action');
  });

  it('reveals the cached content when it becomes active again', () => {
    const markup = renderToStaticMarkup(
      <CachedTabPanel active>
        <span>Ready</span>
      </CachedTabPanel>,
    );

    expect(markup).not.toContain('hidden=""');
    expect(markup).toContain('Ready');
  });
});
