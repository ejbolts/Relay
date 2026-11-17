import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const COPY_NOTICE_MS = 5000;

/** A stable account identifier that someone else can paste into people search. */
export function ProfileAccountId({ accountId }: { accountId: string }) {
  const value = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<{ id: string; message: string; serial: number } | null>(
    null,
  );
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), COPY_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [status]);
  function notify(message: string) {
    setStatus((current) => ({ id: accountId, message, serial: (current?.serial ?? 0) + 1 }));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId);
      notify('UUID copied.');
    } catch {
      if (value.current) {
        const range = document.createRange();
        range.selectNodeContents(value.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      notify('UUID selected. Use your device’s copy action.');
    }
  }
  return (
    <div className="profile-account-id">
      <span className="profile-account-id-label">Account UUID</span>
      <div className="profile-account-id-row">
        <code ref={value}>{accountId}</code>
        <button type="button" className="text-link" onClick={() => void copy()}>
          Copy UUID
        </button>
      </div>
      {status?.id === accountId &&
        createPortal(
          <div
            key={status.serial}
            className="undo-toast top-toast"
            role="status"
            aria-atomic="true"
            style={{ '--undo-toast-duration': `${COPY_NOTICE_MS}ms` } as CSSProperties}
          >
            <span>{status.message}</span>
            <button
              type="button"
              className="undo-toast-close"
              aria-label="Dismiss UUID notification"
              onClick={() => setStatus(null)}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
