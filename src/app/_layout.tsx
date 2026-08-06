import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { FamilySignIn } from '@/components/family-sign-in';
import { SupabaseSetupNeeded } from '@/components/supabase-setup-needed';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ProfileProvider } from '@/context/profile-context';
import { isSupabaseConfigured } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) return null;
  if (!session) return <FamilySignIn />;

  return (
    <ProfileProvider>
      <AppTabs />
    </ProfileProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (!isSupabaseConfigured) SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        {isSupabaseConfigured ? (
          <AuthProvider>
            <Gate />
          </AuthProvider>
        ) : (
          <SupabaseSetupNeeded />
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
