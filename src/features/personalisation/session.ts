import type { OnboardingDraft } from './flow';

/**
 * Opening the personalisation screen. It must never sit blank: the session
 * either loads (a resumed draft, or a fresh one from the phone's setup), or
 * fails with an error the screen can show (with Close and Start again).
 */
export type SessionState = { status: 'loading' } | { status: 'ready'; draft: OnboardingDraft } | { status: 'error'; message: string };

/** Longer than any local read should take; then the screen shows an error instead of waiting forever. */
export const SESSION_TIMEOUT_MS = 8000;

export async function loadSession(begin: () => Promise<OnboardingDraft>, timeoutMs: number = SESSION_TIMEOUT_MS): Promise<SessionState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Personalisation took too long to open.')), timeoutMs);
  });
  try {
    const draft = await Promise.race([begin(), timeout]);
    return { status: 'ready', draft };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
