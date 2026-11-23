import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import releaseHistory from '../../../../frontend/release-history.json';
import {
  announcedRelease,
  compareVersions,
  formatReleaseDate,
  formatReleaseVersion,
  parseReleaseHistory,
  releaseChangeParts,
  type Release,
  type ReleaseImage,
} from '../../../../frontend/src/releaseMetadata';
import { apiOrigin } from '../../data/api';
import { Button, Card, errorMessage, ErrorState, Loading } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useServerRelease } from './settingsData';
import { Row, Section, SettingsPage } from './SettingsList';

/** The release notes of the Relay the server runs, as the web's What's new shows them. */
export function WhatsNewScreen() {
  const release = useServerRelease();
  if (release.isPending) return <Loading label="Loading release notes" />;
  if (release.error)
    return (
      <ErrorState message={errorMessage(release.error)} onRetry={() => void release.refetch()} />
    );
  if (!release.data)
    return (
      <ErrorState
        message="These release notes could not be read."
        onRetry={() => void release.refetch()}
      />
    );
  return <ReleaseNotes release={announcedRelease(release.data)} />;
}

function ReleaseNotes({ release }: { release: Release }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const history =
    parseReleaseHistory(
      releaseHistory.filter(({ version }) => compareVersions(version, release.version) < 0),
      release.version,
    ) ?? [];
  return (
    <SettingsPage>
      <ReleaseDetails release={release} />
      {history.length > 0 && (
        <Section title="Earlier versions">
          {history.map((item) => (
            <View key={item.version}>
              <Row
                label={formatReleaseVersion(item.version)}
                value={item.title}
                accessibilityLabel={`${formatReleaseVersion(item.version)}, ${item.title}${expanded === item.version ? ', expanded' : ''}`}
                onPress={() => setExpanded(expanded === item.version ? null : item.version)}
              />
              {expanded === item.version && (
                <View style={{ padding: 14, gap: 14 }}>
                  <ReleaseDetails release={item} />
                </View>
              )}
            </View>
          ))}
        </Section>
      )}
    </SettingsPage>
  );
}

function ReleaseDetails({ release }: { release: Release }) {
  const { colors, type } = useTheme();
  const media = release.highlights?.length
    ? release.highlights.map((highlight) => ({
        title: highlight.title,
        caption: highlight.description,
        image: highlight.image,
      }))
    : release.image
      ? [{ title: null, caption: null, image: release.image }]
      : release.video && apiOrigin
        ? [
            {
              title: null,
              caption: null,
              image: {
                url: `${apiOrigin.replace(/\/$/, '')}${release.video.poster}`,
                alt: release.video.alt,
              },
            },
          ]
        : [];
  return (
    <>
      <View style={{ gap: 4 }}>
        <Text style={[type.eyebrow, { color: colors.accentText }]}>
          VERSION {formatReleaseVersion(release.version)}
          {release.date ? ` · ${formatReleaseDate(release.date).toUpperCase()}` : ''}
        </Text>
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
          {release.title}
        </Text>
        <Text style={[type.body, { color: colors.secondary, marginTop: 4 }]}>
          {release.summary}
        </Text>
      </View>
      {media.map((item) => (
        <Card key={item.image.url} style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
          <ReleasePicture image={item.image} />
          {!!item.title && (
            <View style={{ padding: 14, gap: 4 }}>
              <Text style={[type.headline, { color: colors.text }]}>{item.title}</Text>
              <Text style={[type.callout, { color: colors.secondary }]}>{item.caption}</Text>
            </View>
          )}
        </Card>
      ))}
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
          Changes
        </Text>
        {release.changes.map((change) => {
          const parts = releaseChangeParts(change);
          return (
            <View key={change} style={styles.change}>
              <Text style={[type.body, { color: colors.muted }]}>•</Text>
              <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                {parts.title && <Text style={{ fontWeight: '700' }}>{parts.title} </Text>}
                {parts.text}
              </Text>
            </View>
          );
        })}
      </View>
      <Button
        label="All release notes"
        icon="external"
        variant="secondary"
        onPress={() => void Linking.openURL(release.url)}
      />
    </>
  );
}

/** A release image at its own shape, once it loads; nothing if it can't. */
function ReleasePicture({ image }: { image: ReleaseImage }) {
  const { colors } = useTheme();
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri: image.url }}
      accessibilityLabel={image.alt}
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      onLoad={(event) => {
        const { width, height } = event.nativeEvent.source;
        if (width && height) setRatio(width / height);
      }}
      onError={() => setFailed(true)}
      style={{ width: '100%', aspectRatio: ratio ?? 16 / 10, backgroundColor: colors.surface2 }}
    />
  );
}

const styles = StyleSheet.create({
  change: { flexDirection: 'row', gap: 10 },
});
