import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { weightGoalReached } from '../../../../frontend/src/bodyMeasurementHistory';
import {
  homeTipCopy,
  homeTipCount,
  homeTipFacts,
  homeTipList,
} from '../../../../frontend/src/homeTipList';
import { GUIDE_FOR_TIP, type SetupGuideId } from '../../../../frontend/src/setupGuideSteps';
import { tipAction } from '../../../../frontend/src/tipsState';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard, useWorkoutHistory } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { useBodyGoals, useBodyMeasurements } from '../body/bodyQueries';
import { useTrainingBlocks } from '../blocks';
import { guideIcons } from './icons';
import { SetupGuideSheet } from './SetupGuideSheet';
import { openTipTarget } from './tipTargets';
import { useTips } from './tips';

/**
 * The web's tips at the end of Home's date line, beside Home's header buttons: amber with a count
 * while tips are unread, grey once read. Each tip opens its feature, or its setup guide first.
 */
export function HomeTipsButton() {
  const router = useRouter();
  const user = useUser();
  const tips = useTips();
  const { learn, readHome } = tips;
  const { colors, type } = useTheme();
  const workouts = useWorkoutHistory().data;
  const blocks = useTrainingBlocks();
  const hasSplit = !!useDashboard().data?.recommendation?.split_name;
  const goals = useBodyGoals().data;
  const latestWeightKg = useBodyMeasurements().data?.[0]?.weight_kg ?? null;
  const blockCount = blocks.data ? blocks.data.blocks.length : null;
  const goalReached = weightGoalReached(
    goals?.find((goal) => goal.active),
    latestWeightKg,
  );
  useEffect(() => {
    if (blockCount) learn('blocks');
  }, [blockCount, learn]);
  useEffect(() => {
    if (hasSplit) learn('split');
  }, [hasSplit, learn]);
  const facts = useMemo(
    () =>
      homeTipFacts({
        workouts: workouts ?? [],
        createdAt: user.created_at,
        today: localDate(),
        blockCount,
        hasSplit,
        goalReached,
      }),
    [workouts, user.created_at, blockCount, hasSplit, goalReached],
  );
  const eligible = homeTipList(facts, tips.state);
  const read = tips.state.homeRead ?? [];
  const unread = eligible.filter((id) => !read.includes(id));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [guide, setGuide] = useState<SetupGuideId | null>(null);
  const current = eligible.length ? eligible[Math.min(index, eligible.length - 1)] : undefined;
  const showing = open && tips.state.enabled;
  useEffect(() => {
    if (showing && current) readHome(current);
  }, [showing, current, readHome]);
  // Stays on Home while tips are on, so tips are always one tap away.
  if (!tips.state.enabled) return null;

  const tip = homeTipCopy(current);
  const action = current ? tipAction(current) : null;
  const guideId = current ? GUIDE_FOR_TIP[current] : undefined;
  const toggle = () => {
    // Open on the first unread tip, or the first tip once everything has been read.
    setIndex(Math.max(0, eligible.indexOf(unread[0])));
    setOpen(true);
  };
  const run = () => {
    if (!current) return;
    setOpen(false);
    if (guideId) {
      // The guide ends with the tip's own button, after explaining the feature. It opens once the
      // tip's sheet has gone, as a phone shows one sheet at a time.
      setTimeout(() => setGuide(guideId), 400);
      return;
    }
    if (!action) return;
    tips.engage(current);
    openTipTarget(router, action.target, {
      userId: user.id,
      exerciseId: current === 'normalise' ? facts.machineExerciseId : null,
    });
  };
  const amber = unread.length > 0;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={amber ? `Tips, ${unread.length} new` : 'Tips'}
        hitSlop={6}
        onPress={toggle}
        style={({ pressed }) => [
          styles.bulb,
          { backgroundColor: amber ? colors.goldSoft : colors.surface2 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Icon name={guideIcons.bulb} size={19} color={amber ? colors.gold : colors.text} />
        {amber && (
          <View style={[styles.badge, { backgroundColor: colors.gold, borderColor: colors.page }]}>
            <Text style={styles.badgeText}>{homeTipCount(unread.length)}</Text>
          </View>
        )}
      </Pressable>
      <Sheet visible={showing} title={tip.title} kicker="TIP" onClose={() => setOpen(false)}>
        <Text style={[type.body, { color: colors.secondary }]}>{tip.body}</Text>
        {current && (guideId || action) && (
          <Button label={guideId ? 'Show me how' : action!.label} onPress={run} />
        )}
        <View style={styles.footer}>
          {current && eligible.length > 1 && (
            <View
              style={styles.dots}
              accessible
              accessibilityLabel={`Tip ${eligible.indexOf(current) + 1} of ${eligible.length}`}
            >
              {eligible.map((id) => (
                <View
                  key={id}
                  style={[
                    styles.dot,
                    { backgroundColor: id === current ? colors.accent : colors.surface3 },
                  ]}
                />
              ))}
            </View>
          )}
          <View style={styles.footerActions}>
            {current && eligible.length > 1 && (
              <Button
                label="Next"
                variant="link"
                onPress={() => setIndex((eligible.indexOf(current) + 1) % eligible.length)}
              />
            )}
            <Button
              label={current ? 'Got it' : 'Done'}
              variant="secondary"
              onPress={() => {
                // Put away here only: the same tip can still appear where it applies.
                if (current) tips.doneHome(current);
                setOpen(false);
              }}
            />
          </View>
        </View>
      </Sheet>
      <SetupGuideSheet guide={guide} onClose={() => setGuide(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Like the bell beside it: a round button, with the count of new tips as a badge.
  bulb: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
});
