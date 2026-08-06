import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileSwitcher } from '@/components/profile-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import { getAllPlaces, getWaypointById } from '@/lib/content';
import { fetchUnlockedPlaceSlugs } from '@/lib/mapUnlocks';
import { fetchDueWaypointIds } from '@/lib/progress';
import { Waypoint } from '@/lib/types';

export default function HomeScreen() {
  const router = useRouter();
  const { activeProfile } = useProfiles();
  const [dueWaypoints, setDueWaypoints] = useState<Waypoint[]>([]);
  const [loadingDue, setLoadingDue] = useState(false);
  const [unlockedCount, setUnlockedCount] = useState<number | null>(null);
  const totalPlaces = getAllPlaces().length;

  const loadDue = useCallback(async () => {
    if (!activeProfile) return;
    setLoadingDue(true);
    try {
      const ids = await fetchDueWaypointIds(activeProfile.id);
      const waypoints = ids
        .map((id) => getWaypointById(id))
        .filter((w): w is Waypoint => Boolean(w));
      setDueWaypoints(waypoints);
    } finally {
      setLoadingDue(false);
    }
  }, [activeProfile]);

  useEffect(() => {
    loadDue();
  }, [loadDue]);

  useEffect(() => {
    fetchUnlockedPlaceSlugs().then((slugs) => setUnlockedCount(slugs.length));
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ProfileSwitcher />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            {activeProfile ? `Hi, ${activeProfile.name}` : 'Welcome'}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Up for review</ThemedText>
            {loadingDue && <ThemedText type="small">Loading…</ThemedText>}
            {!loadingDue && dueWaypoints.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing due right now — head to Trails to start something new.
              </ThemedText>
            )}
            {dueWaypoints.map((wp) => (
              <Pressable
                key={wp.id}
                onPress={() => router.push({ pathname: '/bible-buddy', params: { waypointId: wp.id } })}
                style={styles.dueRow}>
                <ThemedText type="default">{wp.title}</ThemedText>
                <ThemedText type="linkPrimary">Practice →</ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <Pressable onPress={() => router.push('/map')}>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">The Map</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {unlockedCount === null
                  ? 'Loading…'
                  : `${unlockedCount} of ${totalPlaces} places discovered`}
              </ThemedText>
              <ThemedText type="linkPrimary">Explore the map →</ThemedText>
            </ThemedView>
          </Pressable>
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
  title: { marginTop: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  dueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
