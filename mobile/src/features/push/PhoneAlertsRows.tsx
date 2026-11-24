import { useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '../../ui/components';
import { Switch } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon, type IconPair } from '../../ui/Icon';
import { showToast, toastAccount } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Row } from '../settings/SettingsList';
import {
  disableRemotePush,
  enableRemotePush,
  remotePushStatus,
  sendTestAlert,
  subscribeRemotePush,
  unavailableMessage,
} from './remotePush';

const icons = {
  phone: { sf: 'iphone.radiowaves.left.and.right', md: 'notifications-active' },
  test: { sf: 'paperplane', md: 'send' },
  info: { sf: 'questionmark.circle', md: 'help-outline' },
} satisfies Record<string, IconPair>;

/**
 * The web's "Phone alerts" switch (Settings > Alerts), for this phone: alerts the server sends,
 * such as Still working out? for a workout on another device or a saved workout, reach the phone
 * while Relay is closed. Where the build can't receive them the switch is off and disabled, with
 * a (?) saying why. The rows share this state; the error goes below their section.
 */
export function usePhoneAlerts() {
  const status = useSyncExternalStore(subscribeRemotePush, remotePushStatus);
  const [busy, setBusy] = useState<'switch' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'switch' | 'test', action: () => Promise<void>, done: string) {
    if (busy) return;
    const account = toastAccount();
    setBusy(kind);
    setError(null);
    try {
      await action();
      showToast(done, undefined, { account });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  return {
    status,
    enabled: status.kind === 'enabled',
    busy,
    error,
    toggle: (on: boolean) =>
      run(
        'switch',
        on ? enableRemotePush : disableRemotePush,
        on ? 'Phone alerts on' : 'Phone alerts off',
      ),
    test: () => run('test', sendTestAlert, 'Test alert sent'),
  };
}

type PhoneAlerts = ReturnType<typeof usePhoneAlerts>;

export function PhoneAlertsRow({ alerts }: { alerts: PhoneAlerts }) {
  const { colors } = useTheme();
  const { status, enabled, busy } = alerts;
  const reason = status.kind === 'unavailable' ? unavailableMessage(status.reason) : null;
  return (
    <Row
      label="Phone alerts"
      icon={icons.phone}
      accessory={
        <View style={styles.accessory}>
          {reason && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Why phone alerts are unavailable"
              onPress={() => {
                haptics.tap();
                Alert.alert('Phone alerts', reason);
              }}
              style={({ pressed }) => [styles.help, pressed && { opacity: 0.6 }]}
            >
              <Icon name={icons.info} size={18} color={colors.muted} />
            </Pressable>
          )}
          <Switch
            accessibilityLabel="Phone alerts"
            value={enabled}
            disabled={status.kind === 'checking' || status.kind === 'unavailable' || !!busy}
            onChange={(on) => void alerts.toggle(on)}
          />
        </View>
      }
    />
  );
}

export function TestAlertRow({ alerts }: { alerts: PhoneAlerts }) {
  return (
    <Row
      label="Send test alert"
      icon={icons.test}
      chevron={false}
      busy={alerts.busy === 'test'}
      disabled={!!alerts.busy}
      onPress={() => void alerts.test()}
    />
  );
}

const styles = StyleSheet.create({
  accessory: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  help: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
