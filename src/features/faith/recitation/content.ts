import type { FaithTradition } from '../types';
import type { RecitationPassage } from './types';

/**
 * Where Recitation text comes from. Mission screens never talk to a source
 * directly; they get a `RecitationPassage` from the library, which asks the
 * provider named in the daily schedule. Eventual providers: a trusted Quran
 * source for Islam, a trusted Bible API for Christianity, and trusted
 * scripture sources for Buddhism and Hinduism (decision pending, see
 * docs/FAITH-CONTENT.md).
 *
 * A provider must return text EXACTLY as its trusted source gives it.
 */
export type FaithContentProvider = {
  id: string;
  /** True when content is on the phone (no network needed). */
  local: boolean;
  /** The passage, or null if unknown. Remote providers may throw when offline. */
  getPassage(contentId: string): Promise<RecitationPassage | null>;
};

export class ContentUnavailableError extends Error {
  constructor(message = 'Content isn’t available offline.') {
    super(message);
    this.name = 'ContentUnavailableError';
  }
}

/** A map of providers by ID. */
export type ProviderRegistry = Record<string, FaithContentProvider>;

// ---------------------------------------------------------------------------
// DEVELOPMENT FIXTURES. Placeholder text in each script, NOT scripture, so no
// religious text is ever invented or misquoted. They prove the architecture
// (sections, original/transliteration/translation, direction, numbering,
// caching, fallback, archive) until real sources and reviewers are chosen.
// ---------------------------------------------------------------------------

type ScriptSample = {
  originalLanguage: string | null;
  direction: 'ltr' | 'rtl';
  original: string | null;
  transliteration: string | null;
};

const SAMPLE_SCRIPT: Record<FaithTradition, ScriptSample> = {
  islam: {
    originalLanguage: 'Arabic script (sample)',
    direction: 'rtl',
    original: 'نص تجريبي للتطوير',
    transliteration: 'Naṣṣ tajrībī lil-taṭwīr',
  },
  christianity: {
    originalLanguage: 'Greek script (sample)',
    direction: 'ltr',
    original: 'Δοκιμαστικό κείμενο',
    transliteration: 'Dokimastikó keímeno',
  },
  // Translation-only sample: checks passages without an original-language layer.
  buddhism: { originalLanguage: null, direction: 'ltr', original: null, transliteration: null },
  hinduism: {
    originalLanguage: 'Devanagari script (sample)',
    direction: 'ltr',
    original: 'नमूना पाठ',
    transliteration: 'namūnā pāṭh',
  },
};

const SAMPLE_LETTERS = ['A', 'B', 'C'] as const;
const SAMPLE_SECTIONS = 12;

function samplePassage(
  tradition: FaithTradition,
  provider: string,
  contentId: string,
  name: string,
  sections: number,
  minutes: number,
): RecitationPassage {
  const script = SAMPLE_SCRIPT[tradition];
  return {
    contentId,
    provider,
    tradition,
    reference: `${name} (development sample, not scripture)`,
    title: name,
    originalLanguage: script.originalLanguage,
    direction: script.direction,
    translationName: 'Development sample',
    transliterationName: script.transliteration ? 'Development sample' : null,
    sourceCitation: 'Terbit MY development fixture. Not a religious text.',
    sections: Array.from({ length: sections }, (_, i) => ({
      number: String(i + 1),
      original: script.original ? `${script.original} ${i + 1}` : null,
      transliteration: script.transliteration ? `${script.transliteration} ${i + 1}` : null,
      translation: `${name}, line ${i + 1}. Placeholder text for testing; real passages come from trusted sources.`,
    })),
    audio: null,
    estimatedMinutes: minutes,
    review: 'draft',
    devFixture: true,
  };
}

export const DEV_REMOTE_PROVIDER_ID = 'dev-remote';
export const DEV_BUNDLED_PROVIDER_ID = 'dev-bundled';

/** Content IDs used by the development schedule, e.g. "islam-sample-a". */
export function devContentId(tradition: FaithTradition, letter: string): string {
  return `${tradition}-sample-${letter.toLowerCase()}`;
}

export const DEV_FALLBACK_CONTENT_ID: Record<FaithTradition, string> = {
  islam: 'islam-fallback',
  christianity: 'christianity-fallback',
  buddhism: 'buddhism-fallback',
  hinduism: 'hinduism-fallback',
};

function remoteFixtures(): Map<string, RecitationPassage> {
  const out = new Map<string, RecitationPassage>();
  for (const tradition of Object.keys(SAMPLE_SCRIPT) as FaithTradition[]) {
    SAMPLE_LETTERS.forEach((letter, i) => {
      const id = devContentId(tradition, letter);
      out.set(id, samplePassage(tradition, DEV_REMOTE_PROVIDER_ID, id, `Sample passage ${letter}`, SAMPLE_SECTIONS, 12 + i * 3));
    });
  }
  return out;
}

function bundledFixtures(): Map<string, RecitationPassage> {
  const out = new Map<string, RecitationPassage>();
  for (const tradition of Object.keys(SAMPLE_SCRIPT) as FaithTradition[]) {
    const id = DEV_FALLBACK_CONTENT_ID[tradition];
    out.set(id, samplePassage(tradition, DEV_BUNDLED_PROVIDER_ID, id, 'Offline fallback passage', 10, 12));
  }
  return out;
}

/** Ships inside the app: always available, used as the offline fallback. */
export function createDevBundledProvider(): FaithContentProvider {
  const passages = bundledFixtures();
  return {
    id: DEV_BUNDLED_PROVIDER_ID,
    local: true,
    async getPassage(contentId) {
      return passages.get(contentId) ?? null;
    },
  };
}

/**
 * Stands in for a remote source: it only answers when `online()` is true,
 * so caching, offline and archive behaviour can be tested before a real
 * provider exists.
 */
export function createDevRemoteProvider(online: () => boolean): FaithContentProvider {
  const passages = remoteFixtures();
  return {
    id: DEV_REMOTE_PROVIDER_ID,
    local: false,
    async getPassage(contentId) {
      if (!online()) throw new ContentUnavailableError('No connection.');
      return passages.get(contentId) ?? null;
    },
  };
}
