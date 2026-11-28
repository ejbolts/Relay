import { useEffect, useId, useRef, useState } from 'react';
import {
  connectionDetailRows,
  nextCheckText,
  offlineNoticeLabel,
  type ConnectionCheck,
  type ConnectionState,
  type WaitingToSync,
} from './connectionMonitor';
import { checkConnectionNow, useConnectionCheck } from './connectionStatus';
import { Icon } from './Icon';
import { useOfflineNotice } from './useOfflineNotice';
import './offlineNotice.css';

export type { WaitingToSync } from './connectionMonitor';

function NextCheck({ progress }: { progress: ConnectionCheck }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const text = nextCheckText(progress, now);
  return text ? <small>{text}</small> : <small />;
}

function Details({
  id,
  label,
  connection,
  waiting,
}: {
  id: string;
  label: string;
  connection: ConnectionState;
  waiting: WaitingToSync;
}) {
  const progress = useConnectionCheck();
  return (
    <section id={id} className="offline-notice-details" aria-label="Connection details">
      <strong className="offline-notice-title">
        <Icon name="cloud-off" />
        {label}
      </strong>
      <dl>
        {connectionDetailRows(connection, waiting).map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd data-state={row.state}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="offline-notice-actions">
        <NextCheck progress={progress} />
        <button
          type="button"
          className="pulse-button primary"
          disabled={progress.checking}
          onClick={checkConnectionNow}
        >
          <Icon name="reset" />
          Try now
        </button>
      </div>
    </section>
  );
}

/**
 * Floats over every screen once an outage has lasted, without changing the page layout. It says
 * what is wrong, shrinks to an icon that opens the details, and confirms when the app is back.
 */
export function OfflineNotice({ waiting }: { waiting: WaitingToSync }) {
  const { connection, visible, minimised, open, setOpen } = useOfflineNotice();
  const detailsId = useId();
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, setOpen]);

  if (!visible) return null;
  const back = connection.phase === 'back';
  const label = offlineNoticeLabel(connection);

  return (
    <aside
      ref={root}
      className="offline-notice"
      data-phase={connection.phase}
      data-minimised={minimised ? 'true' : undefined}
      aria-label="Connection"
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {label}
      </p>
      {back ? (
        <div className="offline-notice-pill">
          <Icon name="check" />
          <span className="offline-notice-label">{label}</span>
        </div>
      ) : (
        <button
          type="button"
          className="offline-notice-pill"
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => setOpen(!open)}
        >
          <Icon name="cloud-off" />
          <span className="offline-notice-label" aria-hidden="true">
            {label}
          </span>
        </button>
      )}
      {open && <Details id={detailsId} label={label} connection={connection} waiting={waiting} />}
    </aside>
  );
}
