import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { TIP_DEFINITIONS } from '../../../../frontend/src/tipDefinitions';
import { Button, Card, CardHeader } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { SettingsPage } from './SettingsList';

export function TipsScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  return (
    <SettingsPage>
      {(['split', 'repRange', 'swap', 'friends'] as const).map((id) => {
        const tip = TIP_DEFINITIONS[id];
        return (
          <Card key={id}>
            <CardHeader title={tip.title} />
            <Text style={[type.body, { color: colors.secondary }]}>{tip.body}</Text>
            {(id === 'split' || id === 'repRange') && (
              <Button
                label={TIP_DEFINITIONS[id].action.label}
                variant="link"
                onPress={() => router.push('/split')}
              />
            )}
          </Card>
        );
      })}
    </SettingsPage>
  );
}
