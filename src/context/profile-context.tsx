import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

const ACTIVE_PROFILE_STORAGE_KEY = 'active-profile-id';

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  loading: boolean;
  error: string | null;
  setActiveProfileId: (id: string) => void;
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .order('sort_order', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const loaded: Profile[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      role: row.role,
      sort_order: row.sort_order,
    }));
    setProfiles(loaded);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY).then((stored) => {
      if (stored) setActiveProfileIdState(stored);
    });
  }, []);

  useEffect(() => {
    if (!activeProfileId && profiles.length > 0) {
      setActiveProfileIdState(profiles[0].id);
    }
  }, [activeProfileId, profiles]);

  const setActiveProfileId = useCallback((id: string) => {
    setActiveProfileIdState(id);
    AsyncStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
  }, []);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  const value = useMemo(
    () => ({ profiles, activeProfile, loading, error, setActiveProfileId, refreshProfiles }),
    [profiles, activeProfile, loading, error, setActiveProfileId, refreshProfiles]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfiles() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfiles must be used within a ProfileProvider');
  return ctx;
}
