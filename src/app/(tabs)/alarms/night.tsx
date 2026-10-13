import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { ListRow } from '@/components/list-row';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SwitchRow } from '@/components/switch-row';
import { Spacing } from '@/constants/theme';
import { formatAlarmTime } from '@/features/alarms/alarm';
import { TimeField } from '@/features/alarms/components/time-field';
import { WeekdayPicker } from '@/features/alarms/components/weekday-picker';
import { AUTHORIZATION_INFO, describeRestriction, describeSelection, NIGHT_ACTIVITY_LABEL, NOTIFICATION_INFO, sleepFocusGuidance } from '@/features/night/labels';
import { nightStore, useNightRoutine } from '@/features/night/night';
import {
  createNightRoutineDraft,
  validateNightRoutine,
  type NightActivity,
  type NightRoutine,
  type NightRoutineDraft,
} from '@/features/night/night-routine';
import { getReminderService } from '@/services/notifications';

const draftOf = (routine: NightRoutine | null): NightRoutineDraft => {
  if (!routine) return createNightRoutineDraft();
  const { id: _id, createdAt: _c, updatedAt: _u, ...draft } = routine;
  return draft;
};

/**
 * The Night Routine (Phase 4): wind-down (chosen apps restricted from here)
 * → bedtime → the Main Wake-Up next morning (restrictions end). Simple first (wind-down, bedtime, apps, an
 * optional calming activity); everything else is under Customise. The one
 * place the routine is edited (Settings → Screen Time only covers access).
 */
export default function NightRoutineScreen() {
  const { status, routine } = useNightRoutine();
  useEffect(() => {
    void nightStore.refreshAuthorization();
  }, []);
  if (status !== 'ready') return <Screen>{null}</Screen>;
  return <NightRoutineForm initial={draftOf(routine)} />;
}

function NightRoutineForm({ initial }: { initial: NightRoutineDraft }) {
  const { routine, authorization, scheduleError } = useNightRoutine();
  const [draft, setDraft] = useState<NightRoutineDraft>(initial);
  const [customise, setCustomise] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (changes: Partial<NightRoutineDraft>) => setDraft({ ...draft, ...changes });
  const errors = validateNightRoutine(draft);
  const restriction = describeRestriction(nightStore.restriction());
  const info = AUTHORIZATION_INFO[authorization];

  async function chooseApps() {
    try {
      const picked = await nightStore.pickApps(draft.selection.token);
      if (picked) update({ selection: picked, restrictApps: true });
    } catch (error) {
      Alert.alert('Couldn’t open the app picker', error instanceof Error ? error.message : String(error));
    }
  }

  async function allowScreenTime() {
    const result = await nightStore.requestAuthorization();
    if (result.status !== 'approved' && result.error && result.error !== 'authorizationCanceled') {
      Alert.alert('Screen Time access wasn’t allowed', AUTHORIZATION_INFO[result.status].guidance);
    }
  }

  async function save() {
    setSaving(true);
    try {
      // Notifications are asked for only when a wind-down reminder is actually used.
      if (draft.windDownReminder && draft.enabled) await getReminderService().requestPermission();
      await nightStore.save(draft!);
      router.back();
    } catch (error) {
      setSaving(false);
      Alert.alert('Couldn’t save the Night Routine', error instanceof Error ? error.message : String(error));
    }
  }

  function confirmEndTonight() {
    Alert.alert(
      'End tonight’s restrictions?',
      'Your restricted apps open again until the morning. Restrictions come back automatically from the next night.',
      [
        { text: 'Keep restrictions', style: 'cancel' },
        { text: 'End for tonight', style: 'destructive', onPress: () => void nightStore.endTonight() },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert('Delete your Night Routine?', 'Wind-down reminders and app restrictions stop. Your alarms and progress aren’t affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await nightStore.remove();
          router.back();
        },
      },
    ]);
  }

  const active = nightStore.restriction().kind === 'active';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Night Routine', headerLargeTitleEnabled: false }} />

      {routine && restriction && (
        <Section footer={scheduleError ? `The phone couldn’t schedule every night: ${scheduleError}` : undefined}>
          <ListRow icon={{ ios: 'moon.zzz', android: 'bedtime', web: 'bedtime' }} title={restriction} />
          {active && (
            <View style={styles.action}>
              <Button title="End tonight’s restrictions…" variant="secondary" onPress={confirmEndTonight} />
            </View>
          )}
        </Section>
      )}

      <Section title="Wind-down" footer="When you start getting ready for bed. The apps you choose below are restricted from this time.">
        <TimeField hour={draft.windDown.hour} minute={draft.windDown.minute} onChange={(hour, minute) => update({ windDown: { hour, minute } })} />
      </Section>

      <Section title="Bedtime" footer="When you aim to be asleep. Restrictions simply continue; nothing new starts here.">
        <TimeField hour={draft.bedtime.hour} minute={draft.bedtime.minute} onChange={(hour, minute) => update({ bedtime: { hour, minute } })} />
      </Section>

      <Section
        title="Restrict apps from wind-down"
        footer={
          authorization === 'approved'
            ? `From wind-down (${formatAlarmTime(draft.windDown)}) until your Main Wake-Up. Apple’s Screen Time shows the app names; Terbit MY never sees which apps you chose.`
            : undefined
        }>
        {authorization === 'approved' ? (
          <>
            <ListRow
              icon={{ ios: 'apps.iphone', android: 'apps', web: 'apps' }}
              title="Apps to restrict"
              value={describeSelection(draft.selection)}
              onPress={() => void chooseApps()}
            />
            <SwitchRow title="Restrict these apps" value={draft.restrictApps} onValueChange={(restrictApps) => update({ restrictApps })} />
          </>
        ) : (
          <View style={styles.action}>
            <Notice title={`Screen Time: ${info.label}`} description={info.guidance} />
            {authorization === 'not_determined' && <Button title="Allow Screen Time access" variant="secondary" onPress={() => void allowScreenTime()} />}
          </View>
        )}
      </Section>

      <Section title="Quiet notifications" footer={`${NOTIFICATION_INFO.guidance} ${sleepFocusGuidance(draft.windDown)}`}>
        <ListRow icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }} title={NOTIFICATION_INFO.title} value={NOTIFICATION_INFO.value} />
      </Section>

      <Section title="Calming activity (optional)" footer="Offered on Today during wind-down. Practice only: no XP, nothing required.">
        <ChoiceRow<NightActivity>
          options={(['none', 'reflection', 'breathing'] as const).map((value) => ({ value, label: NIGHT_ACTIVITY_LABEL[value] }))}
          value={draft.activity}
          onChange={(activity) => update({ activity })}
        />
      </Section>

      {!customise ? (
        <Section>
          <ListRow icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }} title="Customise" subtitle="Nights, when restrictions end, reminder" onPress={() => setCustomise(true)} />
        </Section>
      ) : (
        <>
          <Section title="Nights" footer="The evenings this routine starts on.">
            <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => update({ weekdays })} />
          </Section>
          <Section
            title="Restrictions end"
            footer={
              draft.endRule === 'main_wake_up'
                ? 'At your Main Wake-Up the next morning. On a morning with no Main Wake-Up, at the time below.'
                : 'Always at the time below.'
            }>
            <ChoiceRow
              options={[
                { value: 'main_wake_up' as const, label: 'Main Wake-Up' },
                { value: 'fixed_time' as const, label: 'Fixed time' },
              ]}
              value={draft.endRule}
              onChange={(endRule) => update({ endRule })}
            />
            <TimeField hour={draft.fallbackEnd.hour} minute={draft.fallbackEnd.minute} onChange={(hour, minute) => update({ fallbackEnd: { hour, minute } })} />
          </Section>
          <Section>
            <SwitchRow title="Wind-down reminder" subtitle="A notification at wind-down" value={draft.windDownReminder} onValueChange={(windDownReminder) => update({ windDownReminder })} />
            <SwitchRow title="Night Routine on" value={draft.enabled} onValueChange={(enabled) => update({ enabled })} />
          </Section>
        </>
      )}

      <Section footer={errors.length > 0 ? errors.join('. ') + '.' : 'Saved on this phone. Works without internet or an account.'}>
        <View style={styles.action}>
          <Button title={routine ? 'Save' : 'Save Night Routine'} onPress={() => void save()} disabled={saving || errors.length > 0} />
          {routine && <Button title="Delete Night Routine" variant="destructive" onPress={confirmDelete} />}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
