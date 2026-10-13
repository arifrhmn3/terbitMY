import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { poseDiagnostics } from '@/services/pose';

/**
 * DEVELOPER TEST TOOL (development builds only): every condition behind
 * "Verify with camera" (native module, camera hardware, iOS permission,
 * Vision support), with the technical errors normal screens never show.
 * Reading never asks for camera permission.
 */
export function CameraDevPanel() {
  const [lines, setLines] = useState<string[] | null>(null);

  const load = useCallback(
    () =>
      poseDiagnostics()
        .then((d) => setLines(Object.entries(d).map(([k, v]) => `${k}: ${v}`)))
        .catch((e: unknown) => setLines([`Diagnostics failed: ${e instanceof Error ? e.message : String(e)}`])),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Section title="Camera rep counting (developer)" footer="Development builds only. Reading these never asks for camera permission.">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text} selectable>
        {lines ? lines.join('\n') : 'Checking…'}
      </ThemedText>
      <ListRow
        icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
        title="Check again"
        onPress={() => {
          setLines(null);
          void load();
        }}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  text: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
