// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BodyCheckInSettingsForm } from './BodyCheckInSettings';
it('previews three options and selects the shared-button variant', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () =>
      root.render(<BodyCheckInSettingsForm value={{ mode: 'weight' }} onChange={change} />),
    );
    const options = host.querySelectorAll<HTMLInputElement>('input[type=radio]');
    expect(options).toHaveLength(3);
    expect(options[0].checked).toBe(true);
    expect(
      host
        .querySelectorAll('.body-check-in-option')[2]
        .querySelectorAll('.body-check-in-preview-head i'),
    ).toHaveLength(1);
    await act(async () => options[2].click());
    expect(change).toHaveBeenCalledExactlyOnceWith({ mode: 'combined-single' });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
