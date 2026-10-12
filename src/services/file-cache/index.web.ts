import type { FileCache } from './index';

/** Web preview: nothing is saved; the remote URL is used directly. */
export function createFileCache(): FileCache {
  return {
    async uri() {
      return null;
    },
    async download(url) {
      return url;
    },
  };
}

export type { FileCache };
