import { useLocalSearchParams } from 'expo-router';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import { useTheme } from '@/hooks/use-theme';
import { askBibleQuestion, parseSpokenReference, requestPracticeHint } from '@/lib/aiCoach';
import { getAllTrails, getVerseText } from '@/lib/content';
import { applyAttemptResult, recordPracticeAttempt } from '@/lib/progress';
import { Waypoint } from '@/lib/types';
import { LookupTranslation, lookupVerse } from '@/lib/verseLookup';
import { scoreVerseAttempt, VerseMatchResult } from '@/lib/verseMatch';
import {
  DONE_TRIGGERS,
  feedbackPhraseForScore,
  HELP_TRIGGERS,
  matchesTrigger,
  speakAsync,
  stopSpeaking,
  useVoiceEnabled,
} from '@/lib/voice';

const BUDDY_AVATAR = require('@/assets/bible-buddy/avatar.jpg');
const BUDDY_BANNER = require('@/assets/bible-buddy/banner.jpg');

const AUTO_COMPLETE_SCORE = 90;
const MAX_EMPTY_SEGMENTS = 2;

// Vocabulary hint for the spoken-reference mic -- biases recognition toward
// book names it would otherwise be prone to mishearing (e.g. "Ecclesiastes").
const BIBLE_BOOK_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  'Samuel', 'Kings', 'Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Psalms',
  'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
  'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke',
  'John', 'Acts', 'Romans', 'Corinthians', 'Galatians', 'Ephesians', 'Philippians',
  'Colossians', 'Thessalonians', 'Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
  'Peter', 'Jude', 'Revelation',
];

function findWaypoint(waypointId?: string): Waypoint | undefined {
  return getAllTrails()
    .flatMap((t) => t.waypoints)
    .find((w) => w.id === waypointId);
}

interface VersePracticePanelProps {
  title: string;
  reference: string;
  translation: string;
  verseText: string;
  waypointId: string;
  /** Skip the manual tap-to-start; used by the mic-first voice flow. */
  autoStart?: boolean;
}

/**
 * Recite -> score -> AI hint -> save. Shared by trail-linked and ad hoc practice.
 *
 * Recitation is captured as a chain of single-shot listening segments (not
 * expo-speech-recognition's `continuous: true`, which has a confirmed bug where
 * it stops after ~3s on iOS 18 -- see jamsch/expo-speech-recognition#77). Each
 * pause finalizes a segment; we then decide to keep chaining, give a spoken
 * hint and resume, or finalize the whole attempt, based on trigger phrases and
 * how much of the verse has been covered so far.
 */
function VersePracticePanel({
  title,
  reference,
  translation,
  verseText,
  waypointId,
  autoStart,
}: VersePracticePanelProps) {
  const { activeProfile } = useProfiles();
  const theme = useTheme();
  const [voiceEnabled, setVoiceEnabled] = useVoiceEnabled();

  const verseWords = useMemo(
    () =>
      Array.from(
        new Set(
          verseText
            .split(/\s+/)
            .map((w) => w.replace(/[^A-Za-z']/g, ''))
            .filter((w) => w.length > 1)
        )
      ),
    [verseText]
  );

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [accumulatedDisplay, setAccumulatedDisplay] = useState('');
  const [result, setResult] = useState<VerseMatchResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  const accumulatedRef = useRef('');
  const emptySegmentCountRef = useRef(0);
  const manualStopRef = useRef(false);
  // Tracks whether the current segment already got a 'result' or 'error' --
  // if 'end' fires without either (recognizer gave up hearing nothing, no
  // event beyond 'end'), we'd otherwise go silent with no feedback at all.
  const segmentHandledRef = useRef(false);

  useEffect(() => stopSpeaking, []);

  const startSegment = async () => {
    segmentHandledRef.current = false;
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      segmentHandledRef.current = true;
      setSaveMessage('Microphone/speech permission is needed to practice out loud.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      // iOS-only vocabulary hint -- biases recognition toward the verse's
      // own words (helps a lot with names/less-common words that would
      // otherwise get misheard as something more "common," e.g. "Godzilla").
      contextualStrings: verseWords,
    });
  };

  const finalizeAttempt = (finalTranscript: string) => {
    const scored = scoreVerseAttempt(verseText, finalTranscript);
    setTranscript(finalTranscript);
    setResult(scored);
    if (voiceEnabled) speakAsync(feedbackPhraseForScore(scored.score)).catch(() => {});
  };

  const giveHintDuringRecitation = async () => {
    setHintLoading(true);
    try {
      const scored = scoreVerseAttempt(verseText, accumulatedRef.current);
      const missedWords = scored.words.filter((w) => !w.matched).map((w) => w.word);
      const text = await requestPracticeHint({ reference: `${reference} (${translation})`, verseText, missedWords });
      setHint(text);
      if (voiceEnabled) {
        try {
          await speakAsync(text);
        } catch {
          // Speech failed -- still resume listening below.
        }
      }
    } catch {
      setHint("Couldn't reach the hint helper — try again in a moment.");
    } finally {
      setHintLoading(false);
      startSegment();
    }
  };

  const handleSegment = (segment: string) => {
    const wasManualStop = manualStopRef.current;
    manualStopRef.current = false;

    if (!wasManualStop && matchesTrigger(segment, DONE_TRIGGERS)) {
      finalizeAttempt(accumulatedRef.current);
      return;
    }
    if (!wasManualStop && matchesTrigger(segment, HELP_TRIGGERS)) {
      giveHintDuringRecitation();
      return;
    }

    const trimmed = segment.trim();
    const combined = trimmed ? `${accumulatedRef.current} ${trimmed}`.trim() : accumulatedRef.current;
    accumulatedRef.current = combined;
    setAccumulatedDisplay(combined);

    if (wasManualStop) {
      finalizeAttempt(combined);
      return;
    }

    if (!trimmed) {
      emptySegmentCountRef.current += 1;
      if (emptySegmentCountRef.current >= MAX_EMPTY_SEGMENTS) {
        // Give up waiting for more -- but always finalize with whatever was
        // heard so far rather than leaving the user with no result at all.
        finalizeAttempt(accumulatedRef.current);
        return;
      }
      startSegment();
      return;
    }
    emptySegmentCountRef.current = 0;

    const scored = scoreVerseAttempt(verseText, combined);
    if (scored.score >= AUTO_COMPLETE_SCORE) {
      finalizeAttempt(combined);
    } else {
      startSegment();
    }
  };

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    // No 'result' or 'error' ever came through for this segment -- the
    // recognizer just gave up (too quiet/short). Treat it like an empty
    // segment instead of going silent.
    if (!segmentHandledRef.current) {
      segmentHandledRef.current = true;
      handleSegment('');
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    segmentHandledRef.current = true;
    setListening(false);
    setSaveMessage(`Couldn't hear that: ${event.message}`);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setTranscript(text);
    if (event.isFinal) {
      segmentHandledRef.current = true;
      handleSegment(text);
    }
  });

  const startAttempt = async () => {
    setResult(null);
    setTranscript('');
    setAccumulatedDisplay('');
    setSaveMessage(null);
    setHint(null);
    accumulatedRef.current = '';
    emptySegmentCountRef.current = 0;
    manualStopRef.current = false;
    stopSpeaking();
    if (voiceEnabled) {
      try {
        await speakAsync('Go ahead');
      } catch {
        // Speech failed -- fall through and start listening anyway.
      }
    }
    await startSegment();
  };

  useEffect(() => {
    if (autoStart) startAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  const stopListening = () => {
    manualStopRef.current = true;
    ExpoSpeechRecognitionModule.stop();
  };

  const requestHint = async () => {
    if (!result) return;
    setHintLoading(true);
    setHint(null);
    try {
      const missedWords = result.words.filter((w) => !w.matched).map((w) => w.word);
      const text = await requestPracticeHint({ reference: `${reference} (${translation})`, verseText, missedWords });
      setHint(text);
      if (voiceEnabled) speakAsync(text).catch(() => {});
    } catch {
      setHint("Couldn't reach the hint helper — try again in a moment.");
    } finally {
      setHintLoading(false);
    }
  };

  const saveAttempt = async () => {
    if (!activeProfile || !result) return;
    setSaving(true);
    try {
      await recordPracticeAttempt(activeProfile.id, waypointId, transcript, result.score);
      const { justMastered, unlockedPlaces } = await applyAttemptResult({
        profileId: activeProfile.id,
        profileName: activeProfile.name,
        waypointId,
        waypointTitle: title,
        score: result.score,
      });
      const unlockMessage =
        unlockedPlaces.length > 0
          ? ` You unlocked ${unlockedPlaces.map((p) => p.name).join(', ')} on the map! 🗺️`
          : '';
      setSaveMessage(
        (justMastered
          ? 'Memorized! Added to the family journal 🎉'
          : result.score >= 70
            ? 'Nice work — logged for review.'
            : 'Logged. Keep practicing this one.') + unlockMessage
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <Pressable onPress={() => setVoiceEnabled(!voiceEnabled)}>
          <ThemedText type="default">{voiceEnabled ? '🔊' : '🔇'}</ThemedText>
        </Pressable>
      </View>
      <ThemedText type="default">{verseText}</ThemedText>

      <Pressable
        onPress={listening ? stopListening : startAttempt}
        style={[styles.micButton, { backgroundColor: listening ? '#c0392b' : theme.backgroundSelected }]}>
        <ThemedText type="smallBold">{listening ? 'Stop' : 'Start Reciting'}</ThemedText>
      </Pressable>

      {listening && <ActivityIndicator />}
      {!result && hintLoading && <ActivityIndicator />}

      {!result && accumulatedDisplay ? (
        <ThemedText type="small" themeColor="textSecondary">
          So far: “{accumulatedDisplay}”
        </ThemedText>
      ) : null}
      {!result && listening && transcript ? (
        <ThemedText type="small" themeColor="textSecondary">
          Hearing: “{transcript}”
        </ThemedText>
      ) : null}
      {!result && hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          💡 {hint}
        </ThemedText>
      ) : null}

      {result && (
        <ThemedView style={styles.resultCard}>
          <ThemedText type="subtitle">{result.score}% match</ThemedText>
          <View style={styles.wordWrap}>
            {result.words.map((w, i) => (
              <ThemedText
                key={`${w.word}-${i}`}
                type="default"
                style={{ color: w.matched ? theme.text : '#c0392b' }}>
                {w.word}{' '}
              </ThemedText>
            ))}
          </View>

          {result.score < 70 && !hint && !hintLoading && (
            <Pressable onPress={requestHint}>
              <ThemedText type="linkPrimary">Need a hint?</ThemedText>
            </Pressable>
          )}
          {hintLoading && <ActivityIndicator />}
          {hint && (
            <ThemedText type="small" themeColor="textSecondary">
              💡 {hint}
            </ThemedText>
          )}

          <Pressable
            onPress={saveAttempt}
            disabled={saving}
            style={[styles.saveButton, { backgroundColor: theme.backgroundSelected }]}>
            {saving ? <ActivityIndicator /> : <ThemedText type="smallBold">Log this attempt</ThemedText>}
          </Pressable>
        </ThemedView>
      )}

      {saveMessage && <ThemedText type="default">{saveMessage}</ThemedText>}
    </ThemedView>
  );
}

interface ChatMessage {
  question: string;
  answer: string;
}

function ChatPanel() {
  const theme = useTheme();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    setAsking(true);
    try {
      const answer = await askBibleQuestion(q);
      setMessages((prev) => [...prev, { question: q, answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { question: q, answer: "Couldn't reach the Bible helper — try again in a moment." },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.chatHeader}>
        <Image source={BUDDY_AVATAR} style={styles.chatHeaderAvatar} />
        <View style={styles.chatHeaderText}>
          <ThemedText type="subtitle">Chat</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {'Try "what verse says two are better than one?" — tougher questions get sent to a parent instead.'}
          </ThemedText>
        </View>
      </View>

      {messages.map((m, i) => (
        <View key={i} style={styles.chatTurn}>
          <ThemedText type="smallBold">{m.question}</ThemedText>
          <View style={styles.answerRow}>
            <Image source={BUDDY_AVATAR} style={styles.answerAvatar} />
            <ThemedText type="default" style={styles.answerText}>
              {m.answer}
            </ThemedText>
          </View>
        </View>
      ))}
      {asking && <ActivityIndicator />}

      <TextInput
        value={question}
        onChangeText={setQuestion}
        placeholder="Ask a question…"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        onSubmitEditing={ask}
      />
      <Pressable
        onPress={ask}
        disabled={asking || !question.trim()}
        style={[
          styles.askButton,
          { backgroundColor: theme.backgroundSelected, opacity: asking || !question.trim() ? 0.6 : 1 },
        ]}>
        <ThemedText type="smallBold">Ask</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

interface ResolvedVerse {
  reference: string;
  translation: LookupTranslation;
  verseText: string;
  autoStart: boolean;
}

/**
 * Mic button that drives spoken verse selection end-to-end: listen for the
 * request, parse it via ai-coach's `parse` mode, speak a confirmation while
 * looking the verse up, then hand off to VersePracticePanel (autoStart).
 *
 * Only ever mounted while no verse is resolved (see AdHocPracticePanel) --
 * expo-speech-recognition's events are global, not scoped to a component, so
 * this and VersePracticePanel's own listening must never both be mounted at
 * the same time or they'd both react to the same recognition session.
 */
function VoiceLookupPanel({ onResolved }: { onResolved: (verse: ResolvedVerse) => void }) {
  const theme = useTheme();
  const [state, setState] = useState<'idle' | 'listening' | 'working' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeRef = useRef(false);

  const handleHeardRequest = async (heard: string) => {
    if (!heard.trim()) {
      setState('error');
      setErrorMessage("I didn't catch that — try again.");
      return;
    }
    setState('working');
    try {
      const { reference, translation } = await parseSpokenReference(heard);
      const finalTranslation = translation ?? 'ESV';
      const [, verseText] = await Promise.all([
        speakAsync('Great — just a second while I look that up').catch(() => {}),
        lookupVerse(reference, finalTranslation),
      ]);
      setState('idle');
      onResolved({ reference, translation: finalTranslation, verseText, autoStart: true });
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : "I didn't catch that — try again.");
    }
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current || !event.isFinal) return;
    activeRef.current = false;
    handleHeardRequest(event.results[0]?.transcript ?? '');
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setState('error');
    setErrorMessage(`Couldn't hear that: ${event.message}`);
  });
  useSpeechRecognitionEvent('end', () => {
    // Recognizer gave up without ever firing 'result' or 'error' (too quiet
    // or too short) -- without this we'd be stuck showing "Listening…"
    // forever with no way to know anything went wrong.
    if (!activeRef.current) return;
    activeRef.current = false;
    setState('error');
    setErrorMessage("I didn't catch that — try again.");
  });

  const startListeningForRequest = async () => {
    setErrorMessage(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setState('error');
      setErrorMessage('Microphone/speech permission is needed.');
      return;
    }
    setState('listening');
    activeRef.current = true;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      contextualStrings: BIBLE_BOOK_NAMES,
    });
  };

  const busy = state === 'listening' || state === 'working';

  return (
    <View style={styles.voiceLookupContainer}>
      <Pressable
        onPress={startListeningForRequest}
        disabled={busy}
        style={[styles.micCircle, { opacity: busy ? 0.6 : 1 }]}>
        <Image source={BUDDY_AVATAR} style={styles.micAvatarImage} />
        <View style={[styles.micBadge, { backgroundColor: theme.backgroundSelected }]}>
          <Text style={styles.micBadgeText}>🎙️</Text>
        </View>
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        {state === 'idle' && 'Tap and say a verse, like "John three sixteen"'}
        {state === 'listening' && 'Listening…'}
        {state === 'working' && 'Looking that up…'}
        {state === 'error' && (errorMessage ?? 'Something went wrong.')}
      </ThemedText>
      {busy && <ActivityIndicator />}
    </View>
  );
}

function AdHocPracticePanel() {
  const theme = useTheme();
  const [reference, setReference] = useState('');
  const [translation, setTranslation] = useState<LookupTranslation>('ESV');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedVerse, setResolvedVerse] = useState<ResolvedVerse | null>(null);

  const lookup = async () => {
    if (!reference.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const verseText = await lookupVerse(reference.trim(), translation);
      setResolvedVerse({ reference: reference.trim(), translation, verseText, autoStart: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle">Practice a Verse</ThemedText>

      {!resolvedVerse && (
        <>
          <VoiceLookupPanel onResolved={setResolvedVerse} />

          <ThemedText type="small" themeColor="textSecondary">
            …or type any reference (e.g. "John 3:16") and pick a translation.
          </ThemedText>

          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="e.g. John 3:16"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            onSubmitEditing={lookup}
          />

          <View style={styles.roleRow}>
            {(['ESV', 'CSB'] as LookupTranslation[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTranslation(t)}
                style={[
                  styles.translationChip,
                  { backgroundColor: translation === t ? theme.backgroundSelected : theme.background },
                ]}>
                <ThemedText type="small">{t}</ThemedText>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={lookup}
            disabled={loading || !reference.trim()}
            style={[
              styles.askButton,
              { backgroundColor: theme.backgroundSelected, opacity: loading || !reference.trim() ? 0.6 : 1 },
            ]}>
            {loading ? <ActivityIndicator /> : <ThemedText type="smallBold">Look Up</ThemedText>}
          </Pressable>

          {error && <ThemedText type="small">{error}</ThemedText>}
        </>
      )}

      {resolvedVerse && (
        <>
          <VersePracticePanel
            key={`${resolvedVerse.translation}:${resolvedVerse.reference}`}
            title={resolvedVerse.reference}
            reference={resolvedVerse.reference}
            translation={resolvedVerse.translation}
            verseText={resolvedVerse.verseText}
            waypointId={`adhoc:${resolvedVerse.translation}:${resolvedVerse.reference}`}
            autoStart={resolvedVerse.autoStart}
          />
          <Pressable onPress={() => setResolvedVerse(null)}>
            <ThemedText type="linkPrimary">Practice a different verse</ThemedText>
          </Pressable>
        </>
      )}
    </ThemedView>
  );
}

export default function BibleBuddyScreen() {
  const { waypointId } = useLocalSearchParams<{ waypointId?: string }>();
  const waypoint = findWaypoint(waypointId);
  const verseText = waypoint?.verse ? getVerseText(waypoint.verse.reference, waypoint.verse.translation) : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ImageBackground source={BUDDY_BANNER} style={styles.banner} imageStyle={styles.bannerImage}>
            <View style={styles.bannerScrim} />
            <View style={styles.bannerContent}>
              <Image source={BUDDY_AVATAR} style={styles.bannerAvatar} />
              <View style={styles.bannerTextWrap}>
                <Text style={styles.bannerTitle}>Bible Buddy</Text>
                <Text style={styles.bannerSubtitle}>Your companion for memorizing and finding Scripture</Text>
              </View>
            </View>
          </ImageBackground>

          {waypoint && waypoint.verse && verseText ? (
            <VersePracticePanel
              key={waypoint.id}
              title={waypoint.title}
              reference={waypoint.verse.reference}
              translation={waypoint.verse.translation}
              verseText={verseText}
              waypointId={waypoint.id}
            />
          ) : (
            <>
              <ChatPanel />
              <AdHocPracticePanel />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  micButton: { borderRadius: 999, paddingVertical: Spacing.three, alignItems: 'center' },
  resultCard: { borderRadius: Spacing.three, gap: Spacing.two },
  wordWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  saveButton: { borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  askButton: { borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  chatTurn: { gap: Spacing.half },
  roleRow: { flexDirection: 'row', gap: Spacing.two },
  translationChip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  voiceLookupContainer: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  micCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  micAvatarImage: { width: '100%', height: '100%' },
  micBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  micBadgeText: { fontSize: 14 },

  banner: {
    width: '100%',
    aspectRatio: 2.6,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bannerImage: { resizeMode: 'cover' },
  bannerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,14,8,0.42)',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  bannerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  bannerSubtitle: { color: 'rgba(255,255,255,0.88)', fontSize: 12.5, marginTop: 2 },

  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chatHeaderAvatar: { width: 40, height: 40, borderRadius: 20 },
  chatHeaderText: { flex: 1 },
  answerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  answerAvatar: { width: 24, height: 24, borderRadius: 12, marginTop: 2 },
  answerText: { flex: 1 },
});
