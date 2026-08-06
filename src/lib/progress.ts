import { unlockPlacesForWaypoint } from './mapUnlocks';
import { addDays, initialSrsState, nextSrsState, scoreToQuality, SrsState } from './srs';
import { supabase } from './supabase';
import { MemorizationProgress, Place } from './types';

function rowToProgress(row: any): MemorizationProgress {
  return {
    id: row.id,
    profileId: row.profile_id,
    waypointId: row.waypoint_id,
    status: row.status,
    easeFactor: Number(row.ease_factor),
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    nextReviewAt: row.next_review_at,
    lastReviewedAt: row.last_reviewed_at,
  };
}

export async function fetchDueWaypointIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('memorization_progress')
    .select('waypoint_id')
    .eq('profile_id', profileId)
    .lte('next_review_at', new Date().toISOString())
    .order('next_review_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.waypoint_id as string);
}

export async function fetchProgressForWaypoint(
  profileId: string,
  waypointId: string
): Promise<MemorizationProgress | null> {
  const { data, error } = await supabase
    .from('memorization_progress')
    .select('*')
    .eq('profile_id', profileId)
    .eq('waypoint_id', waypointId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToProgress(data) : null;
}

export async function recordPracticeAttempt(
  profileId: string,
  waypointId: string,
  transcript: string,
  score: number
) {
  const { error } = await supabase
    .from('practice_attempts')
    .insert({ profile_id: profileId, waypoint_id: waypointId, transcript, score });
  if (error) throw error;
}

interface ApplyAttemptResultParams {
  profileId: string;
  profileName: string;
  waypointId: string;
  waypointTitle: string;
  score: number;
}

interface ApplyAttemptResult {
  progress: MemorizationProgress;
  justMastered: boolean;
  unlockedPlaces: Place[];
}

/** Scores an attempt into the SM-2 schedule, and logs a journal milestone the first time a waypoint is mastered. */
export async function applyAttemptResult({
  profileId,
  profileName,
  waypointId,
  waypointTitle,
  score,
}: ApplyAttemptResultParams): Promise<ApplyAttemptResult> {
  const existing = await fetchProgressForWaypoint(profileId, waypointId);
  const wasMastered = existing?.status === 'mastered';

  const currentSrs: SrsState = existing
    ? {
        easeFactor: existing.easeFactor,
        intervalDays: existing.intervalDays,
        repetitions: existing.repetitions,
      }
    : initialSrsState;

  const quality = scoreToQuality(score);
  const next = nextSrsState(currentSrs, quality);
  const nowIso = new Date().toISOString();
  const nextReviewAt = addDays(new Date(), next.intervalDays).toISOString();
  const isMastered = wasMastered || quality >= 4;

  const { data, error } = await supabase
    .from('memorization_progress')
    .upsert(
      {
        profile_id: profileId,
        waypoint_id: waypointId,
        status: isMastered ? 'mastered' : 'learning',
        ease_factor: next.easeFactor,
        interval_days: next.intervalDays,
        repetitions: next.repetitions,
        next_review_at: nextReviewAt,
        last_reviewed_at: nowIso,
      },
      { onConflict: 'profile_id,waypoint_id' }
    )
    .select('*')
    .single();

  if (error) throw error;

  const justMastered = !wasMastered && isMastered;
  let unlockedPlaces: Place[] = [];
  if (justMastered) {
    await supabase.from('journal_entries').insert({
      profile_id: profileId,
      waypoint_id: waypointId,
      kind: 'auto_milestone',
      content: `${profileName} memorized "${waypointTitle}"!`,
    });
    unlockedPlaces = await unlockPlacesForWaypoint(waypointId);
    for (const place of unlockedPlaces) {
      await supabase.from('journal_entries').insert({
        profile_id: profileId,
        waypoint_id: waypointId,
        kind: 'auto_milestone',
        content: `The family map just grew — you unlocked ${place.name}! 🗺️`,
      });
    }
  }

  return { progress: rowToProgress(data), justMastered, unlockedPlaces };
}
