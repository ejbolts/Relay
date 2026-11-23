import { useCallback, useEffect, useId, useState } from 'react';
import { api } from './api';
import { InlineConfirmButton } from './InlineConfirmButton';
import { Toast } from './Toast';
import type { YouTubeConnection } from './types';
import {
  youtubeAvailable,
  youtubeCallbackResult,
  youtubeConnectLabel,
  youtubePrivacyCopy,
  youtubeStatusLabel,
} from './videoSessions';
import './YouTubeConnectionPanel.css';

export function YouTubeConnectionPanel({
  disabled = false,
  canConnect = true,
  onChange,
}: {
  disabled?: boolean;
  canConnect?: boolean;
  onChange?: (connection: YouTubeConnection | null) => void;
}) {
  const titleId = useId();
  const [connection, setConnection] = useState<YouTubeConnection | null>(null);
  const [working, setWorking] = useState(false);
  const [callback] = useState(() => {
    const result = new URLSearchParams(window.location.search).get('youtube');
    if (!result) return null;
    const url = new URL(window.location.href);
    url.searchParams.delete('youtube');
    window.history.replaceState(window.history.state, '', url);
    return youtubeCallbackResult(result);
  });
  const [error, setError] = useState<string | null>(null);
  // A failed return from Google stays until the next attempt; connection checks don't clear it.
  const [callbackError, setCallbackError] = useState(
    callback && !callback.confirmation ? callback.message : null,
  );
  const [notice, setNotice] = useState(callback?.confirmation ? callback.message : null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.youtube.connection();
      setConnection(next);
      onChange?.(next);
      setError(null);
    } catch (reason) {
      setConnection(null);
      onChange?.(null);
      setError(reason instanceof Error ? reason.message : 'Could not check YouTube connection.');
    }
  }, [onChange]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('youtube-connection-change', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('youtube-connection-change', onFocus);
    };
  }, [refresh]);

  async function connect() {
    setWorking(true);
    setError(null);
    setCallbackError(null);
    try {
      const { url } = await api.youtube.connect();
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not connect YouTube.');
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      const next = await api.youtube.disconnect();
      setConnection(next);
      onChange?.(next);
      setNotice(next.message);
      window.dispatchEvent(new Event('youtube-connection-change'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not disconnect YouTube.');
    } finally {
      setWorking(false);
    }
  }

  const connected = connection?.status === 'connected';
  const available = connection && youtubeAvailable(connection);
  const privacy = connection ? youtubePrivacyCopy(connection.privacy_status) : null;

  return (
    <section className="youtube-connection card" aria-labelledby={titleId}>
      <div className="youtube-connection-heading">
        <span className="youtube-connection-icon" aria-hidden="true">
          <svg viewBox="0 0 28 20">
            <rect x="1" y="1" width="26" height="18" rx="5" />
            <path d="m11 6 7 4-7 4Z" />
          </svg>
        </span>
        <div>
          <h2 id={titleId}>Your YouTube channel</h2>
          <span className={`youtube-connection-status ${connected ? 'connected' : ''}`}>
            {youtubeStatusLabel(connection)}
          </span>
        </div>
      </div>
      {notice && <Toast id={notice} message={notice} onDismiss={() => setNotice(null)} />}
      {connection?.channel_title && (
        <a
          className="youtube-channel-name"
          href={connection.channel_url ?? undefined}
          target="_blank"
          rel="noreferrer"
        >
          {connection.channel_title}
        </a>
      )}
      {connection && <p>{connection.message}</p>}
      {available && (
        <p className="youtube-privacy-copy">
          <strong>{privacy?.title}</strong>
          {privacy?.detail}
        </p>
      )}
      {available && (
        <p className="youtube-retention-copy">
          Your videos stay on your channel when you disconnect.
        </p>
      )}
      {(error ?? callbackError) && (
        <p className="error-box" role="alert">
          {error ?? callbackError}
        </p>
      )}
      <div className="youtube-connection-actions">
        {available && canConnect && (
          <button
            type="button"
            className={`pulse-button ${connected ? 'secondary' : 'primary'} block`}
            disabled={disabled || working}
            onClick={() => void connect()}
          >
            {working ? 'Working…' : youtubeConnectLabel(connection)}
          </button>
        )}
        {connection?.channel_id && (
          <InlineConfirmButton
            label="Disconnect"
            confirmLabel="Disconnect YouTube"
            workingLabel="Disconnecting…"
            className="pulse-button danger-soft"
            size="default"
            disabled={disabled || working || !connection.can_disconnect}
            onConfirm={disconnect}
          />
        )}
        {!connection && (
          <button type="button" className="pulse-button block" onClick={() => void refresh()}>
            Try again
          </button>
        )}
      </div>
      {connection && !connection.can_disconnect && (
        <small>Disconnect is available after video processing finishes.</small>
      )}
      {available && !connected && canConnect && (
        <small>Choose your Google account and YouTube channel. No API keys or files needed.</small>
      )}
      {available && !canConnect && (
        <small>
          Video uploads are disabled for this account. Ask the administrator to enable them.
        </small>
      )}
    </section>
  );
}
