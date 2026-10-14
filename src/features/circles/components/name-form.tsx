import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Outcome } from '../circles-store';
import { NAME_MAX_LENGTH } from '../validation';

type NameFormProps = {
  title: string;
  footer?: string;
  label: string;
  placeholder: string;
  initial?: string;
  submitTitle: string;
  busyTitle: string;
  onSubmit: (name: string) => Promise<Outcome>;
};

/** One name field with a save button and a plain-language result line. Used for display names, Circle names and renaming. */
export function NameForm({ title, footer, label, placeholder, initial = '', submitTitle, busyTitle, onSubmit }: NameFormProps) {
  const theme = useTheme();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const outcome = await onSubmit(name);
    setBusy(false);
    if (!outcome.ok) setMessage(outcome.message);
  }

  return (
    <Section title={title} footer={footer}>
      <TextInput
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX_LENGTH}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={label}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => name.trim() && !busy && submit()}
        editable={!busy}
        style={[styles.input, { color: theme.text }]}
      />
      <View style={styles.actions}>
        {message && (
          <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
            {message}
          </ThemedText>
        )}
        <Button
          title={busy ? busyTitle : submitTitle}
          onPress={submit}
          disabled={busy || !name.trim() || name.trim() === initial.trim()}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: 17,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
