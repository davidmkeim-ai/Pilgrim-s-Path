import { supabase } from './supabase';
import { LookupTranslation } from './verseLookup';

interface HintParams {
  reference: string;
  verseText: string;
  missedWords: string[];
}

export async function requestPracticeHint({ reference, verseText, missedWords }: HintParams): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { mode: 'hint', reference, verseText, missedWords },
  });
  if (error) throw error;
  return data.text as string;
}

export async function askBibleQuestion(question: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { mode: 'ask', question },
  });
  if (error) throw error;
  return data.text as string;
}

interface ParsedSpokenReference {
  reference: string;
  translation: LookupTranslation | null;
}

export async function parseSpokenReference(transcript: string): Promise<ParsedSpokenReference> {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { mode: 'parse', transcript },
  });
  if (error) throw error;

  const raw = (data.text as string).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: { reference: string | null; translation: string | null };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't understand that reference");
  }
  if (!parsed.reference) throw new Error("Couldn't understand that reference");

  const translation: LookupTranslation | null =
    parsed.translation === 'ESV' || parsed.translation === 'CSB' ? parsed.translation : null;
  return { reference: parsed.reference, translation };
}
