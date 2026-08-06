import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getAllTrails } from '@/lib/content';

export default function TrailsScreen() {
  const router = useRouter();
  const trails = getAllTrails();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title">Trails</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            Themed journeys through Scripture — not strictly Genesis to Revelation.
          </ThemedText>

          {trails.map((trail) => (
            <Pressable
              key={trail.id}
              onPress={() => router.push({ pathname: '/trails/[slug]', params: { slug: trail.slug } })}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="subtitle">{trail.title}</ThemedText>
                <ThemedText type="default" themeColor="textSecondary">
                  {trail.description}
                </ThemedText>
                <ThemedText type="small">{trail.waypoints.length} stops</ThemedText>
              </ThemedView>
            </Pressable>
          ))}
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
});
