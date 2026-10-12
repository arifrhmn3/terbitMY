import { Directory, File, Paths } from 'expo-file-system';

/**
 * Downloaded files kept in a folder in the app's cache. iOS may clear the
 * cache when storage is low; callers must cope with a file disappearing.
 */
export type FileCache = {
  /** The saved file's URI, or null if it isn't on the phone. */
  uri(name: string): Promise<string | null>;
  /** Downloads `url` and saves it as `name`; returns the local URI. */
  download(url: string, name: string): Promise<string>;
};

export function createFileCache(folderName: string): FileCache {
  const folder = new Directory(Paths.cache, folderName);
  const fileFor = (name: string) => new File(folder, name);
  return {
    async uri(name) {
      const file = fileFor(name);
      return file.exists && (file.size ?? 0) > 0 ? file.uri : null;
    },
    async download(url, name) {
      if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
      // Download under a temporary name, then rename: a half-finished download is never mistaken for the file.
      const part = await File.downloadFileAsync(url, fileFor(`${name}.part`), { idempotent: true });
      const final = fileFor(name);
      if (final.exists) final.delete();
      await part.move(final);
      return final.uri;
    },
  };
}
