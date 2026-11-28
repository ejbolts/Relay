import { View } from 'react-native';
import type { TrainedWith, TrainMember } from '../../../../frontend/src/trainTogether';
import { useTheme } from '../../ui/theme';
import { Avatar } from '../social/Avatar';

/**
 * A partner's photo (or initial) in a ring of their colour, with an optional live dot: green
 * while their workout is open, grey while it isn't.
 */
export function PartnerAvatar({
  member,
  size,
  ring,
  live,
}: {
  member: Pick<TrainMember | TrainedWith, 'display_name' | 'username' | 'photo_url'>;
  size: number;
  ring?: string;
  live?: boolean;
}) {
  const { colors } = useTheme();
  const inner = ring ? size - 4 : size;
  const dot = Math.max(8, Math.round(size * 0.26));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...(ring && { borderWidth: 2, borderColor: ring }),
      }}
    >
      <Avatar
        person={{
          display_name: member.display_name || member.username,
          profile_photo_url: member.photo_url,
        }}
        size={inner}
      />
      {live !== undefined && (
        <View
          testID={live ? 'partner-live' : 'partner-idle'}
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            borderWidth: 2,
            borderColor: colors.surface,
            backgroundColor: live ? colors.good : colors.muted,
          }}
        />
      )}
    </View>
  );
}
