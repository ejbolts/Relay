import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import { CONTRIBUTING_URL, PROJECT_URL } from '../../../../frontend/src/appGuideSteps';
import {
  guideDone,
  SETUP_GUIDE_IDS,
  SETUP_GUIDE_TITLES,
  type SetupGuideId,
} from '../../../../frontend/src/setupGuideSteps';
import { useTrainingBlocks } from '../blocks';
import { Row, Section, SettingsPage } from '../settings/SettingsList';
import { replayAppTour } from './tourProgress';
import { guideIcons } from './icons';
import { SetupGuideSheet } from './SetupGuideSheet';
import { useTips } from './tips';

const GUIDE_ICONS = {
  normalise: { icon: guideIcons.machines, tint: '#f59e0b' },
  blocks: { icon: guideIcons.blocks, tint: '#22c55e' },
  split: { icon: guideIcons.split, tint: '#2c74d0' },
} as const;

/** Settings › Guides: the web's App guide and Setup guides panels. */
export function GuidesScreen() {
  const router = useRouter();
  const tips = useTips();
  const hasBlocks = (useTrainingBlocks().data?.blocks.length ?? 0) > 0;
  const [guide, setGuide] = useState<SetupGuideId | null>(null);
  return (
    <SettingsPage>
      <Section title="App guide">
        <Row
          label="Replay guide"
          icon={guideIcons.tour}
          iconTint="#8057ba"
          onPress={() => {
            replayAppTour();
            router.navigate('/');
          }}
        />
        <Row
          label="GitHub repository"
          icon={guideIcons.external}
          iconTint="#48515a"
          external
          onPress={() => void Linking.openURL(PROJECT_URL)}
        />
        <Row
          label="How to contribute"
          icon={guideIcons.external}
          iconTint="#48515a"
          external
          onPress={() => void Linking.openURL(CONTRIBUTING_URL)}
        />
      </Section>
      <Section title="Setup guides">
        {SETUP_GUIDE_IDS.map((id) => (
          <Row
            key={id}
            label={SETUP_GUIDE_TITLES[id]}
            icon={GUIDE_ICONS[id].icon}
            iconTint={GUIDE_ICONS[id].tint}
            value={guideDone(id, tips.state.seen, hasBlocks) ? 'Set up' : undefined}
            onPress={() => setGuide(id)}
          />
        ))}
      </Section>
      <SetupGuideSheet guide={guide} onClose={() => setGuide(null)} />
    </SettingsPage>
  );
}
