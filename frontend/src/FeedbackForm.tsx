import { useId, useRef, useState } from 'react';
import { api } from './api';
import { useToast } from './Toast';

export function FeedbackForm({
  optional = false,
  onSendingChange,
}: {
  optional?: boolean;
  /** Ignored: the form always clears for the next message and confirms in a toast. */
  allowAnother?: boolean;
  onSendingChange?: (sending: boolean) => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionId = useRef<string | null>(null);
  const fieldId = useId();
  const toast = useToast();

  async function sendFeedback() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    onSendingChange?.(true);
    try {
      submissionId.current ??= crypto.randomUUID();
      await api.submitFeedback(message.trim(), submissionId.current);
      setMessage('');
      submissionId.current = null;
      toast.show('Thanks! Your feedback has been sent.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send feedback. Try again.');
    } finally {
      setSending(false);
      onSendingChange?.(false);
    }
  }

  return (
    <form
      className="feedback-form"
      onSubmit={(event) => {
        event.preventDefault();
        void sendFeedback();
      }}
    >
      <label htmlFor={fieldId}>
        {optional ? 'Your feedback' : 'Your feedback or feature request'}{' '}
        {optional && <span>(optional)</span>}
      </label>
      <textarea
        id={fieldId}
        value={message}
        maxLength={2000}
        rows={3}
        placeholder="Describe a problem, share feedback or suggest a feature…"
        disabled={sending}
        onChange={(event) => {
          setMessage(event.target.value);
          setError(null);
          submissionId.current = null;
        }}
        aria-describedby={`${fieldId}-privacy`}
      />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="profile-secondary" disabled={!message.trim() || sending}>
        {sending ? 'Sending…' : 'Send feedback'}
      </button>
      <small id={`${fieldId}-privacy`}>Please leave out passwords and sensitive information.</small>
    </form>
  );
}
