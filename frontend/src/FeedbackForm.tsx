import { useId, useRef, useState } from 'react';
import { api } from './api';
import { StatusToast } from './StatusToast';

export function FeedbackForm({
  optional = false,
  allowAnother = false,
  onSendingChange,
}: {
  optional?: boolean;
  allowAnother?: boolean;
  onSendingChange?: (sending: boolean) => void;
}) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sentToast, setSentToast] = useState(0);
  const submissionId = useRef<string | null>(null);
  const fieldId = useId();

  async function sendFeedback() {
    if (!message.trim() || status !== 'idle') return;
    setStatus('sending');
    setError(null);
    onSendingChange?.(true);
    try {
      submissionId.current ??= crypto.randomUUID();
      await api.submitFeedback(message.trim(), submissionId.current);
      if (allowAnother) {
        // Settings keeps the form open for the next message and confirms in the toast.
        setMessage('');
        submissionId.current = null;
        setStatus('idle');
        setSentToast((count) => count + 1);
      } else {
        setStatus('sent');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send feedback. Try again.');
      setStatus('idle');
    } finally {
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
      {status === 'sent' ? (
        <>
          <p role="status" className="feedback-form-success">
            Thanks! Your feedback has been sent.
          </p>
        </>
      ) : (
        <>
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
            disabled={status === 'sending'}
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
          <button
            type="submit"
            className="profile-secondary"
            disabled={!message.trim() || status === 'sending'}
          >
            {status === 'sending' ? 'Sending…' : 'Send feedback'}
          </button>
        </>
      )}
      <small id={`${fieldId}-privacy`}>Please leave out passwords and sensitive information.</small>
      {sentToast > 0 && (
        <StatusToast
          key={sentToast}
          message="Thanks! Your feedback has been sent."
          onClose={() => setSentToast(0)}
        />
      )}
    </form>
  );
}
