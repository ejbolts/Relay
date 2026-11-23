import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { mappedExerciseId, mappingChoices } from '../../../../frontend/src/workoutImport';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { remapExercise, useImportSession } from './importSession';

const AUTOMATIC = { id: '', name: 'Automatic match / new exercise' };

/**
 * Choosing the exercise an imported name maps to, as the web's mapping menu: the automatic
 * match, the best matches, then every exercise, with a search for long libraries.
 */
export function ImportMappingScreen() {
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, type } = useTheme();
  const session = useImportSession();
  const [query, setQuery] = useState('');
  useEffect(() => navigation.setOptions({ title: name }), [navigation, name]);

  const match = session.preview?.exercise_matches?.find((item) => item.incoming_name === name);
  const exercises = session.preview?.available_exercises ?? [];
  const current = match ? mappedExerciseId(session.options ?? undefined, match) : '';
  const { best, rest } = mappingChoices(name, exercises);
  const search = query.trim().toLocaleLowerCase();
  const shown = (list: typeof exercises) =>
    search ? list.filter((exercise) => exercise.name.toLocaleLowerCase().includes(search)) : list;
  const sections = [
    { title: '', data: search ? [] : [AUTOMATIC] },
    { title: 'Best matches', data: shown(best) },
    { title: 'All exercises', data: shown(rest) },
  ].filter((section) => section.data.length > 0);

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: colors.page }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      sections={sections}
      keyExtractor={(item) => item.id || 'automatic'}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 48 }}
      ListHeaderComponent={
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search exercises"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[
              type.body,
              styles.search,
              { backgroundColor: colors.surface2, color: colors.text },
            ]}
          />
        </View>
      }
      renderSectionHeader={({ section }) =>
        section.title ? (
          <Text style={[type.footnote, styles.header, { color: colors.muted }]}>
            {section.title.toUpperCase()}
          </Text>
        ) : null
      }
      renderItem={({ item }) => {
        const selected = item.id === current;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              if (item.id !== current) remapExercise(name, item.id);
              router.back();
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderBottomColor: colors.line },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[type.body, { color: colors.text, flex: 1 }]}>{item.name}</Text>
            {selected && <Icon name="check" size={16} color={colors.accentText} />}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  search: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6, letterSpacing: 0.4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
