import { AdminRequestDialog } from './AdminRequestDialog';
import { PASSWORD_RESET_REQUEST } from './accountHelpRequests';
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
      {...PASSWORD_RESET_REQUEST}
      className="forgot-password-dialog"
      initialValue={initialUsername}
      send={(username) => api.auth.requestPasswordReset(username)}
      onClose={onClose}
    />
  );
}
