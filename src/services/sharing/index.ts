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
