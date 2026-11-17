import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';

describe('SwipeToDeleteSetRow', () => {
  it('allows an open child overlay to escape the swipe clipping container', () => {
    const markup = renderToStaticMarkup(
      <SwipeToDeleteSetRow label="set 1" overlayOpen onDelete={vi.fn()}>
        <div>Set actions</div>
      </SwipeToDeleteSetRow>,
    );

    expect(markup).toContain('has-open-overlay');
    expect(markup).toContain('Set actions');
  });
});
