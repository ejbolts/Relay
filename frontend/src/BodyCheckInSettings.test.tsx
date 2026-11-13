// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BodyCheckInSettingsForm } from './BodyCheckInSettings';
it('previews four options and selects the shared-button variant', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(async () =>
      root.render(<BodyCheckInSettingsForm value={{ mode: 'combined' }} onChange={change} />),
    );
    const options = host.querySelectorAll<HTMLInputElement>('input[type=radio]');
    expect(options).toHaveLength(4);
    expect(options[2].checked).toBe(true);
    expect(host.querySelectorAll('.body-check-in-option')[3].querySelectorAll('i')).toHaveLength(1);
    await act(async () => options[3].click());
    expect(change).toHaveBeenCalledExactlyOnceWith({ mode: 'combined-single' });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
