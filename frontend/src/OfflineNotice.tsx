import { useEffect, useId, useRef, useState } from 'react';
import {
  checkConnectionNow,
  useConnectionCheck,
  type ConnectionCheck,
  type ConnectionState,
  type OfflineCause,
} from './connectionStatus';
import { Icon } from './Icon';
import { useOfflineNotice } from './useOfflineNotice';
import './offlineNotice.css';

/** Changes saved on this phone that have not reached the server yet. */
export interface WaitingToSync {
  workouts: number;
  checkIns: number;
}

const LABELS: Record<OfflineCause, string> = {
  device: 'No internet',
  server: 'Offline',
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function formatLastConnected(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

function NextCheck({ progress }: { progress: ConnectionCheck }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (progress.checking) return <small>Checking…</small>;
  if (progress.nextCheckAt === null) return <small />;
  const seconds = Math.max(1, Math.ceil((progress.nextCheckAt - now) / 1000));
  return <small>Next check in {seconds} s</small>;
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
  const saved = [
    waiting.workouts > 0 && count(waiting.workouts, 'workout', 'workouts'),
    waiting.checkIns > 0 && count(waiting.checkIns, 'check-in', 'check-ins'),
  ].filter(Boolean);
  return (
    <section id={id} className="offline-notice-details" aria-label="Connection details">
      <strong className="offline-notice-title">
        <Icon name="cloud-off" />
        {label}
      </strong>
      <dl>
        <div>
          <dt>Internet</dt>
          <dd data-state={connection.cause === 'server' ? 'ok' : 'bad'}>
            {connection.cause === 'server' ? 'Connected' : 'Not connected'}
          </dd>
        </div>
        {/* With no internet there is no way to know how the server is. */}
        {connection.cause === 'server' && (
          <div>
            <dt>Server</dt>
            <dd data-state="bad">{connection.server === 'down' ? 'Offline' : 'Unreachable'}</dd>
          </div>
        )}
        {connection.lastReachedAt !== null && (
          <div>
            <dt>Last connected</dt>
            <dd>{formatLastConnected(connection.lastReachedAt)}</dd>
          </div>
        )}
        {saved.length > 0 && (
          <div>
            <dt>Saved on this phone</dt>
            <dd>{saved.join(' · ')}</dd>
          </div>
        )}
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
  const label = back ? 'Back online' : LABELS[connection.cause];

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
