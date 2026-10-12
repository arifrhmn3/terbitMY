import { Stack } from 'expo-router';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { faith } from '@/features/faith/faith';
import { FAITH_PREFERENCE_LABEL, FAITH_PREFERENCES } from '@/features/faith/types';
import { useFaithSettings } from '@/features/faith/use-faith';

/**
 * Faith settings: primary faith (private), exploring other traditions
 * (separate: browsing never changes the primary faith) and how Recitations
 * are shown. Works without an account.
 */
export default function FaithSettingsScreen() {
  const settings = useFaithSettings();
  const update = (change: Parameters<typeof faith.settings.update>[0]) => {
    faith.settings.update(change).catch(() => {});
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Faith', headerLargeTitleEnabled: false }} />
      <Section
        title="Your faith"
        footer="Private. Saved on this phone, and in your private account backup if you sign in. Never shown to friends, in Circles or on any profile. Reflection / Meditation is available whatever you choose.">
        {FAITH_PREFERENCES.map((p) => (
          <ListRow
            key={p}
            icon={
              settings.primary === p
                ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
                : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
            }
            title={FAITH_PREFERENCE_LABEL[p]}
            onPress={() => update({ primary: p })}
          />
        ))}
      </Section>

      <Section footer="Browse Daily Recitations from other traditions. This never changes your own faith setting.">
        <SwitchRow
          title="Explore other faith traditions"
          value={settings.exploreOtherTraditions}
          onValueChange={(exploreOtherTraditions) => update({ exploreOtherTraditions })}
        />
      </Section>

      <Section title="Recitation display" footer="The translation is always one tap away during a Recitation.">
        <SwitchRow
          title="Show transliteration"
          value={settings.display.showTransliteration}
          onValueChange={(showTransliteration) => update({ display: { ...settings.display, showTransliteration } })}
        />
        <SwitchRow
          title="Show translation"
          value={settings.display.showTranslation}
          onValueChange={(showTranslation) => update({ display: { ...settings.display, showTranslation } })}
        />
      </Section>
    </Screen>
  );
}
