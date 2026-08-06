import { supabase } from './supabase';
import { JournalEntry, JournalEntryKind } from './types';

const MEDIA_BUCKET = 'journal-media';

function rowToEntry(row: any): JournalEntry {
  return {
    id: row.id,
    profileId: row.profile_id,
    waypointId: row.waypoint_id,
    kind: row.kind,
    content: row.content,
    mediaUrl: row.media_url,
    createdAt: row.created_at,
  };
}

export async function fetchJournalEntries(limit = 50): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(rowToEntry);
}

export async function addTextJournalEntry(profileId: string, content: string) {
  const { error } = await supabase
    .from('journal_entries')
    .insert({ profile_id: profileId, kind: 'text', content });
  if (error) throw error;
}

/** Uploads a local file (photo or audio) to Storage and logs a journal entry pointing at it. */
export async function addMediaJournalEntry(
  profileId: string,
  localUri: string,
  kind: Extract<JournalEntryKind, 'photo' | 'audio' | 'parent_message'>,
  content?: string
) {
  const extension = localUri.split('.').pop()?.split('?')[0] ?? (kind === 'photo' ? 'jpg' : 'm4a');
  const path = `${profileId}/${Date.now()}.${extension}`;

  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();

  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: kind === 'photo' ? 'image/jpeg' : 'audio/m4a',
  });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from('journal_entries')
    .insert({ profile_id: profileId, kind, content: content ?? null, media_url: path });
  if (insertError) throw insertError;
}

export async function getSignedMediaUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
