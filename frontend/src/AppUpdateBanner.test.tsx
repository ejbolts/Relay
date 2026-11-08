import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppUpdateBanner } from './AppUpdateBanner';

describe('AppUpdateBanner', () => {
  it('offers an optional update, or says one is needed before saving', () => {
    const optional = renderToStaticMarkup(
      <AppUpdateBanner version="1.3.0" refreshing={false} error={null} onRefresh={vi.fn()} />,
    );
    expect(optional).toContain('Version 1.3.0 is available');
    expect(optional).toContain('Keep logging, or refresh to update.');

    const required = renderToStaticMarkup(
      <AppUpdateBanner required refreshing={false} error={null} onRefresh={vi.fn()} />,
    );
    expect(required).toContain('Update needed to save');
    expect(required).toContain('Refresh to update. Workouts in progress stay on this device.');
  });
});
