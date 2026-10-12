/**
 * Where remote Reflection tracks are fetched from. Default: a public bucket
 * named `reflection-music` in the app's Supabase project (Storage). Override
 * with EXPO_PUBLIC_REFLECTION_MUSIC_BASE_URL. Null: no remote source (only the
 * bundled fallback plays).
 */
export function musicBaseUrl(env: { musicBaseUrl?: string; supabaseUrl?: string }): string | null {
  const explicit = env.musicBaseUrl?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const supabase = env.supabaseUrl?.trim().replace(/\/$/, '');
  return supabase && /^https:\/\/[^/]+$/.test(supabase) ? `${supabase}/storage/v1/object/public/reflection-music` : null;
}
