import { supabase } from './supabase';

export type LookupTranslation = 'ESV' | 'CSB';

export async function lookupVerse(reference: string, translation: LookupTranslation): Promise<string> {
  const { data, error } = await supabase.functions.invoke('verse-lookup', {
    body: { reference, translation },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.text as string;
}
