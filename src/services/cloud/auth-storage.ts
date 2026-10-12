import 'expo-sqlite/localStorage/install';

/** Where the Supabase session is saved on iOS/Android: expo-sqlite's localStorage (on the device, works offline). */
export const authStorage = localStorage;
