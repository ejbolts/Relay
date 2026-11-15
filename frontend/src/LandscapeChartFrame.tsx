import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Icon } from './Icon';

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

export function LandscapeChartFrame({
  title,
  controls,
  children,
}: {
  title: string;
  controls: ReactNode;
  children: (expanded: boolean, close: () => void) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    expandedRef.current = false;
    setExpanded(false);
  }, []);

  const focusToggle = useCallback(() => {
    // The portal remounts the toggle; use its current node when restoring the compact view.
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  function unlockOrientation() {
    try {
      (screen.orientation as LockableScreenOrientation).unlock?.();
    } catch {
      // Orientation locking is optional, so the visual fallback can still close.
    }
  }

  async function enterLandscape() {
    // Mount the portal synchronously while the click still grants fullscreen permission.
    expandedRef.current = true;
    flushSync(() => setExpanded(true));
    const viewer = viewerRef.current;
    try {
      if (viewer?.requestFullscreen && !document.fullscreenElement) {
        // Fullscreen browsers override the target's transform. Rotate its child instead.
        await viewer.requestFullscreen();
      }
    } catch {
      // The fixed landscape layout below is the fallback on browsers without fullscreen support.
    }
    if (!expandedRef.current || viewerRef.current !== viewer) {
      if (document.fullscreenElement === viewer) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }
    try {
      await (screen.orientation as LockableScreenOrientation).lock?.('landscape');
    } catch {
      // Orientation locking is not supported on every mobile browser.
    }
    if (!expandedRef.current || viewerRef.current !== viewer) unlockOrientation();
  }

  useEffect(() => {
    if (!expanded) return;
    const viewer = viewerRef.current;
    document.body.classList.add('chart-fullscreen-open');
    focusToggle();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      } else if (event.key === 'Tab' && viewer) {
        const focusable = viewer.querySelectorAll<HTMLElement>('button, [tabindex="0"]');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !viewer.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !viewer.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) close();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.body.classList.remove('chart-fullscreen-open');
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      expandedRef.current = false;
      unlockOrientation();
      if (document.fullscreenElement === viewer) {
        void document.exitFullscreen().catch(() => undefined);
      }
      focusToggle();
    };
  }, [expanded, close, focusToggle]);

  const frame = (
    <div className={`landscape-chart-frame ${expanded ? 'landscape-chart-expanded' : ''}`}>
      <div className="landscape-chart-toolbar">
        <strong className="landscape-chart-title">{title}</strong>
        <div className="landscape-chart-options">{controls}</div>
        <button
          type="button"
          ref={toggleRef}
          className="landscape-chart-toggle"
          aria-label={
            expanded ? `Exit full-screen ${title}` : `View ${title} full screen in landscape`
          }
          onClick={() => (expanded ? close() : void enterLandscape())}
        >
          <span aria-hidden="true">
            <Icon name={expanded ? 'close' : 'expand'} />
          </span>
          {expanded ? 'Exit' : 'Landscape'}
        </button>
      </div>
      <div className="landscape-chart-content">{children(expanded, close)}</div>
    </div>
  );

  return expanded
    ? createPortal(
        <div
          ref={viewerRef}
          className="landscape-chart-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} full screen`}
        >
          {frame}
        </div>,
        document.body,
      )
    : frame;
}
