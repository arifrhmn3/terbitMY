/** Plain words for every failure; the raw error is never shown (developer builds add it in brackets). */
export function friendlyAuthError(error: unknown, step: 'send' | 'verify'): string {
  const message = error instanceof Error ? error.message : String(error);
  const plain = (() => {
    if (/network|fetch|offline|timed? ?out/i.test(message)) return 'You’re offline. Connect to the internet and try again.';
    if (/rate|security purposes|too many/i.test(message)) return 'Please wait a few minutes before asking for another code.';
    if (/not authori[sz]ed/i.test(message)) return 'This email address can’t receive sign-in codes yet.';
    if (/expired|invalid|token|otp/i.test(message)) return 'That code didn’t work. Check it, or ask for a new one.';
    return step === 'send' ? 'Couldn’t send the code. Try again in a moment.' : 'Couldn’t sign in. Try again in a moment.';
  })();
  return __DEV__ ? `${plain} (${message})` : plain;
}
