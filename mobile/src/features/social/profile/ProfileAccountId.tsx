import * as Clipboard from 'expo-clipboard';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../ui/components';
import { showToast, toastAccount } from '../../../ui/Toast';
import { useTheme } from '../../../ui/theme';

/**
 * A stable account identifier that someone else can paste into people search, matching the web's
 * `ProfileAccountId`.
 */
export function ProfileAccountId({ accountId }: { accountId: string }) {
  const { colors, type } = useTheme();
  async function copy() {
    const account = toastAccount();
    try {
      await Clipboard.setStringAsync(accountId);
      showToast('UUID copied.', undefined, { account });
    } catch {
      showToast('Could not copy the UUID.', undefined, { account, variant: 'error' });
    }
  }
  return (
    <View style={[styles.container, { borderTopColor: colors.line }]}>
      <Text style={[type.caption, { color: colors.muted }]}>Account UUID</Text>
      <View style={styles.row}>
        <Text selectable style={[type.caption, styles.code, { color: colors.secondary }]}>
          {accountId}
        </Text>
        <Button
          label="Copy UUID"
          variant="link"
          size="small"
          accessibilityLabel="Copy account UUID"
          onPress={() => void copy()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  code: {
    flex: 1,
    flexShrink: 1,
    fontSize: 11,
    letterSpacing: -0.2,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    lineHeight: 16,
  },
});
