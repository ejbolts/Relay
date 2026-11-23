import { AdminRequestDialog } from './AdminRequestDialog';
import { USERNAME_REMINDER_REQUEST } from './accountHelpRequests';
import { api } from './api';

/**
 * Asks the server's admins for a forgotten username. There is no email to send it to, so the
 * person gives the name on their profile and an admin tells them the username.
 */
export function ForgotUsernameDialog({ onClose }: { onClose: () => void }) {
  return (
    <AdminRequestDialog
      {...USERNAME_REMINDER_REQUEST}
      className="forgot-username-dialog"
      send={(name) => api.auth.requestUsernameReminder(name)}
      onClose={onClose}
    />
  );
}
