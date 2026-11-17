// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import metadata from '../release.json';
import { AppEditionBadge } from './AppEditionBadge';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import type { useReleaseAnnouncement } from './useReleaseAnnouncement';

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('web beta badge', () => {
  it('shows the running version and opens What’s new', () => {
    const show = vi.fn();
    const announcement = { show } as unknown as ReturnType<typeof useReleaseAnnouncement>;
    act(() =>
      root.render(
        <ReleaseAnnouncementContext.Provider value={announcement}>
          <AppEditionBadge />
        </ReleaseAnnouncementContext.Provider>,
      ),
    );
    const badge = container.querySelector('button.app-edition-badge')!;
    expect(badge.textContent).toBe(`Web beta v${metadata.version}`);
    expect(badge.getAttribute('aria-label')).toBe(
      `Relay web beta, version ${metadata.version}. What's new`,
    );
    act(() => (badge as HTMLButtonElement).click());
    expect(show).toHaveBeenCalledOnce();
  });

  it('is a plain label without the release announcement', () => {
    act(() => root.render(<AppEditionBadge />));
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.app-edition-badge')?.textContent).toBe(
      `Web beta v${metadata.version}`,
    );
  });
});
