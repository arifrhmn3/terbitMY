/**
 * Public Supabase settings, read at build time from environment variables
 * (`.env.local` in development; EAS environment variables for cloud builds).
 * Only the project URL and the publishable (anon) key belong in the app; both
 * are public by design and protected by Row Level Security. The service-role
 * (secret) key must NEVER be used here.
 */
export type CloudConfig = { url: string; publishableKey: string };

export function readCloudConfig(env: Record<string, string | undefined>): CloudConfig | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  if (!/^https:\/\/[^/]+$/.test(url.replace(/\/$/, ''))) return null;
  // A secret key in the app would bypass every security rule: refuse it.
  if (publishableKey.startsWith('sb_secret_') || looksLikeServiceRole(publishableKey)) return null;
  return { url: url.replace(/\/$/, ''), publishableKey };
}

/** Legacy JWT keys carry their role; a service_role key must never ship. */
function looksLikeServiceRole(key: string): boolean {
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const json = globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}

/**
 * The app's cloud settings. Each variable is written out in full so Expo can
 * inline it at build time.
 */
export function getCloudConfig(): CloudConfig | null {
  return readCloudConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
