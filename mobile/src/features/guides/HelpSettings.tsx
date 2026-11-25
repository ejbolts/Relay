import { useRouter } from 'expo-router';
import { Row, Section, SwitchRow } from '../settings/SettingsList';
import { guideIcons } from './icons';
import { useWorkoutShareReminder } from './shareReminder';

/** Settings' Help and Workout sharing sections. */
export function HelpSettings() {
  const router = useRouter();
  const [shareReminder, setShareReminder] = useWorkoutShareReminder();
  return (
    <>
      <Section title="Help">
        <Row
          label="Guides"
          icon={guideIcons.guides}
          iconTint="#0ea5e9"
          onPress={() => router.push('/settings/guides')}
        />
      </Section>
      <Section title="Workout sharing">
        <SwitchRow
          label="Share workout reminder"
          icon={guideIcons.share}
          iconTint="#22c55e"
          value={shareReminder}
          onChange={setShareReminder}
        />
      </Section>
    </>
  );
}
