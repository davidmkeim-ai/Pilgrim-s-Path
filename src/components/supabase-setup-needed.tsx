import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function SupabaseSetupNeeded() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Connect Supabase
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
          Copy <ThemedText type="code">.env.example</ThemedText> to{' '}
          <ThemedText type="code">.env</ThemedText>, fill in your Supabase project URL and anon
          key, run the migration in{' '}
          <ThemedText type="code">supabase/migrations/0001_init.sql</ThemedText>, then restart the
          app.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center' },
});
