import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAllPlaces } from '@/lib/content';
import { fetchUnlockedPlaceSlugs } from '@/lib/mapUnlocks';
import { Place } from '@/lib/types';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function MapPin({ place, unlocked, onOpen }: { place: Place; unlocked: boolean; onOpen: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onOpen}
      style={[styles.pinWrap, { left: `${place.mapX * 100}%`, top: `${place.mapY * 100}%` }]}>
      <View
        style={[
          styles.pinMarker,
          unlocked
            ? { backgroundColor: theme.background }
            : { backgroundColor: theme.backgroundSelected, opacity: 0.6 },
        ]}>
        <Text style={styles.pinGlyph}>{unlocked ? '📍' : '?'}</Text>
      </View>
      {unlocked && (
        <View style={[styles.pinLabel, { backgroundColor: theme.background }]}>
          <ThemedText type="smallBold">{place.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {place.description}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const allPlaces = getAllPlaces();
  const [unlockedSlugs, setUnlockedSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUnlockedSlugs(new Set(await fetchUnlockedPlaceSlugs()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTrail = (place: Place) => {
    router.push({ pathname: '/trails/[slug]', params: { slug: place.trailSlug } });
  };

  const unlockedCount = allPlaces.filter((p) => unlockedSlugs.has(p.slug)).length;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1);
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  const composedGesture = Gesture.Exclusive(doubleTapGesture, Gesture.Simultaneous(panGesture, pinchGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <ThemedText type="title">The Map</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {loading ? 'Loading…' : `${unlockedCount} of ${allPlaces.length} places discovered`}
          </ThemedText>
        </View>

        <View style={[styles.viewport, { backgroundColor: theme.backgroundElement }]}>
          {allPlaces.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No places yet — check back as your family's trails grow.
            </ThemedText>
          ) : (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[styles.mapCanvas, animatedStyle]}>
                {allPlaces.map((place) => (
                  <MapPin
                    key={place.slug}
                    place={place}
                    unlocked={unlockedSlugs.has(place.slug)}
                    onOpen={() => openTrail(place)}
                  />
                ))}
              </Animated.View>
            </GestureDetector>
          )}
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {'Pinch to zoom, drag to pan, double-tap to reset. Tap a pin to open its trail.'}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.half },
  viewport: {
    flex: 1,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  mapCanvas: { flex: 1 },
  emptyText: {
    position: 'absolute',
    top: '50%',
    left: Spacing.three,
    right: Spacing.three,
    textAlign: 'center',
  },
  pinWrap: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -18 }, { translateY: -18 }],
  },
  pinMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinGlyph: { fontSize: 16 },
  pinLabel: {
    marginTop: Spacing.one,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    width: 140,
    gap: 2,
  },
  hint: { textAlign: 'center', paddingVertical: Spacing.two },
});
