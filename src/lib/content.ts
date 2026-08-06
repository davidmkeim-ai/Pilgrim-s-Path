import edenPlace from '@/content/places/eden.json';
import creationAndCovenant from '@/content/trails/creation-and-covenant.json';
import webVerses from '@/content/verses/web.json';

import { Place, Trail } from './types';

// Every trail JSON file under /content/trails goes here as the family's curriculum grows.
const trailFiles = [creationAndCovenant];

// Every place JSON file under /content/places goes here as the map grows.
const placeFiles: Place[] = [edenPlace];

const verseTextByReferenceAndTranslation: Record<string, Record<string, string>> = {
  WEB: webVerses as Record<string, string>,
};

export function getVerseText(reference: string, translation: string): string | null {
  return verseTextByReferenceAndTranslation[translation]?.[reference] ?? null;
}

export function getAllTrails(): Trail[] {
  return trailFiles
    .map((file) => ({
      id: file.slug,
      slug: file.slug,
      title: file.title,
      description: file.description,
      coverImage: file.coverImage ?? undefined,
      sortOrder: file.sortOrder,
      waypoints: file.waypoints
        .map((wp) => ({
          id: wp.id,
          trailId: file.slug,
          type: wp.type as Trail['waypoints'][number]['type'],
          sortOrder: wp.sortOrder,
          title: wp.title,
          verse: 'verse' in wp ? wp.verse : undefined,
          body: 'body' in wp ? wp.body : undefined,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getTrailBySlug(slug: string): Trail | undefined {
  return getAllTrails().find((trail) => trail.slug === slug);
}

export function getWaypointById(id: string): Trail['waypoints'][number] | undefined {
  for (const trail of getAllTrails()) {
    const match = trail.waypoints.find((wp) => wp.id === id);
    if (match) return match;
  }
  return undefined;
}

export function getAllPlaces(): Place[] {
  return placeFiles;
}

export function getPlaceBySlug(slug: string): Place | undefined {
  return placeFiles.find((place) => place.slug === slug);
}

export function getPlacesUnlockedByWaypoint(waypointId: string): Place[] {
  return placeFiles.filter((place) => place.unlockedByWaypointIds.includes(waypointId));
}
