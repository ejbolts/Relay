import * as Linking from 'expo-linking';
import { Text } from 'react-native';
import { apiOrigin } from '../../data/api';
import { Button, Card, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';

/** A tab the app doesn't have yet, with a way to open it in Relay on the web. */
export function WebOnlyScreen({ title, hash }: { title: string; hash: string }) {
  const { colors, type } = useTheme();
  return (
    <Screen title={title}>
      <Card>
        <Text style={[type.callout, { color: colors.secondary }]}>
          {`${title} isn't in the app yet.`}
        </Text>
        <Button
          label="Open in Relay"
          icon="external"
          variant="secondary"
          onPress={() => void Linking.openURL(`${apiOrigin}/#${hash}`)}
        />
      </Card>
    </Screen>
  );
}
