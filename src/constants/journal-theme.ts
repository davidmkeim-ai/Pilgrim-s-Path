import { Platform } from 'react-native';

/**
 * A deliberately different visual world from the rest of the app's clean
 * chrome -- a worn leather field-journal look, not the neutral app theme.
 * Textures: assets/textures/{leather,paper}.jpg (CC0, ambientCG via
 * Wikimedia Commons -- see DEVLOG.md).
 */
export const JournalColors = {
  leatherOverlay: 'rgba(20, 13, 8, 0.35)',
  parchmentTint: 'rgba(214, 188, 140, 0.55)',
  parchmentShadow: '#8a6a3e',
  stain: 'rgba(90, 65, 30, 0.28)',
  pageText: '#3a3226',
  buckle: '#5b564c',
} as const;

/** One consistent "handwriting color" per family member, cycled by profile id. */
export const InkPalette = ['#2a3b5c', '#26221b', '#a8552e', '#6b4e71'] as const;

export function inkColorForProfile(profileId: string): string {
  const hash = profileId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return InkPalette[hash % InkPalette.length];
}

/** Real cursive system fonts where available; falls back gracefully elsewhere. */
export const HandFont = Platform.select({
  ios: 'Bradley Hand',
  default: 'System',
});

export const JournalDisplayFont = Platform.select({
  ios: 'Iowan Old Style',
  default: Platform.select({ android: 'serif', default: 'Georgia' }),
});
