import { useRef } from 'react';
import { useToast } from './Toast';

/** A stable account identifier that someone else can paste into people search. */
export function ProfileAccountId({ accountId }: { accountId: string }) {
  const value = useRef<HTMLElement>(null);
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId);
      toast.show('UUID copied.');
    } catch {
      if (value.current) {
        const range = document.createRange();
        range.selectNodeContents(value.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      toast.show('UUID selected. Use your device’s copy action.');
    }
  }
  return (
    <div className="profile-account-id">
      <span className="profile-account-id-label">Account UUID</span>
      <div className="profile-account-id-row">
        <code ref={value}>{accountId}</code>
        <button type="button" className="pulse-button link small" onClick={() => void copy()}>
          Copy UUID
        </button>
      </div>
    </div>
  );
}
