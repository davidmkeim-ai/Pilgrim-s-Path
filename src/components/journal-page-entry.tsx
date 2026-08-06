import { useAudioPlayer } from 'expo-audio';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HandFont, JournalColors, JournalDisplayFont } from '@/constants/journal-theme';
import { Spacing } from '@/constants/theme';
import { getSignedMediaUrl } from '@/lib/journal';
import { JournalEntry } from '@/lib/types';

const KIND_LABEL: Record<JournalEntry['kind'], string> = {
  text: '',
  photo: '',
  audio: '🎙️ Voice note',
  parent_message: '💌 Message from a parent',
  auto_milestone: 'Memorized',
};

function EntryPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getSignedMediaUrl(path).then(setUrl);
  }, [path]);
  if (!url) return null;
  return (
    <View style={styles.photoFrame}>
      <Image source={{ uri: url }} style={styles.photo} contentFit="cover" />
    </View>
  );
}

function EntryAudio({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const player = useAudioPlayer(url ?? undefined);
  useEffect(() => {
    getSignedMediaUrl(path).then(setUrl);
  }, [path]);
  return (
    <Pressable onPress={() => player.play()} disabled={!url} style={styles.playButton}>
      <Text style={styles.playText}>▶ Play</Text>
    </Pressable>
  );
}

interface JournalPageEntryProps {
  entry: JournalEntry;
  authorName: string;
  inkColor: string;
  rotation: number;
}

export function JournalPageEntry({ entry, authorName, inkColor, rotation }: JournalPageEntryProps) {
  const isMilestone = entry.kind === 'auto_milestone';

  return (
    <View style={styles.entry}>
      <Text style={styles.meta}>
        {authorName} · {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </Text>

      {isMilestone && (
        <View style={styles.stamp}>
          <View style={styles.stampDot} />
          <Text style={styles.stampText}>{KIND_LABEL.auto_milestone}</Text>
        </View>
      )}
      {entry.kind === 'audio' && <Text style={styles.kindLabel}>{KIND_LABEL.audio}</Text>}
      {entry.kind === 'parent_message' && <Text style={styles.kindLabel}>{KIND_LABEL.parent_message}</Text>}

      {entry.kind === 'photo' && entry.mediaUrl && <EntryPhoto path={entry.mediaUrl} />}

      {entry.content && (
        <Text style={[styles.hand, { color: inkColor, transform: [{ rotate: `${rotation}deg` }] }]}>
          {entry.content}
        </Text>
      )}

      {(entry.kind === 'audio' || entry.kind === 'parent_message') && entry.mediaUrl && (
        <EntryAudio path={entry.mediaUrl} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { marginBottom: Spacing.four, gap: Spacing.one },
  meta: {
    fontFamily: JournalDisplayFont,
    fontSize: 10.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: JournalColors.pageText,
    opacity: 0.6,
  },
  kindLabel: {
    fontFamily: JournalDisplayFont,
    fontStyle: 'italic',
    fontSize: 12,
    color: JournalColors.pageText,
    opacity: 0.75,
    marginTop: 2,
  },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(168,85,46,0.55)',
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 9,
    marginTop: 4,
    marginBottom: 2,
    transform: [{ rotate: '-2deg' }],
  },
  stampDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a8552e' },
  stampText: {
    fontFamily: JournalDisplayFont,
    fontSize: 11,
    letterSpacing: 0.3,
    color: '#a8552e',
  },
  hand: {
    fontFamily: HandFont,
    fontSize: 19,
    lineHeight: 26,
    marginTop: 4,
  },
  photoFrame: {
    width: 118,
    aspectRatio: 4 / 3,
    backgroundColor: '#efe6cf',
    padding: 6,
    alignSelf: 'flex-start',
    marginBottom: Spacing.one,
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  photo: { flex: 1 },
  playButton: { alignSelf: 'flex-start', marginTop: 2 },
  playText: {
    fontFamily: JournalDisplayFont,
    fontWeight: '600',
    fontSize: 13,
    color: JournalColors.pageText,
  },
});
