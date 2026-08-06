import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useProfiles } from '@/context/profile-context';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { ProfileRole } from '@/lib/types';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join('');
}

export function ProfileSwitcher() {
  const { profiles, activeProfile, setActiveProfileId, refreshProfiles } = useProfiles();
  const theme = useTheme();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ProfileRole>('child');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('profiles').insert({
      name: name.trim(),
      role,
      sort_order: profiles.length,
    });
    setSaving(false);
    setName('');
    setRole('child');
    setAddOpen(false);
    await refreshProfiles();
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {profiles.map((profile) => {
          const selected = profile.id === activeProfile?.id;
          return (
            <Pressable
              key={profile.id}
              onPress={() => setActiveProfileId(profile.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}>
              <View style={[styles.avatar, { backgroundColor: theme.background }]}>
                <ThemedText type="smallBold">{initials(profile.name)}</ThemedText>
              </View>
              <ThemedText type="small">{profile.name}</ThemedText>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setAddOpen(true)}
          style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">+ Add</ThemedText>
        </Pressable>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView type="background" style={styles.modalCard}>
            <ThemedText type="subtitle">Add Family Member</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <View style={styles.roleRow}>
              {(['child', 'parent'] as ProfileRole[]).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={[
                    styles.roleChip,
                    { backgroundColor: role === r ? theme.backgroundSelected : theme.backgroundElement },
                  ]}>
                  <ThemedText type="small">{r === 'child' ? 'Kid' : 'Parent'}</ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddOpen(false)} style={styles.modalButton}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleAdd}
                disabled={saving || !name.trim()}
                style={[styles.modalButton, { opacity: saving || !name.trim() ? 0.5 : 1 }]}>
                <ThemedText type="smallBold">{saving ? 'Saving…' : 'Add'}</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  row: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  roleRow: { flexDirection: 'row', gap: Spacing.two },
  roleChip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.three },
  modalButton: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
});
