import { AdminRequestDialog } from './AdminRequestDialog';
import { api } from './api';

/** Asks the server's admins for a temporary password. */
export function ForgotPasswordDialog({
  initialUsername,
  onClose,
}: {
  initialUsername: string;
  onClose: () => void;
}) {
  return (
    <AdminRequestDialog
      title="Forgot password"
      className="forgot-password-dialog"
      label="Username"
      name="username"
      autoComplete="username"
      autoCapitalize="none"
      maxLength={32}
      initialValue={initialUsername}
      emptyError="Enter your username."
      clean={(value) => value.trim().toLowerCase()}
      send={(username) => api.auth.requestPasswordReset(username)}
      submitLabel="Ask admin to reset"
      sentTitle={(username) => `Request sent for @${username}`}
      sentMessage="Your admin will give you a temporary password."
      onClose={onClose}
    />
  );
}
