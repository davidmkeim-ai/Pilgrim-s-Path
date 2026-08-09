import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAllPlaces } from '@/lib/content';
import { fetchUnlockedPlaceSlugs } from '@/lib/mapUnlocks';
import { Place } from '@/lib/types';

const BASE_MAP = require('@/assets/map/base-map.jpg');

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

  const placesBySlug = new Map(allPlaces.map((place) => [place.slug, place]));
  const pathEdges = allPlaces
    .filter((place) => place.connectsFrom && placesBySlug.has(place.connectsFrom))
    .map((place) => ({ from: placesBySlug.get(place.connectsFrom!)!, to: place }));
  const crossLinkEdges = allPlaces.flatMap((place) =>
    (place.crossLinks ?? [])
      .filter((slug) => placesBySlug.has(slug))
      .map((slug) => ({ from: place, to: placesBySlug.get(slug)! }))
  );

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  // Content-local point (in the untransformed map canvas's own coordinate space) that was
  // under the pinch focal point when the gesture started -- recomputed each update so the
  // spot under the fingers stays glued in place as scale changes, instead of zooming toward
  // the canvas center regardless of where the user pinched.
  const focalPointLocal = useSharedValue({ x: 0, y: 0 });

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const clampTranslate = (nextScale: number) => {
    'worklet';
    const maxTranslateX = Math.max(0, (viewportWidth.value * (nextScale - 1)) / 2);
    const maxTranslateY = Math.max(0, (viewportHeight.value * (nextScale - 1)) / 2);
    translateX.value = clamp(translateX.value, -maxTranslateX, maxTranslateX);
    translateY.value = clamp(translateY.value, -maxTranslateY, maxTranslateY);
  };

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      const originX = viewportWidth.value / 2;
      const originY = viewportHeight.value / 2;
      focalPointLocal.value = {
        x: (e.focalX - originX) / scale.value - translateX.value + originX,
        y: (e.focalY - originY) / scale.value - translateY.value + originY,
      };
    })
    .onUpdate((e) => {
      if (viewportWidth.value === 0) return;
      const nextScale = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      const originX = viewportWidth.value / 2;
      const originY = viewportHeight.value / 2;
      translateX.value = (e.focalX - originX) / nextScale - focalPointLocal.value.x + originX;
      translateY.value = (e.focalY - originY) / nextScale - focalPointLocal.value.y + originY;
      scale.value = nextScale;
      clampTranslate(nextScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
      clampTranslate(scale.value);
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

        <View
          style={[styles.viewport, { backgroundColor: theme.backgroundElement }]}
          onLayout={(e) => {
            viewportWidth.value = e.nativeEvent.layout.width;
            viewportHeight.value = e.nativeEvent.layout.height;
          }}>
          <GestureDetector gesture={composedGesture}>
            {/* This wrapper stays untransformed so gesture focal points are measured in stable
                coordinates -- only the Animated.View inside it actually pans/zooms. */}
            <View style={styles.gestureLayer} collapsable={false}>
              <Animated.View style={[styles.mapCanvas, animatedStyle]}>
                <Image source={BASE_MAP} style={styles.mapImage} contentFit="cover" />
                <Svg style={styles.mapImage} viewBox="0 0 1 1" preserveAspectRatio="none">
                  {pathEdges.map((edge) => (
                    <Line
                      key={edge.to.slug}
                      x1={edge.from.mapX}
                      y1={edge.from.mapY}
                      x2={edge.to.mapX}
                      y2={edge.to.mapY}
                      stroke="#3A2410"
                      strokeOpacity={0.35}
                      strokeWidth={5}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {pathEdges.map((edge) => (
                    <Line
                      key={`${edge.to.slug}-dash`}
                      x1={edge.from.mapX}
                      y1={edge.from.mapY}
                      x2={edge.to.mapX}
                      y2={edge.to.mapY}
                      stroke="#F5E6C8"
                      strokeWidth={2.5}
                      strokeDasharray="1,7"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {crossLinkEdges.map((edge) => (
                    <Line
                      key={`${edge.from.slug}-${edge.to.slug}-cross`}
                      x1={edge.from.mapX}
                      y1={edge.from.mapY}
                      x2={edge.to.mapX}
                      y2={edge.to.mapY}
                      stroke="#E8DAB0"
                      strokeOpacity={0.55}
                      strokeWidth={1.5}
                      strokeDasharray="1,5"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </Svg>
                {allPlaces.map((place) => (
                  <MapPin
                    key={place.slug}
                    place={place}
                    unlocked={unlockedSlugs.has(place.slug)}
                    onOpen={() => openTrail(place)}
                  />
                ))}
              </Animated.View>
            </View>
          </GestureDetector>
          {allPlaces.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              No places yet — check back as your family's trails grow.
            </ThemedText>
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
  gestureLayer: { flex: 1 },
  mapCanvas: { flex: 1 },
  mapImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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
