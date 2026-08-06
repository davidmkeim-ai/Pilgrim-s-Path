import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JournalPageEntry } from '@/components/journal-page-entry';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HandFont, inkColorForProfile, JournalColors, JournalDisplayFont } from '@/constants/journal-theme';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import { useTheme } from '@/hooks/use-theme';
import { addMediaJournalEntry, addTextJournalEntry, fetchJournalEntries } from '@/lib/journal';
import { JournalEntry } from '@/lib/types';

const ENTRIES_PER_PAGE = 3;

/** [oldest ... newest] pages, each an array of up to ENTRIES_PER_PAGE entries. */
function paginate(entriesOldestFirst: JournalEntry[]): JournalEntry[][] {
  const pages: JournalEntry[][] = [];
  for (let i = 0; i < entriesOldestFirst.length; i += ENTRIES_PER_PAGE) {
    pages.push(entriesOldestFirst.slice(i, i + ENTRIES_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
}

function Page({
  entries,
  authorName,
  pageNumber,
  align,
}: {
  entries: JournalEntry[];
  authorName: (profileId: string | null) => string;
  pageNumber: number;
  align: 'left' | 'right';
}) {
  return (
    <ImageBackground
      source={require('@/assets/textures/paper.jpg')}
      style={[styles.page, align === 'left' ? styles.pageLeft : styles.pageRight]}
      imageStyle={styles.pageImage}>
      <View style={styles.parchmentTint} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <Text style={styles.emptyPageText}>— nothing written on this page yet —</Text>
        ) : (
          entries.map((entry, i) => (
            <JournalPageEntry
              key={entry.id}
              entry={entry}
              authorName={authorName(entry.profileId)}
              inkColor={entry.profileId ? inkColorForProfile(entry.profileId) : JournalColors.pageText}
              rotation={i % 2 === 0 ? -0.6 : 0.5}
            />
          ))
        )}
      </ScrollView>
      <Text style={[styles.pageNumber, align === 'left' ? styles.pageNumberLeft : styles.pageNumberRight]}>
        {pageNumber}
      </Text>
    </ImageBackground>
  );
}

export default function JournalScreen() {
  const { activeProfile, profiles } = useProfiles();
  const theme = useTheme();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [spreadIndex, setSpreadIndex] = useState<number | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetched = await fetchJournalEntries();
      setEntries(fetched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const oldestFirst = useMemo(() => [...entries].reverse(), [entries]);
  const pages = useMemo(() => paginate(oldestFirst), [oldestFirst]);
  const spreadCount = Math.ceil(pages.length / 2);

  // Open on the most recent spread by default; only jump there once, so
  // turning back a page while new entries arrive doesn't yank you forward.
  useEffect(() => {
    if (spreadIndex === null && spreadCount > 0) setSpreadIndex(spreadCount - 1);
  }, [spreadCount, spreadIndex]);

  const currentSpread = spreadIndex ?? 0;
  const leftPage = pages[currentSpread * 2] ?? [];
  const rightPage = pages[currentSpread * 2 + 1] ?? [];

  const authorName = (profileId: string | null) =>
    profiles.find((p) => p.id === profileId)?.name ?? 'Family';

  const postText = async () => {
    if (!activeProfile || !draft.trim()) return;
    setBusy(true);
    try {
      await addTextJournalEntry(activeProfile.id, draft.trim());
      setDraft('');
      await load();
      setSpreadIndex(null); // re-open on the new latest spread
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async () => {
    if (!activeProfile) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      await addMediaJournalEntry(activeProfile.id, result.assets[0].uri, 'photo');
      await load();
      setSpreadIndex(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (!activeProfile) return;
    if (recording) {
      await recorder.stop();
      setRecording(false);
      if (recorder.uri) {
        setBusy(true);
        try {
          await addMediaJournalEntry(activeProfile.id, recorder.uri, 'parent_message');
          await load();
          setSpreadIndex(null);
        } finally {
          setBusy(false);
        }
      }
    } else {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Family Journal</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {"The scrapbook of your family's journey through Scripture."}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write something for the journal…"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, { color: theme.text }]}
            />
            <View style={styles.composerActions}>
              <Pressable onPress={pickPhoto} disabled={busy}>
                <ThemedText type="linkPrimary">📷 Photo</ThemedText>
              </Pressable>
              {activeProfile?.role === 'parent' && (
                <Pressable onPress={toggleRecording} disabled={busy}>
                  <ThemedText type="linkPrimary">
                    {recording ? '⏹ Stop recording' : '🎙️ Record message'}
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                onPress={postText}
                disabled={busy || !draft.trim()}
                style={[styles.postButton, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText type="smallBold">Post</ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          {loading ? (
            <ActivityIndicator />
          ) : (
            <>
              <ImageBackground
                source={require('@/assets/textures/leather.jpg')}
                style={styles.book}
                imageStyle={styles.bookImage}>
                <View style={styles.leatherTint} pointerEvents="none" />
                <View style={styles.spread}>
                  <Page entries={leftPage} authorName={authorName} pageNumber={currentSpread * 2 + 1} align="left" />
                  <View style={styles.gutter} pointerEvents="none" />
                  <Page entries={rightPage} authorName={authorName} pageNumber={currentSpread * 2 + 2} align="right" />
                </View>
              </ImageBackground>

              <View style={styles.pager}>
                <Pressable
                  onPress={() => setSpreadIndex((i) => Math.max(0, (i ?? 0) - 1))}
                  disabled={currentSpread === 0}
                  style={[styles.pagerButton, currentSpread === 0 && styles.pagerButtonDisabled]}>
                  <Text style={[styles.pagerButtonText, { color: theme.text }]}>‹ Prev</Text>
                </Pressable>
                <Text style={[styles.pagerLabel, { color: theme.textSecondary }]}>
                  Spread {currentSpread + 1} of {spreadCount}
                </Text>
                <Pressable
                  onPress={() => setSpreadIndex((i) => Math.min(spreadCount - 1, (i ?? 0) + 1))}
                  disabled={currentSpread >= spreadCount - 1}
                  style={[styles.pagerButton, currentSpread >= spreadCount - 1 && styles.pagerButtonDisabled]}>
                  <Text style={[styles.pagerButtonText, { color: theme.text }]}>Next ›</Text>
                </Pressable>
              </View>
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
  composer: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  input: { minHeight: 60, fontSize: 16, textAlignVertical: 'top' },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  postButton: {
    marginLeft: 'auto',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },

  book: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
    padding: 10,
  },
  bookImage: { resizeMode: 'cover' },
  leatherTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: JournalColors.leatherOverlay,
  },
  spread: { flex: 1, flexDirection: 'row', borderRadius: 2, overflow: 'hidden' },
  gutter: {
    width: 14,
    marginHorizontal: -7,
    backgroundColor: 'rgba(0,0,0,0.28)',
    zIndex: 2,
  },

  page: { flex: 1, position: 'relative' },
  pageLeft: {},
  pageRight: {},
  pageImage: { resizeMode: 'cover' },
  parchmentTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: JournalColors.parchmentTint,
  },
  pageContent: { padding: Spacing.three, paddingTop: Spacing.four },
  emptyPageText: {
    fontFamily: JournalDisplayFont,
    fontStyle: 'italic',
    fontSize: 13,
    color: JournalColors.pageText,
    opacity: 0.55,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 10,
    fontFamily: JournalDisplayFont,
    fontSize: 11,
    color: JournalColors.pageText,
    opacity: 0.6,
  },
  pageNumberLeft: { left: Spacing.three },
  pageNumberRight: { right: Spacing.three },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerButton: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  pagerButtonDisabled: { opacity: 0.35 },
  pagerButtonText: { fontFamily: HandFont, fontSize: 18 },
  pagerLabel: { fontFamily: JournalDisplayFont, fontSize: 12, opacity: 0.6 },
});
