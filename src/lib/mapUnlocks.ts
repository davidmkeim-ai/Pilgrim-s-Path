import { getAllPlaces, getPlacesUnlockedByWaypoint } from './content';
import { supabase } from './supabase';
import { Place } from './types';

/** Unlocks are family-wide (profile_id null) -- the map is a shared family journey, not per-kid. */

export async function fetchUnlockedPlaceSlugs(): Promise<string[]> {
  const places = getAllPlaces();
  if (places.length === 0) return [];

  const { data, error } = await supabase.from('map_unlocks').select('place_slug').is('profile_id', null);
  if (error) throw error;
  return (data ?? []).map((row) => row.place_slug as string);
}

/** Call after a waypoint is newly mastered. Unlocks any places tied to it that aren't already unlocked, returning the newly-unlocked ones (for a celebration UI). */
export async function unlockPlacesForWaypoint(waypointId: string): Promise<Place[]> {
  const candidates = getPlacesUnlockedByWaypoint(waypointId);
  if (candidates.length === 0) return [];

  const alreadyUnlocked = new Set(await fetchUnlockedPlaceSlugs());
  const newlyUnlocked = candidates.filter((place) => !alreadyUnlocked.has(place.slug));
  if (newlyUnlocked.length === 0) return [];

  const { error } = await supabase.from('map_unlocks').insert(
    newlyUnlocked.map((place) => ({
      profile_id: null,
      place_slug: place.slug,
      waypoint_id: waypointId,
    }))
  );
  if (error) throw error;

  return newlyUnlocked;
}
