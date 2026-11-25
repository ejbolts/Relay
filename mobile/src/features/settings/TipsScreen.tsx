import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { TIP_DEFINITIONS, tipAction, type TipId } from '../../../../frontend/src/tipsState';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, CardHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { openTipTarget } from '../guides/tipTargets';
import { useTips } from '../guides/tips';
import { Section, SettingsPage, SwitchRow } from './SettingsList';
import { settingsIcons } from './icons';

/**
 * The web's tips that apply in the app. Left out: merging machines and screenshot import (web
 * only), dragging sets into order and the plates helper (not in the app's logger), and swiping
 * back from the edge, which the phone already does.
 */
export const APP_TIPS: TipId[] = [
  'split',
  'repRange',
  'blocks',
  'normalise',
  'maintenance',
  'swap',
  'setType',
  'swipe',
  'machine',
  'home',
  'friends',
  'appearance',
];

/** The web's Tips settings and its Browse tips library. */
export function TipsScreen() {
  const router = useRouter();
  const user = useUser();
  const tips = useTips();
  const { colors, type } = useTheme();
  return (
    <SettingsPage>
      <Section>
        <SwitchRow
          label="Show tips"
          icon={settingsIcons.tips}
          value={tips.state.enabled}
          onChange={tips.enable}
        />
      </Section>
      {APP_TIPS.map((id) => {
        const tip = TIP_DEFINITIONS[id];
        const action = tipAction(id);
        return (
          <Card key={id}>
            <CardHeader
              title={tip.title}
              action={
                tips.state.seen[id] === 'learned' ? (
                  <View accessible accessibilityLabel="Learned">
                    <Icon name="check" size={16} color={colors.good} />
                  </View>
                ) : undefined
              }
            />
            <Text style={[type.callout, { color: colors.secondary, lineHeight: 21 }]}>
              {tip.body}
            </Text>
            {action && (
              <Button
                label={action.label}
                variant="tonal"
                size="small"
                style={{ alignSelf: 'flex-start' }}
                onPress={() => {
                  tips.engage(id);
                  openTipTarget(router, action.target, { userId: user.id });
                }}
              />
            )}
          </Card>
        );
      })}
    </SettingsPage>
  );
}
