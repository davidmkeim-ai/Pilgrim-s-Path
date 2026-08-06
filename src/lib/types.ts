export type ProfileRole = 'parent' | 'child';

export interface Profile {
  id: string;
  name: string;
  avatar: string | null;
  role: ProfileRole;
  sort_order: number;
}

export type WaypointType = 'verse' | 'story' | 'challenge' | 'journal_prompt' | 'creed_line';

export interface VerseRef {
  reference: string;
  translation: string;
}

export interface Waypoint {
  id: string;
  trailId: string;
  type: WaypointType;
  sortOrder: number;
  title: string;
  /** For type 'verse' | 'creed_line': the reference to resolve display text for. */
  verse?: VerseRef;
  /** For type 'story' | 'challenge' | 'journal_prompt': free-form body text/prompt. */
  body?: string;
}

export interface Trail {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage?: string;
  sortOrder: number;
  waypoints: Waypoint[];
}

export type MemorizationStatus = 'learning' | 'mastered';

export interface MemorizationProgress {
  id: string;
  profileId: string;
  waypointId: string;
  status: MemorizationStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
}

export type JournalEntryKind = 'text' | 'photo' | 'audio' | 'parent_message' | 'auto_milestone';

export interface JournalEntry {
  id: string;
  profileId: string | null;
  waypointId: string | null;
  kind: JournalEntryKind;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

export interface Place {
  slug: string;
  name: string;
  description: string;
  /** 0-1 fraction of the map image's width/height, for positioning the marker. Placeholder until real map art exists. */
  mapX: number;
  mapY: number;
  /** Real-world coordinates, kept for future facts/photo sourcing (Wikidata/Wikimedia) -- not used for on-map placement. */
  lat?: number;
  lng?: number;
  image?: string;
  attribution?: string;
  /** Mastering any one of these waypoints unlocks this place on the family map. */
  unlockedByWaypointIds: string[];
  /** The trail this place's pin opens (whether locked or unlocked) -- lets the map act as a visual entry point into trails. */
  trailSlug: string;
}
