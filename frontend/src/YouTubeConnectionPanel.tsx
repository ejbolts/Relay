import { useCallback, useEffect, useId, useState } from 'react';
import { api } from './api';
import { InlineConfirmButton } from './InlineConfirmButton';
import type { YouTubeConnection } from './types';
import './YouTubeConnectionPanel.css';

const callbackMessages: Record<string, string> = {
  connected: 'YouTube connected. Your next upload will go to the channel shown below.',
  cancelled: 'Connection cancelled. Your previous connection has not changed.',
  expired: 'That connection link expired or belongs to another sign-in. Try connecting again.',
  permission: 'Allow the requested YouTube permission to upload and check your videos.',
  no_channel: 'Create a channel on YouTube first, then choose Connect YouTube again.',
  busy: 'A video is still processing. Reconnect its original channel, or wait before changing channels.',
  failed: 'Could not connect YouTube. Your previous connection has not changed. Try again.',
};

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(() => {
    const result = new URLSearchParams(window.location.search).get('youtube');
    if (!result) return null;
    const url = new URL(window.location.href);
    url.searchParams.delete('youtube');
    window.history.replaceState(window.history.state, '', url);
    return callbackMessages[result] ?? callbackMessages.failed;
  });

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
  const reconnect = connection?.status === 'reconnect_required';
  const available = connection && !['mock', 'unavailable'].includes(connection.status);

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
            {!connection
              ? 'Checking connection…'
              : connected
                ? 'Connected'
                : reconnect
                  ? 'Reconnect needed'
                  : connection.status === 'mock'
                    ? 'Demo mode'
                    : connection.status === 'unavailable'
                      ? 'Setup needed'
                      : 'Not connected'}
          </span>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
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
          <strong>
            {connection.privacy_status === 'private'
              ? 'Your videos upload as Private'
              : connection.privacy_status === 'unlisted'
                ? 'Your videos upload as Unlisted'
                : 'Your videos upload as Public'}
          </strong>
          {connection.privacy_status === 'private'
            ? 'Only you and people you invite on YouTube can watch. A link alone does not give access.'
            : connection.privacy_status === 'unlisted'
              ? "They aren't listed on your channel's Videos tab. Anyone with the link can watch and share them."
              : 'Anyone can find and watch them.'}
        </p>
      )}
      {available && (
        <p className="youtube-retention-copy">
          Your videos stay on your channel when you disconnect.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="youtube-connection-actions">
        {available && canConnect && (
          <button
            className={connected ? 'secondary' : 'primary'}
            disabled={disabled || working}
            onClick={() => void connect()}
          >
            {working
              ? 'Working…'
              : connected || reconnect
                ? 'Reconnect YouTube'
                : 'Connect YouTube'}
          </button>
        )}
        {connection?.channel_id && (
          <InlineConfirmButton
            label="Disconnect"
            confirmLabel="Disconnect YouTube"
            workingLabel="Disconnecting…"
            className="danger-link"
            disabled={disabled || working || !connection.can_disconnect}
            onConfirm={disconnect}
          />
        )}
        {!connection && (
          <button className="secondary" onClick={() => void refresh()}>
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
