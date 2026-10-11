import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ListRow } from '@/components/list-row';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { syncEngine } from '@/features/sync/sync';

import { useAccount, useSyncStatus } from '../account';

/** DEVELOPER TEST TOOL (development builds only): auth and sync internals. */
export function SyncDevPanel() {
  const { status: authStatus, user } = useAccount();
  const sync = useSyncStatus();
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    if (!user) return;
    syncEngine.pendingCount(user.id).then((n) => current && setPending(n)).catch(() => {});
    return () => {
      current = false;
    };
  }, [user, sync]);

  const lines = [
    `Auth: ${authStatus}${user ? ` · user ${user.id}` : ''}`,
    `Sync: ${sync.state} · pending ${user ? (pending ?? '…') : '—'} (last check ${sync.pending})`,
    `Last sync: ${sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : '—'}`,
    `Last error: ${sync.lastError ?? '—'}`,
  ];
  return (
    <Section title="Sync (developer)" footer="Development builds only. Not shown in release builds.">
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {lines.join('\n')}
      </ThemedText>
      <ListRow
        icon={{ ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' }}
        title="Sync now"
        onPress={() => syncEngine.sync()}
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
