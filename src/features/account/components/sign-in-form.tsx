import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { account } from '../account';
import { friendlyAuthError } from '../auth-messages';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email one-time code: enter email → receive a 6-digit code → enter it. Creates the account on first use. */
export function SignInForm() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode() {
    if (!EMAIL.test(email.trim())) {
      setMessage('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await account.sendCode(email);
      setStep('code');
      setMessage(`We sent a code to ${email.trim()}. It can take a minute to arrive.`);
    } catch (error) {
      setMessage(friendlyAuthError(error, 'send'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setMessage(null);
    try {
      await account.verifyCode(email, code);
    } catch (error) {
      setMessage(friendlyAuthError(error, 'verify'));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text }];
  return (
    <Section
      title="Sign in / Create account (optional)"
      footer="We email you a one-time code; no password. Your alarms, history, XP and streaks stay on this phone either way; signing in also backs them up to your account. Your Night Routine stays on this phone only.">
      {step === 'email' ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email address"
          editable={!busy}
          style={inputStyle}
        />
      ) : (
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
          placeholder="Code from the email"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          accessibilityLabel="Sign-in code"
          editable={!busy}
          style={inputStyle}
        />
      )}
      <View style={styles.actions}>
        {message && (
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
        )}
        {step === 'email' ? (
          <Button title={busy ? 'Sending…' : 'Email me a code'} onPress={sendCode} disabled={busy} />
        ) : (
          <>
            <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={verify} disabled={busy || code.length < 6} />
            <Button
              title="Use a different email"
              variant="secondary"
              onPress={() => {
                setStep('email');
                setCode('');
                setMessage(null);
              }}
              disabled={busy}
            />
          </>
        )}
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
