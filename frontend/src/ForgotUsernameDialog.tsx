import { AdminRequestDialog } from './AdminRequestDialog';
import { api } from './api';

/**
 * Asks the server's admins for a forgotten username. There is no email to send it to, so the
 * person gives the name on their profile and an admin tells them the username.
 */
export function ForgotUsernameDialog({ onClose }: { onClose: () => void }) {
  return (
    <AdminRequestDialog
      title="Forgot username"
      className="forgot-username-dialog"
      label="Name on your profile"
      name="name"
      autoComplete="name"
      autoCapitalize="words"
      maxLength={80}
      emptyError="Enter your name."
      clean={(value) => value.trim().replace(/\s+/g, ' ')}
      send={(name) => api.auth.requestUsernameReminder(name)}
      submitLabel="Ask admin"
      sentTitle={(name) => `Request sent for ${name}`}
      sentMessage="Your admin will tell you your username."
      onClose={onClose}
    />
  );
}
