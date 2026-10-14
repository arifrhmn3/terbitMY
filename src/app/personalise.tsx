import { router, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { handOff } from '@/features/alarms/alarms';
import { ProgressBar } from '@/features/personalisation/components/progress-bar';
import { ReviewStep } from '@/features/personalisation/components/review-step';
import { AboutStep, GoalsStep, ModesStep, sleepError, SleepStep, StepButtons, TimesStep, WakeStep } from '@/features/personalisation/components/steps';
import {
  adjust,
  answer,
  isFirstStep,
  markWarned,
  needsSkipWarning,
  nextStep,
  previousStep,
  progress,
  SKIP_COPY,
  skipStep,
  STEP_TITLE,
  type OnboardingDraft,
} from '@/features/personalisation/flow';
import { personalisation } from '@/features/personalisation/personalisation';
import { loadSession, type SessionState } from '@/features/personalisation/session';
import { returnToToday } from '@/features/today/navigation';
import { useTheme } from '@/hooks/use-theme';
import { getAlarmService } from '@/services/alarm-scheduler';
import { getReminderService } from '@/services/notifications';

/**
 * "Build my Terbit routine" (Phase 6A): seven short steps in a fixed order,
 * every one skippable, ending in a proposed weekly routine. Nothing changes
 * until "Use this routine". The session is saved as it goes, so it resumes
 * after an interruption. Offered once on a fresh install; always available
 * from Settings → Personalise Terbit.
 *
 * It never shows a blank screen: there's a loading view, an error view, and
 * a route error boundary, and Close is always on screen. Like the alarm
 * screen (the other full-screen modal), it draws its own top bar instead of
 * a native header.
 */
export default function PersonaliseScreen() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => loadSession(personalisation.begin).then(setSession), []);
  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'loading') {
    return (
      <Frame onClose={leave}>
        <View style={styles.centre} accessibilityLabel="Preparing your routine">
          <ActivityIndicator />
          <ThemedText themeColor="textSecondary">Preparing your routine…</ThemedText>
        </View>
      </Frame>
    );
  }
  if (session.status === 'error') {
    return (
      <Frame onClose={leave}>
        <SessionError
          message={session.message}
          onStartAgain={async () => {
            setSession({ status: 'loading' });
            await personalisation.discardDraft().catch(() => {});
            await load();
          }}
        />
      </Frame>
    );
  }
  return <Flow initial={session.draft} saving={saving} setSaving={setSaving} />;
}

/** Leave without changing anything: back to where personalisation was opened (Settings), or Today on first launch. */
export function leave() {
  if (router.canGoBack()) router.back();
  else returnToToday();
}

function Flow({ initial, saving, setSaving }: { initial: OnboardingDraft; saving: boolean; setSaving: (saving: boolean) => void }) {
  const [draft, setDraft] = useState<OnboardingDraft>(initial);

  const go = (next: OnboardingDraft) => {
    setDraft(next);
    personalisation.saveDraft(next).catch(() => {});
  };

  function skip() {
    if (!needsSkipWarning(draft)) return go(skipStep(draft));
    const c = SKIP_COPY.step;
    Alert.alert(c.title, c.message, [
      { text: c.continue, style: 'cancel', onPress: () => go(markWarned(draft)) },
      { text: c.skip, onPress: () => go(skipStep(draft)) },
    ]);
  }

  function exit() {
    const c = SKIP_COPY.all;
    Alert.alert(c.title, c.message, [
      { text: c.continue, style: 'cancel' },
      {
        text: c.skip,
        onPress: async () => {
          await personalisation.skipAll().catch(() => {});
          leave();
        },
      },
    ]);
  }

  async function save(current: OnboardingDraft) {
    setSaving(true);
    try {
      // Notifications are asked for only when the routine uses them (Gentle follow-ups, wind-down reminders).
      const gentle = Object.values(current.answers.goals).some((g) => g?.mode === 'gentle');
      if (gentle || current.answers.nightRoutine) await getReminderService().requestPermission();
      const result = await personalisation.accept(current);
      handOff.syncSnoozes().catch(() => {});
      if (result.notScheduled > 0) {
        Alert.alert('Routine saved, but alarms can’t ring yet', 'Terbit MY doesn’t have permission to set alarms.', [
          { text: 'OK', onPress: returnToToday },
          {
            text: 'Fix permissions',
            onPress: async () => {
              const service = getAlarmService();
              const status = await service.requestNativeAlarmPermission();
              if (status.permission !== 'granted') await service.openNativeAlarmSettings();
              returnToToday();
            },
          },
        ]);
        return;
      }
      returnToToday();
    } catch (error) {
      setSaving(false);
      Alert.alert('Couldn’t save your routine', error instanceof Error ? error.message : String(error));
    }
  }

  function accept(current: OnboardingDraft, replacesExisting: boolean) {
    if (!replacesExisting) return void save(current);
    Alert.alert('Use this routine?', 'The changes listed under “What will change” are saved. Your history, XP and streak stay as they are.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use this routine', onPress: () => void save(current) },
    ]);
  }

  const { fraction } = progress(draft);
  const onAnswer = (change: Parameters<typeof answer>[1]) => go(answer(draft, change));
  const props = { draft, onAnswer };
  const blocked = draft.step === 'sleep' && sleepError(draft.answers.sleep) !== null;

  return (
    <Frame onClose={exit} onSkip={draft.step !== 'review' ? skip : undefined}>
      <View style={styles.top}>
        <ProgressBar fraction={fraction} />
        <ThemedText type="title">{STEP_TITLE[draft.step]}</ThemedText>
      </View>

      {draft.step === 'about' && <AboutStep {...props} />}
      {draft.step === 'goals' && <GoalsStep {...props} />}
      {draft.step === 'modes' && <ModesStep {...props} />}
      {draft.step === 'times' && <TimesStep {...props} />}
      {draft.step === 'wake' && <WakeStep {...props} />}
      {draft.step === 'sleep' && <SleepStep {...props} />}
      {draft.step === 'review' ? (
        <ReviewStep draft={draft} saving={saving} onAccept={(r) => accept(draft, r.changes.replacesExisting)} onAdjust={(step) => go(adjust(draft, step))} />
      ) : (
        <StepButtons
          canGoBack={!isFirstStep(draft) && !draft.returnToReview}
          onBack={() => go(previousStep(draft))}
          onContinue={() => go(nextStep(draft.step === 'sleep' && !draft.answers.sleep ? answer(draft, { sleep: draft.baseline.sleep }) : draft))}
          continueTitle={draft.returnToReview ? 'Back to my routine' : 'Continue'}
          disabled={blocked}
        />
      )}
    </Frame>
  );
}

/** The screen with its own top bar: Close always, Skip on question steps. Inside the safe area, so it's always reachable. */
function Frame({ onClose, onSkip, children }: { onClose: () => void; onSkip?: () => void; children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.frame, { backgroundColor: theme.background }]}>
      <View style={styles.bar}>
        <BarButton title="Close" onPress={onClose} />
        <ThemedText type="headline" numberOfLines={1} style={styles.barTitle}>
          Build my Terbit routine
        </ThemedText>
        {onSkip ? <BarButton title="Skip" onPress={onSkip} /> : <View style={styles.barSpacer} />}
      </View>
      <Screen>{children}</Screen>
    </SafeAreaView>
  );
}

function BarButton({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} hitSlop={12} style={styles.barButton}>
      <ThemedText style={{ color: theme.tint }}>{title}</ThemedText>
    </Pressable>
  );
}

function SessionError({ message, onStartAgain }: { message: string; onStartAgain: () => void }) {
  return (
    <View style={styles.error}>
      <Notice title="Personalisation couldn’t open" description={`${message} Nothing has been changed. You can start again, or close and keep using Terbit as it is.`} />
      <Button title="Start again" onPress={onStartAgain} />
      <Button title="Close" variant="secondary" onPress={leave} />
    </View>
  );
}

/** Any error while drawing a step: shown with a way out, never a blank screen. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <Frame onClose={leave}>
      <SessionError
        message={error.message}
        onStartAgain={async () => {
          await personalisation.discardDraft().catch(() => {});
          await retry();
        }}
      />
    </Frame>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  barTitle: { flex: 1, textAlign: 'center' },
  barButton: { minWidth: 56, minHeight: 44, justifyContent: 'center' },
  barSpacer: { minWidth: 56 },
  top: { gap: Spacing.three },
  centre: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
  error: { gap: Spacing.three },
});
