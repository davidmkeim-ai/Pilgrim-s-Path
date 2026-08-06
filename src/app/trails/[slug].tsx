import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import { getTrailBySlug, getVerseText } from '@/lib/content';
import { supabase } from '@/lib/supabase';
import { MemorizationStatus, Waypoint } from '@/lib/types';

function waypointSubtitle(waypoint: Waypoint): string | null {
  if (waypoint.type === 'verse' && waypoint.verse) {
    return getVerseText(waypoint.verse.reference, waypoint.verse.translation);
  }
  return waypoint.body ?? null;
}

const TYPE_LABEL: Record<Waypoint['type'], string> = {
  verse: 'Memorize',
  story: 'Read',
  journal_prompt: 'Journal',
  challenge: 'Challenge',
  creed_line: 'Memorize',
};

export default function TrailDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { activeProfile } = useProfiles();
  const trail = getTrailBySlug(slug);
  const [statusByWaypoint, setStatusByWaypoint] = useState<Record<string, MemorizationStatus>>({});

  useEffect(() => {
    if (!trail || !activeProfile) return;
    const waypointIds = trail.waypoints.map((w) => w.id);
    supabase
      .from('memorization_progress')
      .select('waypoint_id, status')
      .eq('profile_id', activeProfile.id)
      .in('waypoint_id', waypointIds)
      .then(({ data }) => {
        const map: Record<string, MemorizationStatus> = {};
        for (const row of data ?? []) map[row.waypoint_id] = row.status;
        setStatusByWaypoint(map);
      });
  }, [trail, activeProfile]);

  if (!trail) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="default">Trail not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title">{trail.title}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {trail.description}
        </ThemedText>

        {trail.waypoints.map((waypoint, index) => {
          const isMemorizable = waypoint.type === 'verse' || waypoint.type === 'creed_line';
          const status = statusByWaypoint[waypoint.id];
          return (
            <Pressable
              key={waypoint.id}
              disabled={!isMemorizable}
              onPress={() =>
                router.push({ pathname: '/bible-buddy', params: { waypointId: waypoint.id } })
              }>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  {index + 1}. {TYPE_LABEL[waypoint.type]}
                  {status === 'mastered' ? ' · Memorized ✓' : ''}
                </ThemedText>
                <ThemedText type="subtitle">{waypoint.title}</ThemedText>
                <ThemedText type="default">{waypointSubtitle(waypoint)}</ThemedText>
                {isMemorizable && (
                  <ThemedText type="linkPrimary">
                    Practice →
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
