/** Internal Terbit track ID, e.g. "reflection-001". The daily schedule points at these forever. */
export type TrackId = string;

/**
 * Licensing record for one track. Kept with the catalogue (in the repo),
 * shown only in developer diagnostics, never in the normal interface
 * (except attribution, when a licence requires it).
 */
export type TrackLicence = {
  /** e.g. 'dev-placeholder', 'stock-commercial', 'custom-commercial', 'commissioned', 'terbit-owned'. */
  type: string;
  referenceUrl: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  commercialAppUse: boolean;
  localCachingPermitted: boolean;
  offlineBundlingPermitted: boolean;
  streamingPermitted: boolean;
  /** YYYY-MM-DD. */
  acquiredOn: string | null;
  notes: string;
};

/** Development placeholders are NEVER production-approved (see docs/REFLECTION-MUSIC.md). */
export type TrackApproval = 'dev_placeholder' | 'production_approved';

export type ReflectionTrack = {
  id: TrackId;
  title: string;
  durationSec: number;
  /** Where the audio comes from: 'bundled' (inside the app) or a remote provider ID. */
  provider: string;
  /** The provider's own ID or file name. */
  externalAssetId: string;
  licence: TrackLicence;
  approval: TrackApproval;
  /** Generation/provenance notes (e.g. how a placeholder was made). */
  provenance: string;
};

/**
 * Something the audio player can play: a bundled asset (a `require()`d
 * module number) or a URI (a cached file, or a stream).
 */
export type PlayableSource = number | { uri: string };

/** Where the playing track came from. */
export type TrackSourceKind = 'bundled' | 'cache' | 'download' | 'stream' | 'fallback';

export type ResolvedTrack = {
  /** The track actually playing (may be the fallback). */
  track: ReflectionTrack;
  requestedTrackId: TrackId;
  source: PlayableSource;
  kind: TrackSourceKind;
};
