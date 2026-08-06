import { Stack } from 'expo-router';

/** Nested stack so tapping into a trail pushes a detail screen within the Trails tab. */
export default function TrailsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[slug]" options={{ title: '' }} />
    </Stack>
  );
}
