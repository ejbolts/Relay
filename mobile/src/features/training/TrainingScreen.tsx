import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { sampleRoutine } from './sampleRoutine';

export function TrainingScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { name, exercises } = sampleRoutine;
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets, 0);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <Image source={require('../../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.wordmark}>Relay</Text>
        </View>
        <View style={styles.summary}>
          <Text style={styles.eyebrow}>SAMPLE ROUTINE</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {name}
          </Text>
          <Text style={styles.summaryText}>
            {exercises.length} exercises · {totalSets} sets
          </Text>
        </View>

        <Text accessibilityRole="header" style={styles.heading}>
          Exercises
        </Text>
        <View style={styles.list}>
          {exercises.map((exercise, index) => {
            const open = expanded === exercise.name;
            const prescription = `${exercise.sets} sets · ${exercise.reps} reps`;
            return (
              <View key={exercise.name} style={index > 0 && styles.separator}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${exercise.name}, ${prescription}, previous set`}
                  accessibilityState={{ expanded: open }}
                  onPress={() => setExpanded(open ? null : exercise.name)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Image source={exercise.image} style={styles.exerciseImage} />
                  <View style={styles.description}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    <Text style={styles.detail}>{prescription}</Text>
                  </View>
                  <View style={[styles.chevron, open && styles.chevronOpen]} />
                </Pressable>
                {open && (
                  <View style={styles.previous}>
                    <Text style={styles.detail}>Previous set</Text>
                    <Text style={styles.previousValue}>{exercise.previous}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 32 },
  logo: { width: 35, height: 35, borderRadius: 9 },
  wordmark: { color: colors.text, fontSize: 23, fontWeight: '700', letterSpacing: -0.9 },
  summary: { borderLeftColor: colors.accent, borderLeftWidth: 4, paddingLeft: 16, gap: 5 },
  eyebrow: { color: colors.accentText, fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 43, fontWeight: '700', letterSpacing: -1.8, color: colors.text },
  summaryText: { fontSize: 16, color: colors.secondary },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 34, marginBottom: 12 },
  list: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  pressed: { backgroundColor: colors.border },
  exerciseImage: { width: 54, height: 54, borderRadius: 10 },
  description: { flex: 1, gap: 3 },
  exerciseName: { color: colors.text, fontSize: 17, fontWeight: '600' },
  detail: { color: colors.secondary, fontSize: 14 },
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.secondary,
    transform: [{ rotate: '45deg' }],
    marginRight: 3,
  },
  chevronOpen: { transform: [{ rotate: '225deg' }] },
  previous: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  previousValue: { color: colors.text, fontWeight: '600', fontSize: 15 },
});
