import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import * as Speech from 'expo-speech';

const VOICE_ENABLED_STORAGE_KEY = 'voice-feedback-enabled';

// undefined = not looked up yet; null = looked up, none found on this device.
let cachedVoiceId: string | null | undefined;

/**
 * Picks the best-quality British English voice installed on the device, if
 * any. `language: 'en-GB'` alone (passed in speakAsync below) already gets a
 * British accent from iOS's always-present default voice for that locale --
 * this just upgrades to an "Enhanced" one when the user has downloaded one
 * (Settings -> Accessibility -> Spoken Content -> Voices), so it degrades
 * gracefully rather than failing if none is installed.
 */
async function getPreferredVoiceId(): Promise<string | null> {
  if (cachedVoiceId !== undefined) return cachedVoiceId;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const british = voices
      .filter((v) => v.language?.toLowerCase().startsWith('en-gb'))
      .sort((a, b) => (b.quality === Speech.VoiceQuality.Enhanced ? 1 : 0) - (a.quality === Speech.VoiceQuality.Enhanced ? 1 : 0));
    cachedVoiceId = british[0]?.identifier ?? null;
  } catch {
    cachedVoiceId = null;
  }
  return cachedVoiceId;
}

export async function speakAsync(text: string): Promise<void> {
  const voice = await getPreferredVoiceId();
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      voice: voice ?? undefined,
      language: 'en-GB',
      pitch: 0.98,
      rate: 0.95,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: (error) => reject(error),
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
}

export function feedbackPhraseForScore(score: number): string {
  if (score >= 95) return 'Perfect!';
  if (score >= 70) return "Good job, you got most of it.";
  return "Nice try — let's work on that one a bit more.";
}

export const HELP_TRIGGERS = ['help me', 'help', "i'm stuck", 'im stuck', 'stuck', 'hint', "what's next", 'whats next'];
export const DONE_TRIGGERS = ["i'm done", 'im done', "that's it", 'thats it', 'finished', 'im finished'];

export function matchesTrigger(transcript: string, triggers: string[]): boolean {
  const normalized = transcript.toLowerCase().trim();
  return triggers.some((trigger) => normalized.includes(trigger));
}

export function useVoiceEnabled(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(VOICE_ENABLED_STORAGE_KEY).then((stored) => {
      if (stored !== null) setEnabledState(stored === 'true');
    });
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    AsyncStorage.setItem(VOICE_ENABLED_STORAGE_KEY, String(value));
  }, []);

  return [enabled, setEnabled];
}
