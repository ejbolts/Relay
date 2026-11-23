import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiGet } from '../../data/api';
import { useUser } from '../../session/SessionProvider';
import { Row, Section } from '../settings/SettingsList';
import { adminIcons } from './icons';
import { adminRoutes } from './routes';

/** Settings' Admin section, after Account, shown only to administrators. */
export function AdminSettingsSection() {
  const user = useUser();
  if (!user.is_admin) return null;
  return <AdminRow />;
}

function AdminRow() {
  const router = useRouter();
  const summary = useQuery({
    queryKey: ['admin', 'feedback-summary'],
    queryFn: ({ signal }) => apiGet<{ open: number }>('/api/admin/feedback/summary', signal),
  });
  const open = summary.data?.open ?? 0;
  return (
    <Section title="Admin">
      <Row
        label="Admin console"
        icon={adminIcons.admin}
        iconTint="#475569"
        value={open > 0 ? `${open} feedback` : null}
        onPress={() => router.push(adminRoutes.console)}
      />
    </Section>
  );
}
