import { Share } from 'react-native';

/**
 * FUTURE: sharing a rendered card image through the phone's native share
 * sheet. Not implemented in Phase 1; screens will call this interface, and
 * iOS (then Android) implementations will plug in behind it.
 */
export interface ShareService {
  available: boolean;
  /** Opens the share sheet with an image file (e.g. a rendered share card) and optional message. */
  shareImage(fileUri: string, message?: string): Promise<'shared' | 'cancelled' | 'unavailable'>;
}

const notImplemented: ShareService = {
  available: false,
  async shareImage() {
    return 'unavailable';
  },
};

export function getShareService(): ShareService {
  return notImplemented;
}

/**
 * Opens the phone's share sheet with plain text (Phase 5B: a Circle invite
 * code). Uses React Native's built-in Share, so it needs no extra native
 * module; the iPhone sheet includes Copy, Messages, WhatsApp and so on.
 */
export async function shareText(message: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  try {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'unavailable';
  }
}
