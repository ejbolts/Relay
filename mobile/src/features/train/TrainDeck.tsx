import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  inviteCountdownLabel,
  inviteSecondsLeft,
  memberName,
  memberShortName,
  partners,
  partnerSummary,
  TRAIN_INVITE_SECONDS,
  TRAIN_MAX_MEMBERS,
  TRAIN_TOGETHER_LABEL,
  type TrainMember,
} from '../../../../frontend/src/trainTogether';
import { partnerPace, partnerTicker } from '../../../../frontend/src/trainTogetherView';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { useReduceMotion } from '../settings/devicePreferences';
import { trainIcons, usePartnerColours, type PartnerColours } from './partnerColours';
import { PartnerAvatar } from './PartnerAvatar';
import { trainActions, useTrainState } from './trainStore';

/**
 * The partners, each with the copy of their workout the server last acknowledged: an edit from
 * this phone shows in the deck and pace strip only once it is saved.
 */
export function useTrainPartners(): TrainMember[] {
  const session = useTrainState((state) => state.read?.session ?? null);
  const acked = useTrainState((state) => state.partnerAcked);
  return partners(session).map((member) => {
    const saved = acked[member.user_id];
    return member.workout && saved
      ? { ...member, workout: { ...member.workout, draft: saved } }
      : member;
  });
}

/** Returning from a partner's logger puts focus back on that partner's Log button. */
function useFocusReturn(partnerId: string) {
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  const focusReturn = useTrainState((state) => state.focusReturn);
  useEffect(() => {
    if (focusReturn !== partnerId) return;
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, [focusReturn, partnerId]);
  return ref;
}

function LogForButton({ member, tone }: { member: TrainMember; tone: PartnerColours }) {
  const ref = useFocusReturn(member.user_id);
  const short = memberShortName(member);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`Log for ${short}`}
      onPress={() => trainActions().logFor(member.user_id)}
      style={({ pressed }) => [
        styles.logFor,
        { backgroundColor: tone.soft, borderColor: tone.line, borderRadius: 11 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.logForText, { color: tone.text }]} numberOfLines={1}>
        Log for {short}
      </Text>
      <Icon name="chevronRight" size={14} color={tone.text} />
    </Pressable>
  );
}

function GroupRow({
  member,
  tone,
  unit,
  fresh,
}: {
  member: TrainMember;
  tone: PartnerColours;
  unit: WeightUnit;
  fresh: boolean;
}) {
  const { colors, radius } = useTheme();
  const ref = useFocusReturn(member.user_id);
  const name = memberName(member);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={
        member.workout ? `Log for ${memberShortName(member)}` : `${name}, no workout open`
      }
      disabled={!member.workout}
      onPress={() => trainActions().logFor(member.user_id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface2, borderColor: colors.line, borderRadius: radius.md },
        pressed && styles.pressed,
      ]}
    >
      <View>
        {fresh && <JoinPulse size={32} colour={tone.accent} />}
        <PartnerAvatar member={member} size={32} ring={tone.accent} live={!!member.workout} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Ticker member={member} unit={unit} tone={tone} prefix={name} />
      </View>
      {member.workout && <Text style={[styles.logForText, { color: tone.text }]}>Log ›</Text>}
    </Pressable>
  );
}

/**
 * The entry beside Workout details before anyone has joined: "Train together", or while your
 * code is live, "Waiting · 4:32". Either opens the sheet on your code.
 */
export function TrainEntry() {
  const { colors, type, radius } = useTheme();
  const invite = useTrainState((state) => state.invite);
  const now = useNow(1000);
  const seconds = // A phone clock a little behind the server's never shows more than five minutes.
    invite ? Math.min(TRAIN_INVITE_SECONDS, inviteSecondsLeft(invite.expires_at, now)) : 0;
  const waiting = seconds > 0;
  const label = waiting ? `Waiting · ${inviteCountdownLabel(seconds)}` : TRAIN_TOGETHER_LABEL;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        trainActions().openSheet('code');
      }}
      style={({ pressed }) => [
        styles.entry,
        { backgroundColor: colors.accentSoft, borderRadius: radius.lg },
        pressed && styles.pressed,
      ]}
    >
      {waiting ? (
        <View style={[styles.waitDot, { backgroundColor: colors.accent }]} />
      ) : (
        <Icon name={trainIcons.together} size={16} color={colors.accentText} />
      )}
      <Text style={[type.footnote, type.number, styles.entryText, { color: colors.accentText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The 2.5 pt link under the logger's header: your colour into each partner's. */
function LinkHairline({ tones }: { tones: string[] }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const [grow] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(grow, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [grow, reduced]);
  const stops = [colors.accent, ...tones];
  return (
    <Animated.View
      testID="train-link-hairline"
      style={{ height: 2.5, transform: [{ scaleX: grow }] }}
    >
      <Svg width="100%" height={2.5}>
        <Defs>
          <LinearGradient id="trainLink" x1="0" y1="0" x2="1" y2="0">
            {stops.map((stop, index) => (
              <Stop
                key={`${stop}-${index}`}
                offset={stops.length === 1 ? 0 : index / (stops.length - 1)}
                stopColor={stop}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={2.5} fill="url(#trainLink)" />
      </Svg>
    </Animated.View>
  );
}

/** A finite pulse around a partner who just joined: two rings, then still. */
function JoinPulse({ size, colour }: { size: number; colour: string }) {
  const reduced = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      { iterations: 2 },
    ).start();
  }, [pulse, reduced]);
  if (reduced) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: colour,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.45] }) },
          ],
        },
      ]}
    />
  );
}

/** The partner's live line, flashing their colour once when they log a set. */
function Ticker({
  member,
  unit,
  tone,
  prefix,
}: {
  member: TrainMember;
  unit: WeightUnit;
  tone: PartnerColours;
  prefix?: string;
}) {
  const { colors, type } = useTheme();
  const reduced = useReduceMotion();
  const now = useNow(30_000);
  const text = partnerTicker(member.workout, unit, now);
  const total = member.workout ? partnerSummary(member.workout, now).totalSetsDone : 0;
  const [flash] = useState(() => new Animated.Value(0));
  const seen = useRef(total);
  useEffect(() => {
    if (total <= seen.current) {
      seen.current = total;
      return;
    }
    seen.current = total;
    if (reduced) return;
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [total, flash, reduced]);
  return (
    <Animated.Text
      numberOfLines={1}
      style={[
        type.footnote,
        styles.ticker,
        {
          color: member.workout ? colors.secondary : colors.muted,
          backgroundColor: flash.interpolate({
            inputRange: [0, 1],
            outputRange: ['transparent', tone.soft],
          }),
        },
      ]}
    >
      {prefix ? `${prefix} · ${text}` : text}
    </Animated.Text>
  );
}

/**
 * The live deck under the logger's header while training together: who you're with, what each is
 * doing, and the switch to log for them.
 */
export function TrainDeck({ unit }: { unit: WeightUnit }) {
  const { colors, type } = useTheme();
  const reduced = useReduceMotion();
  const list = useTrainPartners();
  const tones = usePartnerColours();
  const [enter] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [joinedAt] = useState(() => Date.now());
  const shown = list.length > 0;
  useEffect(() => {
    if (!shown || reduced) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [shown, enter, reduced]);
  if (!shown) return null;
  const fresh = (member: TrainMember) => Date.parse(member.joined_at) > joinedAt - 10_000;
  const toneOf = (member: TrainMember) =>
    tones[member.user_id] ?? {
      accent: colors.accent,
      text: colors.accentText,
      soft: colors.accentSoft,
      tint: colors.surface2,
      line: colors.lineStrong,
    };

  const sessionButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Session"
      onPress={() => {
        haptics.tap();
        trainActions().openSheet('code');
      }}
      style={({ pressed }) => [
        styles.square,
        { backgroundColor: colors.surface2, borderColor: colors.lineStrong },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={trainIcons.qr} size={20} color={colors.secondary} />
    </Pressable>
  );

  return (
    <Animated.View
      testID="train-deck"
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
        ],
      }}
    >
      <LinkHairline tones={list.map((member) => toneOf(member).accent)} />
      <View style={[styles.deck, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {list.length === 1 ? (
          (() => {
            const member = list[0];
            const tone = toneOf(member);
            const name = memberName(member);
            const sets = member.workout ? partnerSummary(member.workout, 0).totalSetsDone : 0;
            return (
              <View style={styles.single}>
                <View style={styles.identity}>
                  <View>
                    {fresh(member) && <JoinPulse size={38} colour={tone.accent} />}
                    <PartnerAvatar
                      member={member}
                      size={38}
                      ring={tone.accent}
                      live={!!member.workout}
                    />
                  </View>
                  <View style={styles.stack}>
                    <View style={styles.nameLine}>
                      <Text
                        style={[styles.name, { color: colors.text }]}
                        numberOfLines={1}
                        accessibilityRole="header"
                      >
                        {name}
                      </Text>
                      {member.workout && (
                        <View style={[styles.count, { backgroundColor: tone.soft }]}>
                          <Text style={[styles.countText, type.number, { color: tone.text }]}>
                            {sets} {sets === 1 ? 'set' : 'sets'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Ticker member={member} unit={unit} tone={tone} />
                  </View>
                </View>
                <View style={styles.actions}>
                  {member.workout && <LogForButton member={member} tone={tone} />}
                  {sessionButton}
                </View>
              </View>
            );
          })()
        ) : (
          <View style={{ gap: 6 }}>
            <View style={styles.groupHead}>
              <Text style={[styles.groupLabel, { color: colors.muted }]}>
                Training together · {list.length + 1}/{TRAIN_MAX_MEMBERS}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Session"
                onPress={() => trainActions().openSheet('code')}
                style={styles.sessionLink}
              >
                <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
                  Session
                </Text>
              </Pressable>
            </View>
            {list.map((member) => (
              <GroupRow
                key={member.user_id}
                member={member}
                tone={toneOf(member)}
                unit={unit}
                fresh={fresh(member)}
              />
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * On your own exercise card: each partner's latest set on the same lift (at most three).
 * Nothing when nobody has done it.
 */
export function PartnerPace({ exerciseId, unit }: { exerciseId: string; unit: WeightUnit }) {
  const { colors } = useTheme();
  const list = useTrainPartners();
  const tones = usePartnerColours();
  const strips = list
    .flatMap((member) => {
      const pace = member.workout ? partnerPace(member.workout, exerciseId, unit) : null;
      return pace ? [{ member, pace }] : [];
    })
    .slice(0, 3);
  if (!strips.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {strips.map(({ member, pace }) => {
        const tone = tones[member.user_id];
        const name = memberShortName(member);
        return (
          <View
            key={member.user_id}
            accessibilityLabel={`${name}, ${pace.label}, set ${pace.setNumber}`}
            style={[
              styles.pace,
              {
                backgroundColor: tone?.soft ?? colors.accentSoft,
                borderLeftColor: tone?.accent ?? colors.accent,
              },
            ]}
          >
            <PartnerAvatar member={member} size={22} />
            <Text style={[styles.paceText, { color: colors.text }]} numberOfLines={1}>
              <Text style={{ color: tone?.text ?? colors.accentText, fontWeight: '600' }}>
                {name}
              </Text>
              {` · ${pace.label}`}
            </Text>
            <Text style={[styles.paceSet, { color: tone?.text ?? colors.accentText }]}>
              Set {pace.setNumber}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  entry: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entryText: { fontWeight: '600' },
  waitDot: { width: 6, height: 6, borderRadius: 3 },
  deck: { borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  single: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, rowGap: 8 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    // Wraps the Log button under the ticker before it truncates the name (narrow or large text).
    minWidth: 160,
    minHeight: 44,
  },
  stack: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13.5, fontWeight: '700', flexShrink: 1 },
  count: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  countText: { fontSize: 11, fontWeight: '600' },
  ticker: { fontSize: 12.5, fontWeight: '600', borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  logFor: {
    minHeight: 44,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    maxWidth: 170,
  },
  logForText: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  square: {
    width: 44,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionLink: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  groupLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  pace: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderLeftWidth: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paceText: { flex: 1, fontSize: 12.5 },
  paceSet: { fontSize: 11.5, fontWeight: '700' },
});
