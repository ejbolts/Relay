import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatLiftBestSet,
  formatLiftEstimate,
  headToHeadScore,
  leaderOf,
  liftBarShare,
  liftRowSummary,
} from '../../../../../frontend/src/liftComparisonDisplay';
import type {
  LiftComparison,
  SharedProfileSummary,
  WorkoutType,
} from '../../../../../frontend/src/types';
import { useWeightUnit } from '../../../data/queries';
import { useUser } from '../../../session/SessionProvider';
import { Button, Card, CardHeader } from '../../../ui/components';
import { haptics } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { Avatar } from '../Avatar';
import { useSharedLifts } from '../socialQueries';
import { LiftPickerSheet } from './LiftPickerSheet';
import { ProfileWorkoutsSheet } from './ProfileWorkoutsSheet';

type Member = Pick<SharedProfileSummary, 'id' | 'display_name' | 'profile_photo_url'>;

/**
 * Your best lifts against another member's, on their profile. Starts empty on each visit;
 * lifts chosen belong to this visit only. Tapping a lift the member has logged opens their
 * sessions of that lift.
 */
export function HeadToHeadCard({
  member,
  workoutTypes = [],
  onOpenLift,
}: {
  member: Member;
  workoutTypes?: WorkoutType[];
  /** Optional override for opening a member's sessions of one of their exercises. */
  onOpenLift?: (exerciseId: string) => void;
}) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  const user = useUser();
  const query = useSharedLifts(member.id, true);
  const lifts = query.data?.lifts ?? null;
  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  // While the sheet is open, keep the lifts shown before opening, then commit on close.
  const [held, setHeld] = useState<string[] | null>(null);
  const [activeLift, setActiveLift] = useState<{ exerciseId: string; name: string } | null>(null);

  const byId = useMemo(
    () => new Map((lifts ?? []).map((lift) => [lift.exercise_id, lift])),
    [lifts],
  );
  const shownIds = held ?? selected;
  const chosen = useMemo(() => shownIds.flatMap((id) => byId.get(id) ?? []), [shownIds, byId]);
  const score = useMemo(
    () => headToHeadScore(chosen, member.display_name),
    [chosen, member.display_name],
  );

  // The comparison is an extra: if the server cannot answer it, hide the card.
  if (query.isError && !lifts) return null;

  return (
    <Card accessibilityLabel="Head to head">
      <CardHeader
        title="Head to head"
        detail={chosen.length > 0 ? 'All-time est. 1RM' : undefined}
      />

      {chosen.length === 0 && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.template}
        >
          <View style={styles.scoreRow}>
            <View style={styles.side}>
              <View style={[styles.avatarRing, { borderColor: colors.deemph }]}>
                <Avatar person={user} size={36} />
              </View>
              <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>You</Text>
            </View>
            <View style={styles.scoreNumbers}>
              <Text style={[styles.scoreDigit, type.number, { color: colors.muted }]}>?</Text>
              <Text style={[styles.scoreDash, { color: colors.muted }]}>–</Text>
              <Text style={[styles.scoreDigit, type.number, { color: colors.muted }]}>?</Text>
            </View>
            <View style={[styles.side, styles.sideThem]}>
              <Text
                style={[type.footnote, { color: colors.muted, fontWeight: '600', flexShrink: 1 }]}
                numberOfLines={1}
              >
                {member.display_name}
              </Text>
              <View style={[styles.avatarRing, { borderColor: colors.deemph }]}>
                <Avatar person={member} size={36} />
              </View>
            </View>
          </View>
          <View style={styles.ghostLift}>
            <View style={styles.ghostValues}>
              <Text style={[styles.ghostMark, { color: colors.muted }]}>?</Text>
              <View style={styles.ghostTitleWrap}>
                <View style={[styles.ghostTitleStub, { backgroundColor: colors.surface3 }]} />
              </View>
              <Text style={[styles.ghostMark, styles.rightText, { color: colors.muted }]}>?</Text>
            </View>
            <View style={[styles.ghostBar, { borderColor: colors.deemph }]} />
          </View>
        </View>
      )}

      {score.scored > 0 && (
        <View accessible accessibilityLabel={score.label} style={styles.scoreRow}>
          <View style={styles.side}>
            <View
              style={[
                styles.avatarRing,
                { borderColor: score.yours > score.theirs ? colors.accent : colors.deemph },
              ]}
            >
              <Avatar person={user} size={36} />
            </View>
            <Text
              style={[
                type.footnote,
                {
                  color: score.yours > score.theirs ? colors.text : colors.muted,
                  fontWeight: '600',
                },
              ]}
            >
              You
            </Text>
          </View>
          <View style={styles.scoreNumbers}>
            <Text
              style={[
                styles.scoreDigit,
                type.number,
                { color: score.yours > score.theirs ? colors.accentText : colors.text },
              ]}
            >
              {score.yours}
            </Text>
            <Text style={[styles.scoreDash, { color: colors.muted }]}>–</Text>
            <Text
              style={[
                styles.scoreDigit,
                type.number,
                { color: score.theirs > score.yours ? colors.accentText : colors.text },
              ]}
            >
              {score.theirs}
            </Text>
          </View>
          <View style={[styles.side, styles.sideThem]}>
            <Text
              style={[
                type.footnote,
                {
                  color: score.theirs > score.yours ? colors.text : colors.muted,
                  fontWeight: '600',
                  flexShrink: 1,
                },
              ]}
              numberOfLines={1}
            >
              {member.display_name}
            </Text>
            <View
              style={[
                styles.avatarRing,
                { borderColor: score.theirs > score.yours ? colors.accent : colors.deemph },
              ]}
            >
              <Avatar person={member} size={36} />
            </View>
          </View>
        </View>
      )}

      {chosen.length > 0 && (
        <View>
          {chosen.map((lift, index) => (
            <LiftRow
              key={lift.exercise_id}
              lift={lift}
              memberName={member.display_name}
              unit={unit}
              first={index === 0}
              last={index === chosen.length - 1}
              onOpen={
                lift.theirs?.exercise_id
                  ? () => {
                      const theirExercise = lift.theirs!.exercise_id;
                      if (onOpenLift) onOpenLift(theirExercise);
                      else setActiveLift({ exerciseId: theirExercise, name: lift.name });
                    }
                  : undefined
              }
            />
          ))}
        </View>
      )}

      <Button
        label={chosen.length ? 'Edit lifts' : 'Choose lifts'}
        variant="secondary"
        block
        onPress={() => {
          setHeld(selected);
          setPicking(true);
        }}
      />

      {picking && lifts && (
        <LiftPickerSheet
          visible
          member={member}
          you={user}
          lifts={lifts}
          selected={selected}
          onChange={setSelected}
          onClose={() => {
            setHeld(null);
            setPicking(false);
          }}
        />
      )}

      <ProfileWorkoutsSheet
        visible={!!activeLift}
        profileId={member.id}
        workoutTypes={workoutTypes}
        kicker={member.display_name.toUpperCase()}
        title={activeLift?.name ?? ''}
        exerciseId={activeLift?.exerciseId}
        onClose={() => setActiveLift(null)}
      />
    </Card>
  );
}

function LiftRow({
  lift,
  memberName,
  unit,
  first,
  last,
  onOpen,
}: {
  lift: LiftComparison;
  memberName: string;
  unit: 'kg' | 'lb';
  first: boolean;
  last: boolean;
  onOpen?: () => void;
}) {
  const { colors, type } = useTheme();
  const leader = leaderOf(lift);
  const share = liftBarShare(lift);
  const summary = liftRowSummary(lift, memberName, unit);
  const yourColor =
    leader === 'you' ? colors.accentText : leader === 'them' ? colors.muted : colors.text;
  const theirColor =
    leader === 'them' ? colors.accentText : leader === 'you' ? colors.muted : colors.text;

  const content = (
    <View style={styles.liftContent}>
      <View style={styles.valuesRow}>
        <Text
          style={[
            styles.valueText,
            type.number,
            { color: yourColor, fontWeight: leader === 'you' ? '700' : '600' },
          ]}
          numberOfLines={1}
        >
          {lift.yours ? formatLiftEstimate(lift.yours, unit) : '–'}
        </Text>
        <Text style={[styles.liftName, type.footnote, { color: colors.muted }]} numberOfLines={2}>
          {lift.name}
        </Text>
        <Text
          style={[
            styles.valueText,
            styles.rightText,
            type.number,
            { color: theirColor, fontWeight: leader === 'them' ? '700' : '600' },
          ]}
          numberOfLines={1}
        >
          {lift.theirs ? formatLiftEstimate(lift.theirs, unit) : '–'}
        </Text>
      </View>
      <View
        style={styles.bar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {share !== null ? (
          <>
            <View
              style={[
                styles.barSegment,
                {
                  flex: Math.max(share, 1),
                  backgroundColor: leader === 'you' ? colors.accent : colors.deemph,
                },
              ]}
            />
            <View
              style={[
                styles.barSegment,
                {
                  flex: Math.max(100 - share, 1),
                  backgroundColor: leader === 'them' ? colors.accent : colors.deemph,
                },
              ]}
            />
          </>
        ) : (
          <View style={[styles.barSegment, { flex: 1, backgroundColor: colors.deemph }]} />
        )}
      </View>
      <View style={styles.setsRow}>
        <Text style={[type.caption, type.number, { color: colors.muted }]}>
          {lift.yours ? formatLiftBestSet(lift.yours, unit) : 'No sets yet'}
        </Text>
        <Text style={[type.caption, type.number, { color: colors.muted }]}>
          {lift.theirs ? formatLiftBestSet(lift.theirs, unit) : 'No sets yet'}
        </Text>
      </View>
    </View>
  );

  const rowStyle = [
    styles.liftRow,
    !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
    last && { paddingBottom: 0 },
  ];

  if (onOpen) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${summary}. Show ${memberName}’s sessions`}
        onPress={() => {
          haptics.selection();
          onOpen();
        }}
        style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={summary} style={rowStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  template: { gap: 4 },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  sideThem: { justifyContent: 'flex-end' },
  avatarRing: { borderWidth: 2, borderRadius: 20, padding: 1 },
  scoreNumbers: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  scoreDigit: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, lineHeight: 32 },
  scoreDash: { fontSize: 18, fontWeight: '500' },
  ghostLift: { gap: 8, paddingTop: 10 },
  ghostValues: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostMark: { width: 40, fontSize: 15, fontWeight: '700' },
  ghostTitleWrap: { flex: 1, alignItems: 'center' },
  ghostTitleStub: { width: '58%', height: 10, borderRadius: 5 },
  ghostBar: { height: 8, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed' },
  liftRow: { paddingVertical: 12 },
  liftContent: { gap: 6 },
  valuesRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  valueText: { minWidth: 70, fontSize: 15 },
  liftName: { flex: 1, textAlign: 'center' },
  rightText: { textAlign: 'right' },
  bar: { flexDirection: 'row', gap: 2, height: 6 },
  barSegment: { borderRadius: 3 },
  setsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
