import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useOptionalSession } from '../../session/SessionProvider';
import { Button, Card } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import {
  bodyCheckInStatus,
  forgetBodyCheckInCopy,
  localBodyMeasurements,
  setBodyCheckInOwner,
  subscribeBodyCheckIns,
  syncBodyCheckIns,
} from './bodyCheckInQueue';
import { bodyIcons } from './bodyIcons';
import { bodyKeys, refreshBodyMeasurements } from './bodyQueries';

/**
 * The single mounted BodyCheckInSync owner's retry callback, so tapping Retry sync on any tab
 * runs through the one owner and refreshes queries for that session when the queue drains.
 */
let activeRetry: (() => Promise<number>) | null = null;

/** Retries waiting and refused check-ins through the mounted owner (or directly in unit tests). */
export function retryBodyCheckIns(): Promise<number> {
  return activeRetry ? activeRetry() : syncBodyCheckIns(true).catch(() => 0);
}

/**
 * Sends check-ins saved on this phone whenever it can: on sign-in, on reconnecting and on
 * returning to the app, as the web's useBodyMeasurementSync does. Every screen showing check-ins
 * sees a waiting change at once, and the server's copy once the queue has gone through.
 */
export function BodyCheckInSync() {
  const client = useQueryClient();
  const status = useOptionalSession()?.status;
  const userId = status?.kind === 'signed-in' ? status.user.id : null;
  const signedOut = status?.kind === 'signed-out';

  useEffect(() => {
    if (signedOut) forgetBodyCheckInCopy();
  }, [signedOut]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setBodyCheckInOwner(userId);
    const send = (retry = false) =>
      syncBodyCheckIns(retry).then(
        (sent) => {
          if (active && sent > 0 && bodyCheckInStatus().pending === 0)
            void refreshBodyMeasurements(client);
          return sent;
        },
        () => 0,
      );
    activeRetry = () => send(true);
    const unsubscribe = subscribeBodyCheckIns(() => {
      if (!active) return;
      const rows = localBodyMeasurements(userId);
      if (rows) client.setQueryData(bodyKeys.measurements, rows);
    });
    const offline = onlineManager.subscribe((online) => {
      if (online) void send();
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void send();
    });
    void send();
    return () => {
      active = false;
      activeRetry = null;
      unsubscribe();
      offline();
      app.remove();
      setBodyCheckInOwner(null);
    };
  }, [userId, client]);
  return null;
}

/** The queue's count and refusal, kept current. */
export function useBodyCheckInStatus() {
  return useSyncExternalStore(subscribeBodyCheckIns, bodyCheckInStatus);
}

/**
 * Check-ins saved on this phone that the server hasn't confirmed, shown at the top of every tab
 * as the web's body-check-in-sync card is. Reads from the single BodyCheckInSync owner.
 */
export function CheckInSyncCard() {
  const { colors, type, radius } = useTheme();
  const { pending, error } = useBodyCheckInStatus();
  const [retrying, setRetrying] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (pending === 0) return null;

  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    void retryBodyCheckIns().finally(() => {
      if (mounted.current) setRetrying(false);
    });
  };

  return (
    <Card accessibilityLabel="Check-in sync" style={{ gap: 8 }}>
      <View accessibilityLiveRegion="polite" style={styles.row}>
        <Icon name={bodyIcons.cloud} size={18} color={colors.secondary} />
        <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
          {pending} {pending === 1 ? 'check-in' : 'check-ins'} saved on this phone
        </Text>
        {!error && (
          <Text
            style={[
              type.caption,
              styles.badge,
              {
                color: colors.secondary,
                backgroundColor: colors.surface2,
                borderRadius: radius.pill,
              },
            ]}
          >
            Waiting to sync
          </Text>
        )}
      </View>
      {error && (
        <>
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
          <Button
            label="Retry sync"
            variant="secondary"
            size="small"
            loading={retrying}
            onPress={retry}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
