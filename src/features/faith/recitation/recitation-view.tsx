import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { formatSeconds } from '@/features/missions/fitness/exercises';
import { useTheme } from '@/hooks/use-theme';

import { faith } from '../faith';
import { TRADITION_LABEL, type RecitationDisplay } from '../types';
import { useFaithSettings } from '../use-faith';
import { estimateMinutes } from './duration';
import type { OpenedRecitation } from './library';
import {
  beginRecitation,
  confirmRecitation,
  createRecitationSession,
  nextPage,
  pageSections,
  previousPage,
  recitationPhase,
  recitationProgress,
  recitationResult,
  type RecitationSession,
} from './session';
import type { RecitationMissionConfig, RecitationMissionResult, RecitationPassage, RecitationSection } from './types';

/** Shown on development fixtures so placeholder text is never mistaken for scripture. */
export function DevFixtureNotice({ passage }: { passage: RecitationPassage }) {
  if (!passage.devFixture) return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
      Development sample: placeholder text, not scripture.
    </ThemedText>
  );
}

/**
 * The passage's sections. Every text is shown EXACTLY as stored (no
 * trimming, re-wording or re-casing). Transliteration and translation follow
 * the user's display settings, and the translation is always one tap away.
 */
export function PassageSections({
  passage,
  sections,
  display,
}: {
  passage: RecitationPassage;
  sections: readonly RecitationSection[];
  display: RecitationDisplay;
}) {
  const theme = useTheme();
  const [showTranslation, setShowTranslation] = useState(display.showTranslation);
  const hasTranslation = sections.some((s) => s.translation !== null);
  const rtl = passage.direction === 'rtl';

  return (
    <View style={styles.sections}>
      {sections.map((s) => (
        <View key={s.number} style={styles.section}>
          <ThemedText type="caption" themeColor="textSecondary">
            {s.number}
          </ThemedText>
          {s.original !== null && (
            <ThemedText style={[styles.original, rtl && styles.rtl]}>{s.original}</ThemedText>
          )}
          {display.showTransliteration && s.transliteration !== null && (
            <ThemedText themeColor="textSecondary" style={styles.transliteration}>
              {s.transliteration}
            </ThemedText>
          )}
          {showTranslation && s.translation !== null && <ThemedText>{s.translation}</ThemedText>}
        </View>
      ))}
      {hasTranslation && (
        <Pressable accessibilityRole="button" onPress={() => setShowTranslation((v) => !v)} style={styles.toggle}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            {showTranslation ? 'Hide translation' : 'Show translation'}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

/** Reference, translation and source, as the source names them. */
export function PassageCitation({ passage }: { passage: RecitationPassage }) {
  const parts = [passage.translationName && `Translation: ${passage.translationName}`, passage.sourceCitation].filter(Boolean);
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
      {parts.join(' · ')}
    </ThemedText>
  );
}

function Bar({ progress }: { progress: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.separator }]}>
      <View style={[styles.fill, { backgroundColor: theme.tint, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
    </View>
  );
}

type RecitationMissionViewProps = {
  config: RecitationMissionConfig;
  /** Called once, when the user confirms they've finished. */
  onComplete: (result: RecitationMissionResult) => void;
  /**
   * Practice only: try to fetch today's passage first (with a timeout).
   * Alarm missions never do this; they open from the phone straight away.
   */
  prepareFirst?: boolean;
};

/**
 * Today's Daily Recitation as a mission: Begin → read page by page →
 * confirm. Loads from the phone only (cache or the local fallback passage),
 * so it opens instantly and works offline. Self-reported.
 */
export function RecitationMissionView({ config, onComplete, prepareFirst = false }: RecitationMissionViewProps) {
  const settings = useFaithSettings();
  const [opened, setOpened] = useState<OpenedRecitation | null>(null);
  const [failed, setFailed] = useState(false);
  const [session, setSession] = useState<RecitationSession | null>(null);
  const [date] = useState(() => faith.today());
  const reported = useRef(false);

  useEffect(() => {
    let current = true;
    (prepareFirst ? faith.recitation.prepare(config.tradition).catch(() => null) : Promise.resolve(null))
      .then(() => faith.recitation.forMission(config.tradition))
      .then((o) => {
        if (!current) return;
        setOpened(o);
        setSession(createRecitationSession(o.passage.sections.length));
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [config.tradition, prepareFirst]);

  useEffect(() => {
    if (!session || !opened || reported.current) return;
    const result = recitationResult(session, opened, config.tradition, date);
    if (result) {
      reported.current = true;
      onComplete(result);
    }
  }, [session, opened, config.tradition, date, onComplete]);

  if (failed) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.center}>Today’s Recitation couldn’t be opened.</ThemedText>
      </ThemedView>
    );
  }
  if (!opened || !session) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText themeColor="textSecondary">Opening today’s Recitation…</ThemedText>
      </ThemedView>
    );
  }

  const { passage } = opened;
  const phase = recitationPhase(session);
  const minutes = estimateMinutes(passage, settings.display);

  return (
    <View style={styles.container}>
      <ThemedText type="caption" themeColor="textSecondary">
        Recitation · {TRADITION_LABEL[config.tradition]} · Today’s passage
      </ThemedText>

      {phase === 'ready' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title" style={styles.center}>
            {passage.title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {passage.reference}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            About {formatSeconds(Math.round(minutes * 60))} · {passage.sections.length} sections
          </ThemedText>
          {opened.usedFallback && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Today’s passage isn’t on this phone yet, so here is an offline passage instead.
            </ThemedText>
          )}
          <DevFixtureNotice passage={passage} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Self-reported: read or recite at your own pace, then confirm when you’ve finished.
          </ThemedText>
          <Button title="Begin" onPress={() => setSession((s) => s && beginRecitation(s, Date.now()))} />
        </ThemedView>
      )}

      {phase === 'reading' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {passage.reference} · Page {session.page + 1} of {session.pageCount}
          </ThemedText>
          <Bar progress={recitationProgress(session)} />
          <PassageSections key={session.page} passage={passage} sections={pageSections(session, passage.sections)} display={settings.display} />
          <View style={styles.row}>
            {session.page > 0 && (
              <View style={styles.flex}>
                <Button title="Back" variant="secondary" onPress={() => setSession((s) => s && previousPage(s))} />
              </View>
            )}
            <View style={styles.flex}>
              <Button
                title={session.page >= session.pageCount - 1 ? 'Finish' : 'Next'}
                onPress={() => setSession((s) => s && nextPage(s))}
              />
            </View>
          </View>
          <PassageCitation passage={passage} />
        </ThemedView>
      )}

      {phase === 'confirm' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title" style={styles.center}>
            End of the passage
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {passage.reference}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Terbit MY can’t check recitation; this is your own confirmation.
          </ThemedText>
          <Button title="I’ve finished" onPress={() => setSession((s) => s && confirmRecitation(s, Date.now()))} />
          <Button title="Back to the passage" variant="secondary" onPress={() => setSession((s) => s && previousPage(s))} />
        </ThemedView>
      )}
    </View>
  );
}

export function RecitationResultSummary({ result }: { result: RecitationMissionResult }) {
  return (
    <>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        Recitation completed · {result.reference}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Self-reported · {formatSeconds(Math.max(1, Math.round(result.durationMs / 1000)))} from Begin to done
        {result.usedFallback ? ' · offline passage' : ''}
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  sections: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.one,
  },
  original: {
    fontSize: 24,
    lineHeight: 40,
  },
  rtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  transliteration: {
    fontStyle: 'italic',
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  flex: {
    flex: 1,
  },
  bar: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
  },
});
